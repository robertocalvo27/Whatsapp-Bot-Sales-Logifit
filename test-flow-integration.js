/**
 * Script de prueba para verificar la integración de los flujos
 * de invitación y checkout en el sistema de calificación de prospectos.
 */

// Configurar variables de entorno para pruebas
process.env.NODE_ENV = 'test';
process.env.VENDEDOR_NOMBRE = 'Roberto Calvo';

// Importar los módulos necesarios
const campaignFlow = require('./src/flows/campaignFlow');
const logger = require('./src/utils/logger');

// Sobreescribir las funciones de retraso humanizado para pruebas
const humanDelay = require('./src/utils/humanDelay');
// Guardar las funciones originales
const originalCalculateTypingTime = humanDelay.calculateTypingTime;
const originalWithHumanDelay = humanDelay.withHumanDelay;
const originalWithHumanDelayAsync = humanDelay.withHumanDelayAsync;

// Sobreescribir temporalmente para las pruebas
humanDelay.calculateTypingTime = () => 0;
humanDelay.withHumanDelay = (fn) => fn();
humanDelay.withHumanDelayAsync = (promise) => promise;

// Función para simular una conversación
async function simulateConversation(messages, initialState = {}) {
  console.log('\n=== INICIANDO SIMULACIÓN DE CONVERSACIÓN ===\n');
  
  let state = {
    ...initialState,
    lastInteraction: new Date()
  };
  
  for (const [index, userMessage] of messages.entries()) {
    console.log(`\n--- MENSAJE #${index + 1} ---`);
    console.log(`USUARIO: "${userMessage}"`);
    
    // Procesar el mensaje con el flujo de campaña
    const result = await campaignFlow.processMessage(userMessage, state);
    
    // Actualizar el estado
    state = result.newState;
    
    // Mostrar la respuesta y el estado actualizado
    console.log(`BOT: "${result.response}"`);
    console.log('\nESTADO ACTUALIZADO:');
    console.log(JSON.stringify({
      name: state.name,
      company: state.company,
      fleetSize: state.fleetSize,
      fleetSizeCategory: state.fleetSizeCategory,
      currentSolution: state.currentSolution,
      decisionTimeline: state.decisionTimeline,
      urgency: state.urgency,
      role: state.role,
      isDecisionMaker: state.isDecisionMaker,
      conversationState: state.conversationState,
      qualificationComplete: state.qualificationComplete,
      invitationStep: state.invitationStep,
      checkoutStep: state.checkoutStep,
      checkoutReason: state.checkoutReason
    }, null, 2));
  }
  
  // Añadir un mensaje adicional para ver cómo se dirige al prospecto después de la calificación
  if (state.conversationState === 'qualified') {
    console.log('\n--- MENSAJE ADICIONAL PARA VERIFICAR ENRUTAMIENTO ---');
    console.log('USUARIO: "Me gustaría saber más sobre su solución"');
    
    const result = await campaignFlow.processMessage('Me gustaría saber más sobre su solución', state);
    
    // Actualizar el estado
    state = result.newState;
    
    // Mostrar la respuesta y el estado actualizado
    console.log(`BOT: "${result.response}"`);
    console.log('\nESTADO ACTUALIZADO DESPUÉS DEL ENRUTAMIENTO:');
    console.log(JSON.stringify({
      name: state.name,
      company: state.company,
      fleetSize: state.fleetSize,
      fleetSizeCategory: state.fleetSizeCategory,
      conversationState: state.conversationState,
      invitationStep: state.invitationStep,
      checkoutStep: state.checkoutStep,
      checkoutReason: state.checkoutReason
    }, null, 2));
  }
  
  console.log('\n=== FIN DE LA SIMULACIÓN ===\n');
  return state;
}

// Casos de prueba
async function runTests() {
  console.log('=== INICIANDO PRUEBAS DE INTEGRACIÓN DE FLUJOS ===');
  
  // Caso 1: Prospecto de alto valor (nombre conocido, flota grande, tomador de decisiones)
  await simulateConversation([
    'Hola, me interesa su solución de monitoreo de fatiga',
    'Soy Juan Pérez, Gerente de Operaciones en Transportes ABC',
    'Tenemos una flota de 50 camiones',
    'No, actualmente no usamos ningún sistema de monitoreo',
    'Estamos evaluando implementar uno en el próximo mes',
    'Sí, yo soy quien toma las decisiones sobre este tipo de tecnología',
    'Me gustaría agendar una llamada para conocer más detalles'
  ]);
  
  // Caso 2: Prospecto de bajo valor (flota pequeña)
  await simulateConversation([
    'Hola, quiero información sobre sus productos',
    'Me llamo Carlos Gómez de Transportes Pequeños',
    'Solo tenemos 5 camiones',
    'No usamos ningún sistema actualmente',
    'Tal vez el próximo año consideremos implementar algo',
    'Soy el dueño de la empresa',
    'Quiero saber los precios'
  ]);
  
  // Caso 3: Prospecto sin nombre (información insuficiente)
  await simulateConversation([
    'Hola, quiero información',
    'Prefiero no decir mi nombre',
    'Trabajo en una empresa de logística',
    'No sé exactamente cuántos vehículos tenemos',
    'No usamos ningún sistema de monitoreo',
    'Quizás en unos meses',
    'No quiero dar mi puesto'
  ], { name: 'Desconocido', company: 'Empresa desconocida' });
  
  // Caso 4: Prospecto no tomador de decisiones
  await simulateConversation([
    'Hola, me interesa su solución',
    'Soy Ana López, trabajo en Transportes Grandes',
    'Tenemos más de 100 camiones',
    'Usamos Guardian pero no estamos satisfechos',
    'Creo que la empresa está evaluando cambiar pronto',
    'Soy asistente administrativa, no tomo decisiones',
    'Me gustaría recibir información para pasarla a mi jefe'
  ]);
  
  // Caso 5: Prospecto con urgencia baja
  await simulateConversation([
    'Hola, quiero conocer su solución',
    'Me llamo Roberto Díaz de Transportes Medianos',
    'Tenemos unos 30 vehículos',
    'No usamos ningún sistema actualmente',
    'No es prioridad, tal vez en un año o más',
    'Soy gerente de flota',
    'Por ahora solo quiero información general'
  ]);
  
  console.log('=== PRUEBAS COMPLETADAS ===');
  
  // Restaurar las funciones originales
  humanDelay.calculateTypingTime = originalCalculateTypingTime;
  humanDelay.withHumanDelay = originalWithHumanDelay;
  humanDelay.withHumanDelayAsync = originalWithHumanDelayAsync;
}

// Ejecutar las pruebas
runTests().catch(error => {
  console.error('Error en las pruebas:', error);
  process.exit(1);
}); 