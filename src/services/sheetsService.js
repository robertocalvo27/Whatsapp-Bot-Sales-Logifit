/**
 * Servicio para la integración con Google Sheets a través de Make.com
 * Este servicio permite guardar la información de los prospectos en una hoja de cálculo
 * para hacer seguimiento y análisis de datos.
 */

const axios = require('axios');
const logger = require('../utils/logger');

// URL del webhook de Make.com para la integración con Google Sheets
const SHEETS_WEBHOOK_URL = process.env.MAKE_SHEETS_WEBHOOK_URL;

/**
 * Guarda la información de un prospecto en Google Sheets
 * @param {Object} prospectData - Datos del prospecto a guardar
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function saveProspectToSheets(prospectData) {
  try {
    // Verificar si tenemos la URL del webhook configurada
    if (!SHEETS_WEBHOOK_URL) {
      logger.warn('No se ha configurado la URL del webhook para Google Sheets');
      return {
        success: false,
        error: 'URL_NOT_CONFIGURED',
        message: 'No se ha configurado la URL del webhook para Google Sheets'
      };
    }

    // Formatear los datos para el webhook
    const formattedData = formatProspectData(prospectData);
    
    // Enviar los datos al webhook
    const response = await axios.post(SHEETS_WEBHOOK_URL, formattedData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    // Verificar la respuesta
    if (response.status >= 200 && response.status < 300) {
      logger.info('Datos del prospecto guardados correctamente en Google Sheets');
      return {
        success: true,
        data: response.data
      };
    } else {
      logger.error(`Error al guardar datos en Google Sheets: ${response.status}`);
      return {
        success: false,
        error: 'API_ERROR',
        status: response.status,
        message: 'Error al guardar datos en Google Sheets'
      };
    }
  } catch (error) {
    logger.error('Error al guardar datos del prospecto en Google Sheets:', error);
    return {
      success: false,
      error: 'EXCEPTION',
      message: error.message,
      details: error.response ? error.response.data : null
    };
  }
}

/**
 * Formatea los datos del prospecto para enviarlos a Google Sheets
 * @param {Object} prospectData - Datos del prospecto
 * @returns {Object} - Datos formateados para el webhook
 */
function formatProspectData(prospectData) {
  // Extraer datos relevantes del prospecto
  const {
    phoneNumber,
    name,
    company,
    emails = [],
    qualificationAnswers = {},
    interestAnalysis = {},
    appointmentDetails = {},
    conversationState,
    lastInteraction,
    firstInteraction,
    source = 'WhatsApp'
  } = prospectData;
  
  // Formatear la fecha actual
  const now = new Date();
  const formattedDate = now.toISOString();
  
  // Crear objeto con los datos formateados
  return {
    // Datos básicos del prospecto
    Telefono: phoneNumber,
    Nombre: name || 'No proporcionado',
    Empresa: company || 'No proporcionada',
    Email: emails && emails.length > 0 ? emails[0] : 'No proporcionado',
    
    // Datos de calificación
    Cargo: qualificationAnswers.role || 'No proporcionado',
    Tamano_Flota: qualificationAnswers.fleetSize || 'No proporcionado',
    Solucion_Actual: qualificationAnswers.currentSolution || 'No proporcionado',
    Timeline_Decision: qualificationAnswers.decisionTimeline || 'No proporcionado',
    
    // Análisis de interés
    Interes_Alto: interestAnalysis.highInterest ? 'Sí' : 'No',
    Puntuacion_Interes: interestAnalysis.interestScore || 0,
    Razonamiento: interestAnalysis.reasoning || 'No disponible',
    
    // Datos de la cita (si existe)
    Cita_Programada: appointmentDetails.date ? 'Sí' : 'No',
    Fecha_Cita: appointmentDetails.date || 'No programada',
    Hora_Cita: appointmentDetails.time || 'No programada',
    
    // Metadatos
    Estado_Conversacion: conversationState || 'Nuevo',
    Fecha_Registro: formattedDate,
    Ultima_Interaccion: lastInteraction ? new Date(lastInteraction).toISOString() : formattedDate,
    Primera_Interaccion: firstInteraction ? new Date(firstInteraction).toISOString() : formattedDate,
    Fuente: source,
    
    // Campos adicionales para Make.com
    Timestamp: formattedDate,
    Accion: 'registro_prospecto'
  };
}

/**
 * Actualiza la información de un prospecto existente en Google Sheets
 * @param {string} phoneNumber - Número de teléfono del prospecto (identificador único)
 * @param {Object} updatedData - Datos actualizados del prospecto
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function updateProspectInSheets(phoneNumber, updatedData) {
  try {
    // Verificar si tenemos la URL del webhook configurada
    if (!SHEETS_WEBHOOK_URL) {
      logger.warn('No se ha configurado la URL del webhook para Google Sheets');
      return {
        success: false,
        error: 'URL_NOT_CONFIGURED',
        message: 'No se ha configurado la URL del webhook para Google Sheets'
      };
    }
    
    // Formatear los datos para el webhook
    const formattedData = formatProspectData({
      ...updatedData,
      phoneNumber
    });
    
    // Añadir acción de actualización
    formattedData.Accion = 'actualizacion_prospecto';
    
    // Enviar los datos al webhook
    const response = await axios.post(SHEETS_WEBHOOK_URL, formattedData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    // Verificar la respuesta
    if (response.status >= 200 && response.status < 300) {
      logger.info(`Datos del prospecto ${phoneNumber} actualizados correctamente en Google Sheets`);
      return {
        success: true,
        data: response.data
      };
    } else {
      logger.error(`Error al actualizar datos en Google Sheets: ${response.status}`);
      return {
        success: false,
        error: 'API_ERROR',
        status: response.status,
        message: 'Error al actualizar datos en Google Sheets'
      };
    }
  } catch (error) {
    logger.error(`Error al actualizar datos del prospecto ${phoneNumber} en Google Sheets:`, error);
    return {
      success: false,
      error: 'EXCEPTION',
      message: error.message,
      details: error.response ? error.response.data : null
    };
  }
}

module.exports = {
  saveProspectToSheets,
  updateProspectInSheets
}; 