require('dotenv').config();
// Importar crypto explícitamente
global.crypto = require('crypto');

// Importaciones básicas
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// Directorio para almacenar la información de autenticación
const AUTH_FOLDER = path.join(__dirname, 'simple_auth');

// Asegurarse de que el directorio existe
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

// Función asincrónica para conectar
async function connectToWhatsApp() {
  console.log('\n===== PRUEBA SIMPLE DE CONEXIÓN A WHATSAPP =====\n');
  console.log('Conectando a WhatsApp...');
  
  // Cargar estado de autenticación
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  
  // Crear socket con opciones mínimas
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['Logifit Bot', 'Chrome', '10.0.0']
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
      const shouldReconnect = (lastDisconnect.error instanceof Boom) ? 
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
      
      console.log('Conexión cerrada debido a:', lastDisconnect.error?.message || 'Razón desconocida');
      
      if (shouldReconnect) {
        console.log('Reconectando...');
        connectToWhatsApp();
      } else {
        console.log('Desconectado permanentemente');
      }
    } else if (connection === 'open') {
      console.log('\n===== BOT DE WHATSAPP CONECTADO Y LISTO =====\n');
      console.log('El bot está listo para recibir mensajes.');
      console.log('Envía un mensaje a este número para probar la conexión.');
      console.log('Presiona Ctrl+C para salir.\n');
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
        const messageContent = message.message || {};
        const body = messageContent.conversation || 
                    messageContent.extendedTextMessage?.text || 
                    '[MEDIA]';
        
        console.log(`\nMensaje recibido de ${from}: ${body}`);
        
        // Enviar respuesta de prueba
        const response = `Hola! Este es un mensaje de prueba del bot de Logifit. Tu mensaje fue: "${body}"`;
        await sock.sendMessage(remoteJid, { text: response });
        console.log(`Respuesta enviada a ${from}: ${response}`);
      } catch (error) {
        console.error('Error al procesar mensaje:', error);
      }
    }
  });
}

// Iniciar conexión
connectToWhatsApp()
  .catch(err => console.error('Error inesperado:', err)); 