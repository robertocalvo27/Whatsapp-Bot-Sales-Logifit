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
    
    // Enviar los datos al webhook
    const response = await axios.post(MAKE_WEBHOOK_URL, appointmentData);
    
    logger.info('Respuesta de Make.com recibida:', response.data);
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    logger.error('Error al enviar datos a Make.com:', error);
    
    return {
      success: false,
      error: error.message
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
  
  // Formatear fechas para Make.com
  const fechaInicio = startDateTime.format('YYYY-MM-DD HH:mm:ss');
  const fechaFin = endDateTime.format('YYYY-MM-DD HH:mm:ss');
  
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
  }
  
  // Formatear los datos exactamente como los espera Make.com
  return {
    // 1. Título de la reunión
    Titulo: `Demostración Logifit - ${prospectState.name || 'Cliente'}`,
    
    // 2. Empresa
    Empresa: prospectState.company || 'Empresa del cliente',
    
    // 3. Participantes (array de objetos con nombre y email)
    Participantes: participantes,
    
    // 4. Teléfono
    Telefono: prospectState.phoneNumber,
    
    // 5. Fecha de inicio
    Fecha_de_Inicio: fechaInicio,
    
    // 6. Fecha de fin
    Fecha_Fin: fechaFin,
    
    // 7. Plataforma de reunión
    Plataforma_Reunion: 'Google Meet',
    
    // 8. Duración (en minutos)
    Duracion: 30,
    
    // 9. Enlace (se dejará vacío, lo generará Make.com)
    Enlace: '',
    
    // Datos adicionales que pueden ser útiles
    Metadata: {
      source: 'whatsapp-bot',
      timestamp: new Date().toISOString(),
      timezone: prospectState.timezone || 'America/Lima',
      country: prospectState.country || 'PE',
      campaignType: prospectState.campaignType,
      qualificationAnswers: prospectState.qualificationAnswers || {},
      interestScore: prospectState.interestAnalysis?.interestScore || 0
    }
  };
}

module.exports = {
  sendAppointmentToMake,
  formatAppointmentData
}; 