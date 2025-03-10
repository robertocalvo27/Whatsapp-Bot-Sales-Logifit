require('dotenv').config();
const { connectToWhatsApp } = require('./whatsapp/baileys-connection');
const db = require('./database');
const logger = require('./utils/logger');

// Función principal
async function main() {
  try {
    console.log('\n===== INICIANDO BOT DE WHATSAPP PARA LOGIFIT =====\n');
    
    // Conectar a la base de datos
    try {
      await db.connect();
      logger.info('Conexión a MongoDB establecida correctamente');
    } catch (dbError) {
      logger.warn('No se pudo conectar a MongoDB. Continuando sin persistencia de datos:', dbError.message);
      console.warn('ADVERTENCIA: No se pudo conectar a MongoDB. El bot funcionará sin guardar datos permanentemente.');
    }
    
    // Conectar a WhatsApp
    console.log('Conectando a WhatsApp...');
    console.log('Por favor, espera a que aparezca el código QR para escanear.\n');
    
    await connectToWhatsApp();
    
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
    
    // Manejar errores no capturados
    process.on('uncaughtException', (error) => {
      logger.error('Error no capturado:', error);
      console.error('Error no capturado:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Promesa rechazada no manejada:', reason);
      console.error('Promesa rechazada no manejada:', reason);
    });
  } catch (error) {
    logger.error('Error al iniciar la aplicación:', error);
    console.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

// Iniciar aplicación
main(); 