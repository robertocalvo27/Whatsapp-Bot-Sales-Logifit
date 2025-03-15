/**
 * Servicio para la integración con Google Sheets a través de Make.com
 * Este servicio permite guardar la información de los prospectos en una hoja de cálculo
 * para hacer seguimiento y análisis de datos.
 */

const axios = require('axios');
const logger = require('../utils/logger');

// URL del webhook de Make.com para la integración con Google Sheets
const SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

/**
 * Guarda o actualiza los datos de un prospecto en Google Sheets
 * @param {Object} prospectData - Datos del prospecto
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function saveProspectToSheets(prospectData) {
  try {
    if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      return { success: false, error: 'URL del webhook de Google Sheets no configurada' };
    }

    const now = new Date();
    const formattedDate = now.toISOString();

    // Determinar si el prospecto tiene cita programada
    const hasMeeting = prospectData.appointmentCreated === true;
    
    // Calcular calificación de interés (1-10)
    const interestScore = prospectData.interestAnalysis?.interestScore || 0;
    
    // Obtener tamaño de flota
    const fleetSize = prospectData.qualificationAnswers?.fleetSize || 'No especificado';
    
    // Determinar estado del prospecto
    let status = 'Nuevo';
    if (prospectData.conversationState === 'closed') {
      status = hasMeeting ? 'Cita Programada' : 'Cerrado';
    } else if (prospectData.conversationState === 'closing') {
      status = hasMeeting ? 'Cita Programada' : 'En Seguimiento';
    } else if (prospectData.conversationState) {
      status = 'En Conversación';
    }

    // Preparar datos para enviar al webhook - Asegurarse que los nombres coincidan exactamente con los campos en Make.com
    const data = {
      Fecha: formattedDate,
      Source: prospectData.source || 'WhatsApp',
      campaign_name: prospectData.campaignName || 'Campaña WhatsApp',
      Nombre_Prospecto: prospectData.name || 'No proporcionado',
      Empresa: prospectData.company || 'No proporcionada',
      Telefono: prospectData.phoneNumber || 'No proporcionado',
      Flota: fleetSize,
      Calificacion: interestScore,
      Cita: hasMeeting ? 'SI' : 'NO',
      fecha_cita: hasMeeting ? prospectData.appointmentDetails?.date || '' : '',
      hora_cita: hasMeeting ? prospectData.appointmentDetails?.time || '' : '',
      Estatus_cita: status,
      // Campos adicionales para Make.com
      Timestamp: now.toISOString(),
      Accion: 'registro_prospecto'
    };

    // Loguear los datos que se envían para depuración
    logger.debug('Enviando datos a Google Sheets:', JSON.stringify(data, null, 2));

    // Enviar datos al webhook
    const response = await axios.post(process.env.GOOGLE_SHEETS_WEBHOOK_URL, data);

    if (response.status === 200) {
      logger.info('Datos enviados correctamente a Google Sheets');
      return { success: true, data: response.data };
    } else {
      logger.error(`Error al guardar en Google Sheets: ${response.statusText}`);
      return { success: false, error: `Error al guardar en Google Sheets: ${response.statusText}` };
    }
  } catch (error) {
    logger.error('Error al guardar en Google Sheets:', error);
    return { success: false, error: error.message };
  }
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
    if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      return { success: false, error: 'URL del webhook de Google Sheets no configurada' };
    }
    
    // Combinar datos
    const prospectData = {
      ...updatedData,
      phoneNumber
    };
    
    // Determinar si el prospecto tiene cita programada
    const hasMeeting = prospectData.appointmentCreated === true;
    
    // Calcular calificación de interés (1-10)
    const interestScore = prospectData.interestAnalysis?.interestScore || 0;
    
    // Obtener tamaño de flota
    const fleetSize = prospectData.qualificationAnswers?.fleetSize || 'No especificado';
    
    // Determinar estado del prospecto
    let status = 'Actualizado';
    if (prospectData.conversationState === 'closed') {
      status = hasMeeting ? 'Cita Programada' : 'Cerrado';
    } else if (prospectData.conversationState === 'closing') {
      status = hasMeeting ? 'Cita Programada' : 'En Seguimiento';
    } else if (prospectData.conversationState) {
      status = 'En Conversación';
    }

    // Preparar datos para enviar al webhook - Asegurarse que los nombres coincidan exactamente con los campos en Make.com
    const data = {
      Fecha: new Date().toISOString(),
      Source: prospectData.source || 'WhatsApp',
      campaign_name: prospectData.campaignName || 'Campaña WhatsApp',
      Nombre_Prospecto: prospectData.name || 'No proporcionado',
      Empresa: prospectData.company || 'No proporcionada',
      Telefono: phoneNumber,
      Flota: fleetSize,
      Calificacion: interestScore,
      Cita: hasMeeting ? 'SI' : 'NO',
      fecha_cita: hasMeeting ? prospectData.appointmentDetails?.date || '' : '',
      hora_cita: hasMeeting ? prospectData.appointmentDetails?.time || '' : '',
      Estatus_cita: status,
      // Campos adicionales para Make.com
      Timestamp: new Date().toISOString(),
      Accion: 'actualizacion_prospecto'
    };
    
    // Loguear los datos que se envían para depuración
    logger.debug('Actualizando datos en Google Sheets:', JSON.stringify(data, null, 2));
    
    // Enviar datos al webhook
    const response = await axios.post(process.env.GOOGLE_SHEETS_WEBHOOK_URL, data);
    
    if (response.status === 200) {
      logger.info('Datos actualizados correctamente en Google Sheets');
      return { success: true, data: response.data };
    } else {
      logger.error(`Error al actualizar en Google Sheets: ${response.statusText}`);
      return { success: false, error: `Error al actualizar en Google Sheets: ${response.statusText}` };
    }
  } catch (error) {
    logger.error(`Error al actualizar datos del prospecto ${phoneNumber} en Google Sheets:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  saveProspectToSheets,
  updateProspectInSheets
}; 