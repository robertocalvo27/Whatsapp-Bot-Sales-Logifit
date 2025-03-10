require('dotenv').config();
const { connectToWhatsApp } = require('./whatsapp/baileys-connection');
const db = require('./database');
const logger = require('./utils/logger');

// Función principal
async function main() {
  try {
    // Conectar a la base de datos
    await db.connect();
    logger.info('Conexión a la base de datos establecida');
    
    // Conectar a WhatsApp
    await connectToWhatsApp();
    logger.info('Bot de WhatsApp iniciado');
    
    // Manejar cierre de la aplicación
    process.on('SIGINT', async () => {
      logger.info('Cerrando aplicación...');
      await db.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Cerrando aplicación...');
      await db.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

// Iniciar aplicación
main(); 