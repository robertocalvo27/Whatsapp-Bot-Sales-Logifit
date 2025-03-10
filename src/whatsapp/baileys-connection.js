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

// Variable para controlar los intentos de reconexión
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Crear socket de WhatsApp
async function connectToWhatsApp() {
  try {
    // Si hemos excedido los intentos de reconexión, detener
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`\nSe han excedido los intentos de reconexión (${MAX_RECONNECT_ATTEMPTS}). Por favor, verifica tu conexión a internet y reinicia la aplicación.`);
      console.error('Si el problema persiste, elimina la carpeta auth_info_baileys y vuelve a intentarlo.\n');
      process.exit(1);
    }
    
    // Cargar estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    
    // Crear socket con opciones
    const sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['Logifit Bot', 'Chrome', '10.0.0'],
      connectTimeoutMs: 60000, // 60 segundos
      keepAliveIntervalMs: 25000, // 25 segundos
      retryRequestDelayMs: 2000 // 2 segundos
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
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        logger.info(`Conexión cerrada. Código de estado: ${statusCode}. Razón: ${lastDisconnect?.error?.message || 'Desconocida'}`);
        
        if (shouldReconnect) {
          reconnectAttempts++;
          logger.info(`Reconectando... Intento ${reconnectAttempts} de ${MAX_RECONNECT_ATTEMPTS}`);
          setTimeout(() => connectToWhatsApp(), 5000); // Esperar 5 segundos antes de reconectar
        } else {
          logger.info('Desconectado permanentemente, elimina la carpeta auth_info_baileys para volver a escanear el código QR');
          console.log('\n===== DESCONECTADO DE WHATSAPP =====\n');
          console.log('Para volver a conectar, elimina la carpeta auth_info_baileys y reinicia la aplicación.\n');
        }
      } else if (connection === 'open') {
        // Resetear contador de intentos de reconexión
        reconnectAttempts = 0;
        
        logger.info('Conexión establecida con WhatsApp');
        console.log('\n===== BOT DE WHATSAPP CONECTADO Y LISTO =====\n');
        console.log('El bot está listo para recibir mensajes.\n');
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
          console.log(`\nMensaje recibido de ${from}: ${body || '[MEDIA]'}`);
          
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
            console.log(`Respuesta enviada a ${from}: ${response.text.substring(0, 100)}${response.text.length > 100 ? '...' : ''}`);
          }
        } catch (error) {
          logger.error('Error al procesar mensaje:', error);
          console.error('Error al procesar mensaje:', error);
        }
      }
    });
    
    return sock;
  } catch (error) {
    logger.error('Error al conectar con WhatsApp:', error);
    console.error('Error al conectar con WhatsApp:', error);
    
    reconnectAttempts++;
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      logger.info(`Reintentando conexión... Intento ${reconnectAttempts} de ${MAX_RECONNECT_ATTEMPTS}`);
      console.log(`\nReintentando conexión... Intento ${reconnectAttempts} de ${MAX_RECONNECT_ATTEMPTS}\n`);
      setTimeout(() => connectToWhatsApp(), 5000); // Esperar 5 segundos antes de reconectar
    } else {
      console.error(`\nSe han excedido los intentos de reconexión (${MAX_RECONNECT_ATTEMPTS}). Por favor, verifica tu conexión a internet y reinicia la aplicación.`);
      process.exit(1);
    }
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