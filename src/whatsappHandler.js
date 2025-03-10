const campaignFlow = require('./flows/campaignFlow');
const { processAudioMessage } = require('./services/audioService');
const { sendProspectToCRM, updateProspectInCRM } = require('./services/crmService');
const logger = require('./utils/logger');
const db = require('./database');
const { parsePhoneNumber } = require('libphonenumber-js');
const moment = require('moment-timezone');

// Mapeo de países a zonas horarias (simplificado)
const COUNTRY_TIMEZONE_MAP = {
  'PE': 'America/Lima',         // Perú
  'MX': 'America/Mexico_City',  // México
  'CO': 'America/Bogota',       // Colombia
  'CL': 'America/Santiago',     // Chile
  'AR': 'America/Argentina/Buenos_Aires', // Argentina
  'BR': 'America/Sao_Paulo',    // Brasil
  'EC': 'America/Guayaquil',    // Ecuador
  'BO': 'America/La_Paz',       // Bolivia
  'PY': 'America/Asuncion',     // Paraguay
  'UY': 'America/Montevideo',   // Uruguay
  'VE': 'America/Caracas',      // Venezuela
  'PA': 'America/Panama',       // Panamá
  'CR': 'America/Costa_Rica',   // Costa Rica
  'GT': 'America/Guatemala',    // Guatemala
  'SV': 'America/El_Salvador',  // El Salvador
  'HN': 'America/Tegucigalpa',  // Honduras
  'NI': 'America/Managua',      // Nicaragua
  'DO': 'America/Santo_Domingo', // República Dominicana
  'US': 'America/New_York',     // Estados Unidos (Este)
  'CA': 'America/Toronto',      // Canadá (Este)
  'ES': 'Europe/Madrid',        // España
  // Añadir más países según sea necesario
  'DEFAULT': 'America/Lima'     // Zona horaria por defecto
};

// Almacenamiento en memoria como respaldo cuando MongoDB no está disponible
const memoryStorage = {
  prospects: new Map()
};

/**
 * Maneja un mensaje entrante de WhatsApp
 * @param {Object} message - Mensaje de WhatsApp
 * @returns {Promise<Object>} - Respuesta a enviar
 */
