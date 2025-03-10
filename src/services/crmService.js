const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Envía un prospecto al CRM
 * @param {Object} prospectState - Estado del prospecto
 * @returns {Promise<Object>} - Respuesta del CRM
 */
async function sendProspectToCRM(prospectState) {
  try {
    // Verificar que tenemos la información mínima necesaria
    if (!prospectState.phoneNumber) {
      throw new Error('El prospecto no tiene número de teléfono');
    }
    
    // Preparar datos para el CRM
    const crmData = {
      // Datos básicos del prospecto
      name: prospectState.name || 'Prospecto WhatsApp',
      phone: prospectState.phoneNumber,
      email: prospectState.emails ? prospectState.emails[0] : null,
      
      // Información de la empresa
      company: prospectState.companyInfo ? prospectState.companyInfo.razonSocial : null,
      ruc: prospectState.companyInfo ? prospectState.companyInfo.ruc : null,
      
      // Datos de calificación
      qualificationAnswers: prospectState.qualificationAnswers || {},
      interestScore: prospectState.interestAnalysis ? prospectState.interestAnalysis.interestScore : null,
      
      // Datos de la cita (si existe)
      appointmentDate: prospectState.appointmentDetails ? prospectState.appointmentDetails.date : null,
      appointmentTime: prospectState.appointmentDetails ? prospectState.appointmentDetails.time : null,
      appointmentLink: prospectState.appointmentDetails ? prospectState.appointmentDetails.meetLink : null,
      
      // Metadatos
      source: 'whatsapp_bot',
      campaignType: prospectState.campaignType || 'unknown',
      createdAt: new Date().toISOString()
    };
    
    // Enviar datos al CRM
    // Nota: Reemplazar con la URL real de tu CRM
    const response = await axios.post(
      process.env.CRM_API_URL || 'https://api.tucrm.com/leads',
      crmData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRM_API_KEY || ''}`
        }
      }
    );
    
    logger.info(`Prospecto enviado al CRM: ${prospectState.phoneNumber}`);
    
    return {
      success: true,
      crmId: response.data.id || null,
      message: 'Prospecto enviado al CRM correctamente'
    };
  } catch (error) {
    logger.error('Error al enviar prospecto al CRM:', error);
    
    // Si estamos en modo de desarrollo o prueba, simular respuesta exitosa
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return {
        success: true,
        crmId: `mock-crm-id-${Date.now()}`,
        message: 'Prospecto simulado en modo desarrollo'
      };
    }
    
    return {
      success: false,
      error: error.message,
      message: 'No se pudo enviar el prospecto al CRM'
    };
  }
}

/**
 * Actualiza un prospecto en el CRM
 * @param {string} crmId - ID del prospecto en el CRM
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object>} - Respuesta del CRM
 */
async function updateProspectInCRM(crmId, updateData) {
  try {
    // Verificar que tenemos un ID de CRM
    if (!crmId) {
      throw new Error('No se proporcionó un ID de CRM');
    }
    
    // Enviar datos al CRM
    // Nota: Reemplazar con la URL real de tu CRM
    const response = await axios.put(
      `${process.env.CRM_API_URL || 'https://api.tucrm.com/leads'}/${crmId}`,
      updateData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRM_API_KEY || ''}`
        }
      }
    );
    
    logger.info(`Prospecto actualizado en el CRM: ${crmId}`);
    
    return {
      success: true,
      message: 'Prospecto actualizado en el CRM correctamente'
    };
  } catch (error) {
    logger.error(`Error al actualizar prospecto en el CRM (${crmId}):`, error);
    
    // Si estamos en modo de desarrollo o prueba, simular respuesta exitosa
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return {
        success: true,
        message: 'Prospecto simulado actualizado en modo desarrollo'
      };
    }
    
    return {
      success: false,
      error: error.message,
      message: 'No se pudo actualizar el prospecto en el CRM'
    };
  }
}

module.exports = {
  sendProspectToCRM,
  updateProspectInCRM
}; 