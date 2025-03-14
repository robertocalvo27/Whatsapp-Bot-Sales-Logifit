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
const testCases = [
  {
    description: 'Caso 1: Mensaje con enlace de Facebook',
    messages: [
      'https://fb.me/5gR5baubr',
      'Me llamo Juan y trabajo en Transportes ABC'
    ]
  },
  {
    description: 'Caso 2: Mensaje reenviado',
    messages: [
      'Forwarded\nOferta Flash! Smart Bands con 10% de descuento',
      'Soy Pedro López de la empresa XYZ Logistics'
    ]
  },
  {
    description: 'Caso 3: Conductor independiente',
    messages: [
      'Hola, me interesa el sistema',
      'Soy conductor independiente',
      'Me interesa saber más sobre el sistema'
    ]
  },
  {
    description: 'Caso 4: Prospecto de empresa',
    messages: [
      'Hola, vi su anuncio',
      'Soy Carlos Ruiz, gerente de operaciones en ABC Transportes',
      'Tenemos 30 unidades',
      'Sí, hemos tenido algunos incidentes',
      'Sí, me interesa una reunión',
      'Mi correo es carlos@abc.com'
    ]
  }
];

// Función para simular la conversación
async function simulateConversation() {
  for (const testCase of testCases) {
    console.log('\n=== INICIANDO CASO DE PRUEBA ===');
    console.log('Descripción:', testCase.description);
    console.log('=====================================\n');
    
    // Reiniciar estado para cada caso de prueba
    prospectState = {
      phoneNumber: '+51986220876',
      createdAt: new Date(),
      lastInteraction: new Date()
    };
    
    // Procesar cada mensaje del caso de prueba
    for (const message of testCase.messages) {
      console.log(`\nUsuario: ${message}`);
      console.log('---');
      
      try {
        // Procesar mensaje
        const result = await campaignFlow.processMessage(prospectState, message);
        
        // Actualizar estado
        prospectState = result.newState;
        
        // Mostrar respuesta
        console.log('Bot:', result.response);
        
        // Mostrar estado actual resumido
        console.log('\nEstado actual:');
        console.log('- Estado:', result.newState.conversationState);
        console.log('- Tipo de prospecto:', result.newState.prospectType || 'No definido');
        console.log('- Nombre:', result.newState.name || 'No definido');
        console.log('- Empresa:', result.newState.company || 'No definida');
        console.log('- Potencial:', result.newState.potential || 'No definido');
        
        // Esperar un momento para simular tiempo real
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error procesando mensaje:', error);
      }
    }
    
    // Mostrar resumen del caso de prueba
    console.log('\n=== RESUMEN DEL CASO DE PRUEBA ===');
    const finalState = {
      conversationState: prospectState.conversationState,
      name: prospectState.name,
      company: prospectState.company,
      prospectType: prospectState.prospectType,
      potential: prospectState.potential,
      nextAction: prospectState.nextAction,
      qualificationAnswers: prospectState.qualificationAnswers
    };
    console.log(JSON.stringify(finalState, null, 2));
    console.log('=====================================\n');
  }
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