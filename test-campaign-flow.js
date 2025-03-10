require('dotenv').config();
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
  'Hola, vi su anuncio en Facebook sobre el sistema de control de fatiga',
  
  // Respuesta al saludo
  'Mi nombre es Juan Pérez, soy gerente de operaciones',
  
  // Respuestas a las preguntas de calificación
  'No, nunca hemos usado un sistema así',
  
  // Respuesta a la segunda pregunta
  '25 unidades',
  
  // Respuesta a la tercera pregunta
  'Hemos tenido algunos incidentes por conductores cansados',
  
  // Respuesta a la oferta de reunión
  'Sí, me gustaría saber más',
  
  // Respuesta a la sugerencia de horario
  'Perfecto, a esa hora está bien',
  
  // Respuesta con correo electrónico
  'Mi correo es juan.perez@empresa.com, también puede incluir a carlos@empresa.com'
];

// Función para simular la conversación
async function simulateConversation() {
  console.log('=== SIMULACIÓN DE CONVERSACIÓN DE CAMPAÑA ===\n');
  
  // Procesar cada mensaje
  for (const message of testMessages) {
    console.log(`Usuario: ${message}`);
    
    // Procesar mensaje
    const result = await campaignFlow.processMessage(prospectState, message);
    
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