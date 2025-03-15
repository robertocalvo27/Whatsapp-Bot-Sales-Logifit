/**
 * Script para probar el flujo completo de la campaña
 * 
 * Este script simula una conversación completa con el bot para probar
 * la integración de los diferentes flujos (saludo, calificación, etc.)
 */

// Configurar variables de entorno para pruebas
process.env.OPENAI_API_KEY = 'sk-test-key';
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

const campaignFlow = require('./src/flows/campaignFlow');

/**
 * Simula una conversación completa con el bot
 * @param {Array} messages - Mensajes del usuario
 * @param {string} description - Descripción del caso de prueba
 */
async function simulateConversation(messages, description) {
  console.log(`\n----- ${description} -----`);
  
  // Estado inicial de la conversación
  const state = {
    conversationState: null,
    name: null,
    company: null,
    lastInteraction: new Date(),
    messageHistory: []
  };
  
  // Procesar cada mensaje del usuario
  for (const message of messages) {
    console.log(`\nUsuario: ${message}`);
    
    try {
      // Procesar el mensaje
      const result = await campaignFlow.processMessage(message, state);
      
      // Actualizar el estado
      Object.assign(state, result.newState);
      
      // Mostrar la respuesta del bot
      console.log(`Bot: ${result.response}`);
      
      // Mostrar el estado actual resumido
      console.log(`Estado: ${JSON.stringify({
        conversationState: state.conversationState,
        name: state.name,
        company: state.company,
        qualificationStep: state.qualificationStep,
        prospectType: state.prospectType,
        prospectPotential: state.prospectPotential
      }, null, 2)}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }
  
  // Mostrar resumen del caso
  console.log(`\nResumen final del caso:`);
  console.log(`- Nombre: ${state.name || 'No proporcionado'}`);
  console.log(`- Empresa: ${state.company || 'No proporcionada'}`);
  console.log(`- Estado final: ${state.conversationState}`);
  
  if (state.fleetSize) {
    console.log(`- Tamaño de flota: ${state.fleetSize} (${state.fleetSizeCategory || 'No categorizado'})`);
  }
  
  if (state.prospectType) {
    console.log(`- Tipo de prospecto: ${state.prospectType}`);
    console.log(`- Potencial: ${state.prospectPotential}`);
  }
  
  if (state.appointmentConfirmed) {
    console.log(`- Cita confirmada: Sí`);
    console.log(`- Detalles de la cita: ${state.appointmentDetails}`);
  }
  
  if (state.infoSent) {
    console.log(`- Información enviada: Sí`);
  }
}

// Ejecutar las pruebas
async function runTests() {
  console.log('=== INICIANDO PRUEBAS DEL FLUJO COMPLETO DE CAMPAÑA ===');
  console.log('Modo de prueba activado. Usando análisis local de mensajes.');
  
  // Caso 1: Flujo completo hasta cita (prospecto de alto valor)
  await simulateConversation(
    [
      'Hola', // Saludo inicial
      'Me llamo Carlos Rodríguez y trabajo en Transportes Nacionales', // Proporciona nombre y empresa
      'Tenemos una flota de 60 vehículos', // Información de flota
      'No, actualmente no usamos ningún sistema de monitoreo', // Información de solución actual
      'Estamos evaluando implementarlo en el próximo mes', // Plazo de decisión
      'Soy el Director de Seguridad', // Rol
      'Sí, me gustaría agendar una llamada', // Solicita cita
      'El próximo martes a las 10:00 am' // Proporciona fecha y hora
    ],
    'Caso 1: Flujo completo hasta cita (prospecto de alto valor)'
  );
  
  // Caso 2: Flujo completo hasta envío de información (prospecto de valor medio)
  await simulateConversation(
    [
      'Hola', // Saludo inicial
      'Soy Ana López de Logística Express', // Proporciona nombre y empresa
      'Tenemos unos 12 vehículos', // Información de flota
      'Sí, usamos un sistema básico pero no estamos satisfechos', // Información de solución actual
      'Tal vez en unos 3 meses', // Plazo de decisión
      'Soy asistente de logística', // Rol
      'Prefiero recibir información por este medio' // Solicita información
    ],
    'Caso 2: Flujo completo hasta envío de información (prospecto de valor medio)'
  );
  
  // Caso 3: Prospecto independiente de bajo valor
  await simulateConversation(
    [
      'Hola', // Saludo inicial
      'Soy Pedro y soy independiente', // Proporciona nombre e indica que es independiente
      'Solo tengo 2 vehículos', // Información de flota
      'No, nunca he usado algo así', // Información de solución actual
      'No lo sé, tal vez el próximo año', // Plazo de decisión
      'Soy el dueño', // Rol
      'Quiero más información sobre precios' // Solicita información específica
    ],
    'Caso 3: Prospecto independiente de bajo valor'
  );
  
  // Caso 4: Prospecto que no proporciona información completa
  await simulateConversation(
    [
      'Hola', // Saludo inicial
      'Quiero información sobre sus productos', // No proporciona nombre ni empresa
      'Quiero saber precios', // Sigue sin proporcionar información
      'No quiero dar mis datos', // Se niega a proporcionar información
      'Solo quiero saber cuánto cuesta' // Insiste en precios sin dar información
    ],
    'Caso 4: Prospecto que no proporciona información completa'
  );
  
  // Caso 5: Prospecto que cambia de opinión sobre la cita
  await simulateConversation(
    [
      'Hola', // Saludo inicial
      'Soy María González de Transportes Rápidos', // Proporciona nombre y empresa
      'Tenemos 30 vehículos', // Información de flota
      'No tenemos ningún sistema', // Información de solución actual
      'Lo necesitamos pronto', // Plazo de decisión
      'Soy Gerente de Operaciones', // Rol
      'Prefiero recibir información primero', // Solicita información
      'Ahora que lo pienso, mejor agendemos una llamada', // Cambia de opinión
      'El jueves a las 3 pm' // Proporciona fecha y hora
    ],
    'Caso 5: Prospecto que cambia de opinión sobre la cita'
  );
  
  console.log('\n=== PRUEBAS COMPLETADAS ===');
}

// Ejecutar las pruebas
runTests().catch(error => {
  console.error('Error en las pruebas:', error);
  process.exit(1);
}); 