const mongoose = require('mongoose');
const { CONVERSATION_STATES } = require('../utils/constants');
const { logger } = require('../utils/logger');

// Almacenamiento en memoria para modo de prueba
const inMemoryProspects = new Map();

// Esquema para los prospectos
const prospectSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: ''
  },
  conversationState: {
    type: String,
    enum: Object.values(CONVERSATION_STATES),
    default: CONVERSATION_STATES.INITIAL
  },
  qualificationStep: {
    type: Number,
    default: 0
  },
  qualificationAnswers: {
    type: Map,
    of: String,
    default: {}
  },
  appointmentDetails: {
    date: String,
    time: String,
    calendarEventId: String
  },
  highInterestNotified: {
    type: Boolean,
    default: false
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Crear modelo si no existe una referencia circular
let Prospect;
try {
  Prospect = mongoose.model('Prospect');
} catch (e) {
  try {
    Prospect = mongoose.model('Prospect', prospectSchema);
  } catch (err) {
    logger.warn('No se pudo crear el modelo de Mongoose. Usando almacenamiento en memoria.');
    // No hacer nada, usaremos el almacenamiento en memoria
  }
}

/**
 * Verifica si estamos en modo de prueba
 */
function isTestMode() {
  return process.env.NODE_ENV === 'test' || 
         !process.env.MONGODB_URI || 
         process.env.MONGODB_URI.includes('tu_') ||
         !Prospect;
}

/**
 * Obtiene o crea el estado de un prospecto por número de teléfono
 */
async function getProspectState(phoneNumber) {
  try {
    // Si estamos en modo de prueba, usar almacenamiento en memoria
    if (isTestMode()) {
      let prospect = inMemoryProspects.get(phoneNumber);
      
      if (!prospect) {
        prospect = {
          phoneNumber,
          conversationState: CONVERSATION_STATES.INITIAL,
          qualificationStep: 0,
          qualificationAnswers: {},
          lastInteraction: new Date(),
          createdAt: new Date()
        };
        inMemoryProspects.set(phoneNumber, prospect);
        logger.info(`Nuevo prospecto creado en memoria: ${phoneNumber}`);
      }
      
      return prospect;
    }
    
    // Buscar prospecto existente en MongoDB
    let prospect = await Prospect.findOne({ phoneNumber });
    
    // Si no existe, crear uno nuevo
    if (!prospect) {
      prospect = await Prospect.create({
        phoneNumber,
        conversationState: CONVERSATION_STATES.INITIAL,
        lastInteraction: new Date()
      });
      logger.info(`Nuevo prospecto creado: ${phoneNumber}`);
    }
    
    return prospect;
  } catch (error) {
    logger.error(`Error al obtener estado del prospecto ${phoneNumber}:`, error);
    
    // Devolver un objeto básico en caso de error
    return {
      phoneNumber,
      conversationState: CONVERSATION_STATES.INITIAL,
      qualificationStep: 0,
      qualificationAnswers: {},
      lastInteraction: new Date()
    };
  }
}

/**
 * Actualiza el estado de un prospecto
 */
async function updateProspectState(phoneNumber, updates) {
  try {
    // Si estamos en modo de prueba, usar almacenamiento en memoria
    if (isTestMode()) {
      let prospect = inMemoryProspects.get(phoneNumber);
      
      if (!prospect) {
        prospect = {
          phoneNumber,
          conversationState: CONVERSATION_STATES.INITIAL,
          qualificationStep: 0,
          qualificationAnswers: {},
          lastInteraction: new Date(),
          createdAt: new Date()
        };
      }
      
      // Actualizar propiedades
      Object.assign(prospect, updates, { lastInteraction: new Date() });
      inMemoryProspects.set(phoneNumber, prospect);
      
      return prospect;
    }
    
    // Actualizar en MongoDB
    const prospect = await Prospect.findOneAndUpdate(
      { phoneNumber },
      { ...updates, lastInteraction: new Date() },
      { new: true, upsert: true }
    );
    
    return prospect;
  } catch (error) {
    logger.error(`Error al actualizar estado del prospecto ${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Obtiene prospectos que no han interactuado en un tiempo determinado
 */
async function getInactiveProspects(hoursInactive) {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hoursInactive);
  
  try {
    // Si estamos en modo de prueba, usar almacenamiento en memoria
    if (isTestMode()) {
      return Array.from(inMemoryProspects.values())
        .filter(prospect => 
          prospect.lastInteraction < cutoffTime && 
          prospect.conversationState !== CONVERSATION_STATES.CLOSING
        );
    }
    
    // Buscar en MongoDB
    return await Prospect.find({
      lastInteraction: { $lt: cutoffTime },
      conversationState: { $ne: CONVERSATION_STATES.CLOSING }
    });
  } catch (error) {
    logger.error('Error al obtener prospectos inactivos:', error);
    return [];
  }
}

module.exports = {
  Prospect,
  getProspectState,
  updateProspectState,
  getInactiveProspects
}; 