async function handleWhatsAppMessage(message) {
  try {
    // Extraer información del mensaje
    const { from, body, type, mediaUrl } = message;
    
    console.log(`\n===== PROCESANDO MENSAJE DE ${from} =====`);
    console.log(`Tipo: ${type}, Contenido: ${body}`);
    
    // Normalizar número de teléfono (eliminar espacios, guiones, etc.)
    const phoneNumber = normalizePhoneNumber(from);
    
    // Detectar país y zona horaria
    const { country, timezone } = detectCountryAndTimezone(phoneNumber);
    console.log(`País detectado: ${country}, Zona horaria: ${timezone}`);
    
    // Buscar o crear estado del prospecto
    let prospectState = await getProspectState(phoneNumber);
    
    // Añadir información de país y zona horaria si no existe
    if (!prospectState.country || !prospectState.timezone) {
      prospectState = {
        ...prospectState,
        country,
        timezone
      };
      // Actualizar en base de datos o memoria
      await updateProspectState(phoneNumber, prospectState);
    }
    
    console.log(`Estado actual: ${prospectState.conversationState || 'nuevo'}`);
    
    // Procesar mensaje según su tipo
    let messageText = body;
    let messageContext = null;
    
    // Si es un mensaje de audio, procesarlo
    if (type === 'audio' || type === 'voice' || type === 'ptt') {
      try {
        console.log('Procesando mensaje de audio...');
        const audioResult = await processAudioMessage(mediaUrl, prospectState);
        messageText = audioResult.transcription;
        messageContext = audioResult.context;
        
        logger.info(`Audio de ${phoneNumber} transcrito: "${messageText}"`);
        console.log(`Audio transcrito: "${messageText}"`);
      } catch (error) {
        logger.error(`Error al procesar audio de ${phoneNumber}:`, error);
        console.error('Error al procesar audio:', error);
        return {
          text: 'Lo siento, no pude procesar tu mensaje de voz. ¿Podrías escribir tu mensaje?'
        };
      }
    }
    
    // Procesar mensaje con el flujo de campaña
    console.log('Enviando mensaje al flujo de campaña...');
    const { response, newState } = await campaignFlow.processMessage(prospectState, messageText);
    console.log(`Nuevo estado: ${newState.conversationState}`);
    
    // Actualizar estado del prospecto
    await updateProspectState(phoneNumber, newState);
    
    // Si el estado cambió a COMPLETED, enviar al CRM
    if (newState.conversationState === 'completed' && 
        (!prospectState.conversationState || prospectState.conversationState !== 'completed')) {
      try {
        console.log('Enviando prospecto al CRM...');
        const crmResult = await sendProspectToCRM(newState);
        
        // Guardar ID del CRM en el estado
        if (crmResult.success && crmResult.crmId) {
          await updateProspectState(phoneNumber, {
            ...newState,
            crmId: crmResult.crmId
          });
          console.log(`Prospecto enviado al CRM con ID: ${crmResult.crmId}`);
        }
      } catch (error) {
        logger.error(`Error al enviar prospecto ${phoneNumber} al CRM:`, error);
        console.error('Error al enviar prospecto al CRM:', error);
      }
    }
    
    // Devolver respuesta
    console.log(`Respuesta generada: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
    return {
      text: response
    };
  } catch (error) {
    logger.error('Error al manejar mensaje de WhatsApp:', error);
    console.error('Error al manejar mensaje de WhatsApp:', error);
    
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
 * Detecta el país y la zona horaria basado en el número de teléfono
 * @param {string} phoneNumber - Número de teléfono normalizado
 * @returns {Object} - País y zona horaria
 */
function detectCountryAndTimezone(phoneNumber) {
  try {
    // Asegurarse de que el número tenga formato internacional (con +)
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    
    // Parsear el número para obtener información
    const parsedNumber = parsePhoneNumber(formattedNumber);
    
    if (parsedNumber && parsedNumber.country) {
      const country = parsedNumber.country;
      const timezone = COUNTRY_TIMEZONE_MAP[country] || COUNTRY_TIMEZONE_MAP.DEFAULT;
      
      return { country, timezone };
    }
  } catch (error) {
    console.error('Error al detectar país del número:', error);
  }
  
  // Valores por defecto si no se puede detectar
  return { 
    country: 'UNKNOWN', 
    timezone: COUNTRY_TIMEZONE_MAP.DEFAULT 
  };
}

/**
 * Obtiene el estado actual de un prospecto
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Promise<Object>} - Estado del prospecto
 */
async function getProspectState(phoneNumber) {
  try {
    // Intentar buscar en la base de datos
    const collection = await db.collection('prospects');
    
    if (collection) {
      // Si hay conexión a MongoDB, buscar en la base de datos
      const prospect = await collection.findOne({ phoneNumber });
      
      // Si existe, devolver estado
      if (prospect) {
        return prospect;
      }
    } else {
      // Si no hay conexión a MongoDB, buscar en memoria
      console.log('Usando almacenamiento en memoria para buscar prospecto');
      if (memoryStorage.prospects.has(phoneNumber)) {
        return memoryStorage.prospects.get(phoneNumber);
      }
    }
    
    // Si no existe, crear nuevo estado
    const newProspect = {
      phoneNumber,
      createdAt: new Date(),
      lastInteraction: new Date()
    };
    
    // Guardar en la base de datos o en memoria
    try {
      const collection = await db.collection('prospects');
      if (collection) {
        await collection.insertOne(newProspect);
        console.log('Nuevo prospecto creado en la base de datos');
      } else {
        // Guardar en memoria
        memoryStorage.prospects.set(phoneNumber, newProspect);
        console.log('Nuevo prospecto creado en memoria');
      }
    } catch (dbError) {
      // Si falla la base de datos, guardar en memoria
      memoryStorage.prospects.set(phoneNumber, newProspect);
      console.warn('No se pudo guardar el prospecto en la base de datos, guardado en memoria:', dbError.message);
    }
    
    return newProspect;
  } catch (error) {
    logger.error(`Error al obtener estado del prospecto ${phoneNumber}:`, error);
    console.error(`Error al obtener estado del prospecto ${phoneNumber}:`, error);
    
    // Buscar en memoria como último recurso
    if (memoryStorage.prospects.has(phoneNumber)) {
      return memoryStorage.prospects.get(phoneNumber);
    }
    
    // Devolver estado básico en caso de error
    const basicState = {
      phoneNumber,
      lastInteraction: new Date()
    };
    
    // Guardar en memoria
    memoryStorage.prospects.set(phoneNumber, basicState);
    
    return basicState;
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
    // Actualizar fecha de última interacción
    newState.lastInteraction = new Date();
    
    // Intentar actualizar en la base de datos
    const collection = await db.collection('prospects');
    
    if (collection) {
      // Si hay conexión a MongoDB, actualizar en la base de datos
      await collection.updateOne(
        { phoneNumber },
        { $set: newState }
      );
      console.log('Prospecto actualizado en la base de datos');
    } else {
      // Si no hay conexión a MongoDB, actualizar en memoria
      memoryStorage.prospects.set(phoneNumber, newState);
      console.log('Prospecto actualizado en memoria');
    }
    
    return true;
  } catch (error) {
    logger.error(`Error al actualizar estado del prospecto ${phoneNumber}:`, error);
    console.error(`Error al actualizar estado del prospecto ${phoneNumber}:`, error);
    
    // Actualizar en memoria como último recurso
    memoryStorage.prospects.set(phoneNumber, newState);
    console.log('Prospecto actualizado en memoria (tras error en DB)');
    
    return true;
  }
}

module.exports = {
  handleWhatsAppMessage
}; 