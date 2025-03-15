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

    // Preparar datos para enviar al webhook
    const data = {
      Date: formattedDate,
      Source: prospectData.source || 'WhatsApp',
      'Nombre campaña': prospectData.campaignName || 'Campaña WhatsApp',
      'Nombre Prospecto': prospectData.name || 'No proporcionado',
      Empresa: prospectData.company || 'No proporcionada',
      Telefono: prospectData.phoneNumber || 'No proporcionado',
      'Tamaño Flota': fleetSize,
      'Calificacion interes': interestScore,
      'Cita (SI/NO)': hasMeeting ? 'SI' : 'NO',
      Fecha: hasMeeting ? prospectData.appointmentDetails?.date || '' : '',
      Hora: hasMeeting ? prospectData.appointmentDetails?.time || '' : '',
      Estatus: status
    };

    // Enviar datos al webhook
    const response = await axios.post(process.env.GOOGLE_SHEETS_WEBHOOK_URL, data);

    if (response.status === 200) {
      return { success: true, data: response.data };
    } else {
      return { success: false, error: `Error al guardar en Google Sheets: ${response.statusText}` };
    }
  } catch (error) {
    console.error('Error al guardar en Google Sheets:', error);
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

    // Preparar datos para enviar al webhook
    const data = {
      Date: new Date().toISOString(),
      Source: prospectData.source || 'WhatsApp',
      'Nombre campaña': prospectData.campaignName || 'Campaña WhatsApp',
      'Nombre Prospecto': prospectData.name || 'No proporcionado',
      Empresa: prospectData.company || 'No proporcionada',
      Telefono: phoneNumber,
      'Tamaño Flota': fleetSize,
      'Calificacion interes': interestScore,
      'Cita (SI/NO)': hasMeeting ? 'SI' : 'NO',
      Fecha: hasMeeting ? prospectData.appointmentDetails?.date || '' : '',
      Hora: hasMeeting ? prospectData.appointmentDetails?.time || '' : '',
      Estatus: status,
      
      // Campos adicionales para Make.com
      Timestamp: new Date().toISOString(),
      Accion: 'actualizacion_prospecto'
    };
    
    // Enviar datos al webhook
    const response = await axios.post(process.env.GOOGLE_SHEETS_WEBHOOK_URL, data);
    
    if (response.status === 200) {
      return { success: true, data: response.data };
    } else {
      return { success: false, error: `Error al actualizar en Google Sheets: ${response.statusText}` };
    }
  } catch (error) {
    console.error(`Error al actualizar datos del prospecto ${phoneNumber} en Google Sheets:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  saveProspectToSheets,
  updateProspectInSheets
}; 