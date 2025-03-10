require('dotenv').config();
const { startWhatsAppBot } = require('./controllers/whatsappController');
const { connectToDatabase } = require('./config/database');
const { logger } = require('./utils/logger');

async function main() {
  try {
    // Intentar conectar a la base de datos
    try {
      await connectToDatabase();
      logger.info('Conexión a la base de datos establecida');
    } catch (dbError) {
      logger.warn('Continuando sin conexión a la base de datos. Los datos no se guardarán permanentemente.');
    }

    // Iniciar el bot de WhatsApp
    await startWhatsAppBot();
    logger.info('Bot de WhatsApp iniciado');
  } catch (error) {
    logger.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  logger.error('Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesa rechazada no manejada:', reason);
});

// Iniciar la aplicación
main(); 