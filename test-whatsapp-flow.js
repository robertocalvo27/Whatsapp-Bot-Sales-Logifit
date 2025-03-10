require('dotenv').config();
const fs = require('fs');
const path = require('path');
const campaignFlow = require('./src/flows/campaignFlow');
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
  
  // Respuestas a las preguntas de calificación (simulando audio)
  {
    type: 'audio',
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
  
  // Procesar cada mensaje
  for (const message of testMessages) {
    console.log(`Usuario (${message.type}): ${message.type === 'text' ? message.content : '[AUDIO]'}`);
    
    let processedMessage;
    
    // Procesar según el tipo de mensaje
    if (message.type === 'audio') {
      // Simular procesamiento de audio
      console.log(`Simulando transcripción de audio...`);
      processedMessage = message.transcription;
      console.log(`Transcripción: "${processedMessage}"`);
      
      // Simular contexto del audio
      const simulatedContext = {
        intent: 'response',
        sentiment: 'positive',
        keywords: ['sistema', 'interesados', 'nunca', 'usado'],
        hasTimeReference: false,
        hasEmailReference: false,
        hasCompanyReference: false,
        hasQuantityReference: false
      };
      
      console.log(`Contexto: ${JSON.stringify(simulatedContext, null, 2)}`);
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