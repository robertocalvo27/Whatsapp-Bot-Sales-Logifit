const { logger } = require('./logger');

/**
 * Extrae el texto de un mensaje de WhatsApp
 * @param {Object} message - Mensaje de WhatsApp
 * @returns {string|null} - Texto extraído o null si no hay texto
 */
function extractTextFromMessage(message) {
  try {
    // Verificar si el mensaje tiene contenido de texto
    if (message.message && message.message.conversation) {
      return message.message.conversation;
    }
    
    // Verificar si es un mensaje extendido
    if (message.message && message.message.extendedTextMessage) {
      return message.message.extendedTextMessage.text;
    }
    
    // Verificar si es una respuesta a un mensaje
    if (message.message && message.message.buttonsResponseMessage) {
      return message.message.buttonsResponseMessage.selectedDisplayText;
    }
    
    // Verificar si es una respuesta de lista
    if (message.message && message.message.listResponseMessage) {
      return message.message.listResponseMessage.title;
    }
    
    // Si no se encuentra texto, devolver null
    return null;
  } catch (error) {
    logger.error('Error al extraer texto del mensaje:', error);
    return null;
  }
}

/**
 * Función para esperar un tiempo determinado
 * @param {number} ms - Tiempo en milisegundos
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formatea un número de teléfono para asegurar que tenga el formato correcto
 * @param {string} phoneNumber - Número de teléfono
 * @returns {string} - Número formateado
 */
function formatPhoneNumber(phoneNumber) {
  // Eliminar caracteres no numéricos
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // Asegurarse de que tenga el formato correcto para WhatsApp
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Añadir código de país si no lo tiene
  if (!cleaned.startsWith('52') && cleaned.length === 10) {
    cleaned = '52' + cleaned;
  }
  
  return cleaned;
}

/**
 * Genera un ID único
 * @returns {string} - ID único
 */
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

module.exports = {
  extractTextFromMessage,
  delay,
  formatPhoneNumber,
  generateUniqueId
}; 