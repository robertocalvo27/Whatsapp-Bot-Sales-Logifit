const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { logger } = require('../utils/logger');
const { handleIncomingMessage } = require('./messageController');
const fs = require('fs');
const path = require('path');

// Asegurarse de que crypto esté disponible globalmente
try {
  if (typeof crypto === 'undefined') {
    global.crypto = require('crypto').webcrypto;
  }
} catch (error) {
  logger.error('Error al configurar crypto:', error);
}

// Directorio para almacenar los datos de autenticación
const AUTH_FOLDER = path.join(process.cwd(), 'auth_info_baileys');

// Asegurarse de que el directorio de autenticación exista
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

/**
 * Inicia el bot de WhatsApp
 */
async function startWhatsAppBot() {
  try {
    // Cargar estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    
    // Crear socket de WhatsApp
    const sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      logger: logger
    });
    
    // Manejar eventos de conexión
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        // Mostrar código QR en terminal
        qrcode.generate(qr, { small: true });
        logger.info('Escanea el código QR con tu teléfono para iniciar sesión');
      }
      
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          logger.info('Conexión cerrada. Reconectando...');
          startWhatsAppBot();
        } else {
          logger.info('Conexión cerrada. Sesión cerrada.');
        }
      }
      
      if (connection === 'open') {
        logger.info('Conexión establecida con WhatsApp');
      }
    });
    
    // Guardar credenciales cuando se actualicen
    sock.ev.on('creds.update', saveCreds);
    
    // Manejar mensajes entrantes
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        // Solo procesar mensajes nuevos y que no sean de estado
        if (message.key.fromMe || message.key.remoteJid === 'status@broadcast') continue;
        
        // Procesar el mensaje entrante
        await handleIncomingMessage(sock, message);
      }
    });
    
    return sock;
  } catch (error) {
    logger.error('Error al iniciar el bot de WhatsApp:', error);
    
    // Si hay un error con Baileys, mostrar un mensaje más amigable
    if (error.message && error.message.includes('crypto is not defined')) {
      logger.error('Error con el módulo crypto. Esto puede deberse a incompatibilidades con la versión de Node.js.');
      logger.info('Sugerencia: Intenta usar Node.js v16 o v18 que son compatibles con Baileys.');
    }
    
    throw error;
  }
}

module.exports = {
  startWhatsAppBot
}; 