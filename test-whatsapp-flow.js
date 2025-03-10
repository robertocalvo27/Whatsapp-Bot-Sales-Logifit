require('dotenv').config();
const fs = require('fs');
const path = require('path');
const campaignFlow = require('./src/flows/campaignFlow');
const { processAudioMessage } = require('./src/services/audioService');
const logger = require('./src/utils/logger');

// Simular un prospecto nuevo
let prospectState = {
  phoneNumber: '+51986220876',
  createdAt: new Date(),
  lastInteraction: new Date()
};

// Mensajes de prueba para simular una conversación
const testMessages = [
  // Mensaje inicial (simulando que viene de una campaña de Facebook)
  {
    type: 'text',
    content: 'Hola, vi su anuncio en Facebook sobre el sistema de control de fatiga'
  },
  
  // Respuesta al saludo
  {
    type: 'text',
    content: 'Mi nombre es Juan Pérez, soy gerente de operaciones en Transportes Norte'
  },
  
  // Respuestas a las preguntas de calificación (primera como audio)
  {
    type: 'audio',
    path: path.join(__dirname, 'test-audio', 'respuesta1.ogg'),
    transcription: 'No, nunca hemos usado un sistema así pero estamos interesados'
  },
  
  // Respuesta a la segunda pregunta
  {
    type: 'text',
    content: 'Tenemos 25 unidades en nuestra flota'
  },
  
  // Respuesta a la tercera pregunta
  {
    type: 'text',
    content: 'Hemos tenido algunos incidentes por conductores cansados, especialmente en rutas largas'
  },
  
  // Respuesta a la oferta de reunión
  {
    type: 'text',
    content: 'Sí, me gustaría saber más sobre cómo funciona'
  },
  
  // Respuesta a la sugerencia de horario
  {
    type: 'text',
    content: 'Perfecto, a esa hora está bien'
  },
  
  // Respuesta con correo electrónico
  {
    type: 'text',
    content: 'Mi correo es juan.perez@transportesnorte.com, también puede incluir a carlos@transportesnorte.com'
  }
];

// Función para simular la conversación
async function simulateConversation() {
  console.log('=== SIMULACIÓN DE CONVERSACIÓN DE WHATSAPP ===\n');
  
  // Crear directorio para audios de prueba si no existe
  const testAudioDir = path.join(__dirname, 'test-audio');
  if (!fs.existsSync(testAudioDir)) {
    fs.mkdirSync(testAudioDir, { recursive: true });
    
    // Aquí deberías copiar un archivo de audio real para la prueba
    console.log(`Por favor, coloca un archivo de audio llamado 'respuesta1.ogg' en el directorio ${testAudioDir}`);
    console.log('Presiona Ctrl+C para salir si necesitas hacer esto primero.\n');
    
    // Esperar 5 segundos para dar tiempo a leer el mensaje
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Procesar cada mensaje
  for (const message of testMessages) {
    console.log(`Usuario (${message.type}): ${message.type === 'text' ? message.content : '[AUDIO]'}`);
    
    let processedMessage;
    
    // Procesar según el tipo de mensaje
    if (message.type === 'audio') {
      if (fs.existsSync(message.path)) {
        try {
          // Procesar audio
          const audioResult = await processAudioMessage(message.path, prospectState);
          processedMessage = audioResult.transcription;
          
          console.log(`Transcripción: "${processedMessage}"`);
          console.log(`Contexto: ${JSON.stringify(audioResult.context, null, 2)}`);
        } catch (error) {
          console.error('Error al procesar audio:', error.message);
          processedMessage = message.transcription; // Usar transcripción predefinida como fallback
          console.log(`Usando transcripción predefinida: "${processedMessage}"`);
        }
      } else {
        console.warn(`Archivo de audio no encontrado: ${message.path}`);
        processedMessage = message.transcription; // Usar transcripción predefinida
        console.log(`Usando transcripción predefinida: "${processedMessage}"`);
      }
    } else {
      processedMessage = message.content;
    }
    
    // Procesar mensaje
    const result = await campaignFlow.processMessage(prospectState, processedMessage);
    
    // Actualizar estado
    prospectState = result.newState;
    
    // Mostrar respuesta
    console.log(`Bot: ${result.response}\n`);
    
    // Esperar un momento para simular tiempo real
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Mostrar estado final
  console.log('=== ESTADO FINAL DEL PROSPECTO ===\n');
  console.log(JSON.stringify(prospectState, null, 2));
}

// Ejecutar simulación
simulateConversation()
  .then(() => {
    console.log('\n=== SIMULACIÓN COMPLETADA ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error en la simulación:', error);
    process.exit(1);
  }); 