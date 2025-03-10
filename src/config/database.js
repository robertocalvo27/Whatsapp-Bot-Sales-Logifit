const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

/**
 * Conecta a la base de datos MongoDB
 */
async function connectToDatabase() {
  try {
    // Verificar si estamos en modo de prueba
    if (process.env.NODE_ENV === 'test' || !process.env.MONGODB_URI || process.env.MONGODB_URI.includes('tu_')) {
      logger.warn('Ejecutando en modo de prueba sin MongoDB. Los datos no se guardarán permanentemente.');
      return true; // Simular conexión exitosa
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Conectado a MongoDB');
    return true;
  } catch (error) {
    logger.error('Error al conectar a MongoDB:', error);
    
    // Si estamos en desarrollo, permitir continuar sin MongoDB
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Continuando en modo de desarrollo sin MongoDB. Los datos no se guardarán permanentemente.');
      return true;
    }
    
    throw error;
  }
}

module.exports = {
  connectToDatabase
}; 