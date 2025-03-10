const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { handleWhatsAppMessage } = require('../whatsappHandler');
const qrcode = require('qrcode-terminal');

// Directorio para almacenar la información de autenticación
const AUTH_FOLDER = path.join(__dirname, '../../auth_info_baileys');

// Asegurarse de que el directorio existe
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

// Crear socket de WhatsApp
async function connectToWhatsApp() {
  try {
    // Cargar estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    
    // Crear socket con opciones
    const sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      logger: pino({ level: 'silent' })
    });
    
    // Guardar credenciales cuando se actualicen
    sock.ev.on('creds.update', saveCreds);
    
    // Manejar conexión
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      // Mostrar código QR si está disponible
      if (qr) {
        console.log('\n===== ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP =====\n');
        qrcode.generate(qr, { small: true });
      }
      
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        logger.info('Conexión cerrada debido a:', lastDisconnect?.error?.message || 'Razón desconocida');
        
        if (shouldReconnect) {
          logger.info('Reconectando...');
          connectToWhatsApp();
        } else {
          logger.info('Desconectado permanentemente, elimina la carpeta auth_info_baileys para volver a escanear el código QR');
        }
      } else if (connection === 'open') {
        logger.info('Conexión establecida con WhatsApp');
        console.log('\n===== BOT DE WHATSAPP CONECTADO Y LISTO =====\n');
      }
    });
    
    // Manejar mensajes entrantes
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        // Ignorar mensajes de estado y propios
        if (message.key.remoteJid === 'status@broadcast' || message.key.fromMe) continue;
        
        try {
          // Extraer información del mensaje
          const remoteJid = message.key.remoteJid;
          const from = remoteJid.split('@')[0];
          const type = getMessageType(message);
          const body = getMessageContent(message, type);
          const mediaUrl = await getMediaUrl(message, type, sock);
          
          logger.logWhatsAppMessage('incoming', from, body || '[MEDIA]');
          
          // Procesar mensaje
          const messageData = {
            from,
            body,
            type,
            mediaUrl
          };
          
          // Manejar mensaje y obtener respuesta
          const response = await handleWhatsAppMessage(messageData);
          
          // Enviar respuesta
          if (response && response.text) {
            await sock.sendMessage(remoteJid, { text: response.text });
            logger.logWhatsAppMessage('outgoing', from, response.text);
          }
        } catch (error) {
          logger.error('Error al procesar mensaje:', error);
        }
      }
    });
    
    return sock;
  } catch (error) {
    logger.error('Error al conectar con WhatsApp:', error);
    console.error('Error al conectar con WhatsApp:', error);
    throw error;
  }
}

// Obtener tipo de mensaje
function getMessageType(message) {
  const messageTypes = [
    'conversation', 'imageMessage', 'videoMessage', 
    'extendedTextMessage', 'documentMessage', 'audioMessage',
    'stickerMessage', 'contactMessage', 'locationMessage'
  ];
  
  const messageContent = message.message || {};
  
  for (const type of messageTypes) {
    if (type in messageContent) {
      if (type === 'extendedTextMessage') return 'text';
      if (type === 'conversation') return 'text';
      if (type === 'audioMessage') {
        return messageContent[type].ptt ? 'ptt' : 'audio';
      }
      return type.replace('Message', '');
    }
  }
  
  return 'unknown';
}

// Obtener contenido del mensaje
function getMessageContent(message, type) {
  const messageContent = message.message || {};
  
  if (type === 'text') {
    return messageContent.extendedTextMessage?.text || messageContent.conversation || '';
  }
  
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'ptt' || type === 'document') {
    return messageContent[`${type}Message`]?.caption || '';
  }
  
  return '';
}

// Obtener URL de medios
async function getMediaUrl(message, type, sock) {
  if (type !== 'image' && type !== 'video' && type !== 'audio' && type !== 'ptt' && type !== 'document') {
    return null;
  }
  
  try {
    const messageContent = message.message || {};
    const mediaType = type === 'ptt' ? 'audio' : type;
    const mediaMessage = messageContent[`${mediaType}Message`];
    
    if (!mediaMessage) return null;
    
    // Descargar medios
    const buffer = await sock.downloadMediaMessage(message);
    
    // Guardar en archivo temporal
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const fileName = `${type}_${Date.now()}.${getExtensionForType(type)}`;
    const filePath = path.join(tempDir, fileName);
    
    fs.writeFileSync(filePath, buffer);
    
    return filePath;
  } catch (error) {
    logger.error('Error al obtener URL de medios:', error);
    return null;
  }
}

// Obtener extensión para tipo de archivo
function getExtensionForType(type) {
  switch (type) {
    case 'image': return 'jpg';
    case 'video': return 'mp4';
    case 'audio':
    case 'ptt': return 'ogg';
    case 'document': return 'pdf';
    default: return 'bin';
  }
}

module.exports = {
  connectToWhatsApp
}; 