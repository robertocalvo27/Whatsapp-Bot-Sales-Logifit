const campaignFlow = require('./flows/campaignFlow');
const { processAudioMessage } = require('./services/audioService');
const { sendProspectToCRM, updateProspectInCRM } = require('./services/crmService');
const logger = require('./utils/logger');
const db = require('./database');

/**
 * Maneja un mensaje entrante de WhatsApp
 * @param {Object} message - Mensaje de WhatsApp
 * @returns {Promise<Object>} - Respuesta a enviar
 */
async function handleWhatsAppMessage(message) {
  try {
    // Extraer información del mensaje
    const { from, body, type, mediaUrl } = message;
    
    // Normalizar número de teléfono (eliminar espacios, guiones, etc.)
    const phoneNumber = normalizePhoneNumber(from);
    
    // Buscar o crear estado del prospecto
    let prospectState = await getProspectState(phoneNumber);
    
    // Procesar mensaje según su tipo
    let messageText = body;
    let messageContext = null;
    
    // Si es un mensaje de audio, procesarlo
    if (type === 'audio' || type === 'voice' || type === 'ptt') {
      try {
        const audioResult = await processAudioMessage(mediaUrl, prospectState);
        messageText = audioResult.transcription;
        messageContext = audioResult.context;
        
        logger.info(`Audio de ${phoneNumber} transcrito: "${messageText}"`);
      } catch (error) {
        logger.error(`Error al procesar audio de ${phoneNumber}:`, error);
        return {
          text: 'Lo siento, no pude procesar tu mensaje de voz. ¿Podrías escribir tu mensaje?'
        };
      }
    }
    
    // Procesar mensaje con el flujo de campaña
    const { response, newState } = await campaignFlow.processMessage(prospectState, messageText);
    
    // Actualizar estado del prospecto
    await updateProspectState(phoneNumber, newState);
    
    // Si el estado cambió a COMPLETED, enviar al CRM
    if (newState.conversationState === 'completed' && 
        (!prospectState.conversationState || prospectState.conversationState !== 'completed')) {
      try {
        const crmResult = await sendProspectToCRM(newState);
        
        // Guardar ID del CRM en el estado
        if (crmResult.success && crmResult.crmId) {
          await updateProspectState(phoneNumber, {
            ...newState,
            crmId: crmResult.crmId
          });
        }
      } catch (error) {
        logger.error(`Error al enviar prospecto ${phoneNumber} al CRM:`, error);
      }
    }
    
    // Devolver respuesta
    return {
      text: response
    };
  } catch (error) {
    logger.error('Error al manejar mensaje de WhatsApp:', error);
    
    // Respuesta de error genérica
    return {
      text: 'Lo siento, tuve un problema al procesar tu mensaje. Por favor, intenta nuevamente en unos momentos.'
    };
  }
}

/**
 * Normaliza un número de teléfono
 * @param {string} phoneNumber - Número de teléfono
 * @returns {string} - Número normalizado
 */
function normalizePhoneNumber(phoneNumber) {
  // Eliminar caracteres no numéricos
  return phoneNumber.replace(/\D/g, '');
}

/**
 * Obtiene el estado actual de un prospecto
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Promise<Object>} - Estado del prospecto
 */
async function getProspectState(phoneNumber) {
  try {
    // Buscar en la base de datos
    const prospect = await db.collection('prospects').findOne({ phoneNumber });
    
    // Si existe, devolver estado
    if (prospect) {
      return prospect;
    }
    
    // Si no existe, crear nuevo estado
    const newProspect = {
      phoneNumber,
      createdAt: new Date(),
      lastInteraction: new Date()
    };
    
    // Guardar en la base de datos
    await db.collection('prospects').insertOne(newProspect);
    
    return newProspect;
  } catch (error) {
    logger.error(`Error al obtener estado del prospecto ${phoneNumber}:`, error);
    
    // Devolver estado básico en caso de error
    return {
      phoneNumber,
      lastInteraction: new Date()
    };
  }
}

/**
 * Actualiza el estado de un prospecto
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} newState - Nuevo estado
 * @returns {Promise<boolean>} - True si se actualizó correctamente
 */
async function updateProspectState(phoneNumber, newState) {
  try {
    // Actualizar en la base de datos
    await db.collection('prospects').updateOne(
      { phoneNumber },
      { $set: newState }
    );
    
    return true;
  } catch (error) {
    logger.error(`Error al actualizar estado del prospecto ${phoneNumber}:`, error);
    return false;
  }
}

module.exports = {
  handleWhatsAppMessage
}; 