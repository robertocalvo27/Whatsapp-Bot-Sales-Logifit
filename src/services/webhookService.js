const axios = require('axios');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

/**
 * Servicio para manejar la integración con make.com mediante webhooks
 */

// URL del webhook de Make.com (se debe configurar en .env)
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL || '';

/**
 * Envía los datos de la cita a Make.com para crear un evento en Google Calendar
 * @param {Object} appointmentData - Datos de la cita
 * @returns {Promise<Object>} - Respuesta del webhook
 */
async function sendAppointmentToMake(appointmentData) {
  try {
    // Verificar si hay una URL de webhook configurada
    if (!MAKE_WEBHOOK_URL) {
      logger.warn('No se ha configurado la URL del webhook de Make.com');
      return {
        success: false,
        error: 'No se ha configurado la URL del webhook'
      };
    }
    
    logger.info('Enviando datos de cita a Make.com:', appointmentData);
    
    // Verificar que los datos contengan la información necesaria
    if (!appointmentData.Participantes || appointmentData.Participantes.length < 2) {
      logger.warn('Los datos no contienen suficientes participantes:', appointmentData.Participantes);
      return {
        success: false,
        error: 'Faltan participantes en los datos de la cita'
      };
    }
    
    // Verificar que el correo del cliente esté presente
    const clienteEmail = appointmentData.Participantes.find(p => p.email !== process.env.VENDEDOR_EMAIL)?.email;
    if (!clienteEmail) {
      logger.warn('No se encontró el correo del cliente en los participantes');
      return {
        success: false,
        error: 'No se encontró el correo del cliente'
      };
    }
    
    logger.info(`Correo del cliente para la invitación: ${clienteEmail}`);
    
    // Configurar timeout más largo para la solicitud
    const axiosConfig = {
      timeout: 15000, // 15 segundos
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    // Enviar los datos al webhook
    logger.info(`Enviando solicitud POST a: ${MAKE_WEBHOOK_URL}`);
    const response = await axios.post(MAKE_WEBHOOK_URL, appointmentData, axiosConfig);
    
    logger.info(`Respuesta de Make.com recibida (status ${response.status}):`, response.data);
    
    // Analizar la respuesta para verificar si fue exitosa
    let success = response.status >= 200 && response.status < 300;
    
    // Verificar si la respuesta contiene un Hangout Link (indicador de que se creó el evento en Google Calendar)
    const hasHangoutLink = response.data && response.data.Hangout_Link;
    
    if (hasHangoutLink) {
      logger.info(`✅ Evento creado exitosamente en Google Calendar con Hangout Link: ${response.data.Hangout_Link}`);
    } else if (success) {
      logger.warn('⚠️ La respuesta de Make.com no contiene un Hangout Link, pero el código de estado es exitoso');
    }
    
    // Verificar si hay algún mensaje de error en la respuesta
    const errorMessage = response.data && response.data.error;
    if (errorMessage) {
      logger.warn(`⚠️ La respuesta de Make.com contiene un mensaje de error: ${errorMessage}`);
      success = false;
    }
    
    return {
      success: success,
      data: response.data,
      hangoutLink: hasHangoutLink ? response.data.Hangout_Link : null,
      statusCode: response.status
    };
  } catch (error) {
    logger.error('Error al enviar datos a Make.com:', error.message);
    
    // Mostrar más detalles del error si están disponibles
    if (error.response) {
      logger.error('Detalles de la respuesta de error:', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      logger.error('No se recibió respuesta del servidor');
    }
    
    return {
      success: false,
      error: error.message,
      details: error.response ? error.response.data : null
    };
  }
}

/**
 * Prepara los datos de la cita para enviar a Make.com en el formato exacto que espera
 * @param {Object} prospectState - Estado del prospecto
 * @param {Object} appointmentDetails - Detalles de la cita
 * @returns {Object} - Datos formateados para el webhook
 */
function formatAppointmentData(prospectState, appointmentDetails) {
  // Obtener el nombre del vendedor desde las variables de entorno
  const vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Asesor Logifit';
  const vendedorEmail = process.env.VENDEDOR_EMAIL || 'ventas@logifit.pe';
  
  // Calcular la fecha de fin (30 minutos después de la fecha de inicio)
  const startDateTime = moment(appointmentDetails.dateTime);
  const endDateTime = startDateTime.clone().add(30, 'minutes');
  
  // Formatear fechas exactamente como en el ejemplo exitoso
  const fechaInicioFormateada = `${startDateTime.date()} de ${startDateTime.locale('es').format('MMMM')} de ${startDateTime.year()} ${startDateTime.hour()}:${startDateTime.format('mm')}`;
  const fechaFinFormateada = `${endDateTime.date()} de ${endDateTime.locale('es').format('MMMM')} de ${endDateTime.year()} ${endDateTime.hour()}:${endDateTime.format('mm')}`;
  
  // Crear array de participantes
  const participantes = [
    {
      nombre: vendedorNombre,
      email: vendedorEmail
    }
  ];
  
  // Añadir el prospecto a los participantes si tenemos su email
  if (prospectState.emails && prospectState.emails.length > 0) {
    participantes.push({
      nombre: prospectState.name || 'Cliente',
      email: prospectState.emails[0]
    });
    logger.info(`Añadiendo participante cliente: ${prospectState.name} <${prospectState.emails[0]}>`);
  } else {
    logger.warn('No se encontraron emails en el estado del prospecto:', prospectState);
  }
  
  // Título del evento
  const tituloEvento = `Demostración Logifit - ${prospectState.name || 'Cliente'}`;
  
  // Descripción del evento
  const descripcionEvento = `🚀 ¡Únete a nuestra sesión de Logifit! 🚀✨ Logifit es una moderna herramienta tecnológica inteligente adecuada para la gestión del descanso y salud de los colaboradores. Brindamos servicios de monitoreo preventivo como apoyo a la mejora de la salud y prevención de accidentes, con la finalidad de salvaguardar la vida de los trabajadores y ayudarles a alcanzar el máximo de su productividad en el proyecto. ✨👨‍💼👩‍💼 ¡Tu bienestar es nuestra prioridad! 🔧👍`;
  
  // Formatear los datos exactamente como los espera Make.com
  // Basado en el ejemplo exitoso mostrado en las capturas de pantalla
  const formattedData = {
    // Datos para el webhook y filtro
    Titulo: tituloEvento,
    Empresa: prospectState.company || 'Empresa del cliente',
    Participantes: participantes,
    Telefono: prospectState.phoneNumber,
    "Plataforma Reunion": "Google Meet",
    
    // Datos para el módulo de Google Calendar - EXACTAMENTE como en el ejemplo exitoso
    "Start Date": fechaInicioFormateada,
    "End Date": fechaFinFormateada,
    
    // Usar el formato exacto que se ve en la captura de pantalla exitosa
    "Fecha de Inicio": startDateTime.utc().format('YYYY-MM-DDTHH:mm:ss.000000Z'),
    "Fecha Fin": endDateTime.utc().format('YYYY-MM-DDTHH:mm:ss.000000Z'),
    
    // Mantener estos campos por compatibilidad
    "start": startDateTime.utc().format('YYYY-MM-DDTHH:mm:ss.000000Z'),
    "end": endDateTime.utc().format('YYYY-MM-DDTHH:mm:ss.000000Z'),
    
    "Create an Event": "detail",
    "Color": 1,
    "Event Name": tituloEvento,
    "Calendar ID": vendedorEmail,
    "Duration": "00:30:00",
    "Use the default reminder settings for events on this calendar": true,
    "Visibility": "default",
    "All Day Event": false,
    "Description": descripcionEvento,
    "Send notifications about the event changes to": "all",
    "Show me as": "opaque",
    "Add Google Meet Video Conferencing": true
  };
  
  logger.info('Datos formateados para Make.com:', JSON.stringify(formattedData, null, 2));
  
  return formattedData;
}

module.exports = {
  sendAppointmentToMake,
  formatAppointmentData
}; 