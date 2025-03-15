/**
 * Script para probar el flujo de saludo
 * 
 * Este script simula una conversación con el bot para probar
 * el flujo de saludo y la detección de nombres y empresas.
 */

// Configurar variables de entorno para pruebas
process.env.OPENAI_API_KEY = 'sk-test-key';
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

const greetingFlow = require('./src/flows/greetingFlow');

/**
 * Simula una conversación con el bot
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
    messageHistory: [],
    greetingAttempts: 0
  };
  
  // Enviar el primer mensaje (se enviará el saludo)
  console.log('Bot: ¡Hola! 👋😊 Soy Roberto Calvo, tu Asesor Comercial en LogiFit. ¡Será un placer acompañarte en este recorrido! ¿Me ayudas compartiendo tu nombre y el de tu empresa, por favor? 📦🚀');
  
  // Procesar cada mensaje del usuario
  for (const message of messages) {
    console.log(`Usuario: ${message}`);
    
    try {
      // Analizar el mensaje localmente primero
      const analysis = greetingFlow.analyzeMessage(message);
      console.log(`: Análisis local de respuesta:`);
      
      // Procesar el mensaje
      const result = await greetingFlow.handleInitialGreeting(message, state);
      
      // Actualizar el estado
      Object.assign(state, result.newState);
      
      // Mostrar la respuesta del bot
      console.log(`Bot: ${result.response}`);
      
      // Mostrar el estado actual
      console.log(`Estado: ${JSON.stringify({
        conversationState: state.conversationState,
        name: state.name,
        company: state.company,
        greetingAttempts: state.greetingAttempts
      }, null, 2)}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }
  
  // Mostrar resumen del caso
  console.log(`\nResumen del caso:`);
  console.log(`- Nombre final: ${state.name || 'No proporcionado'}`);
  console.log(`- Empresa final: ${state.company || 'No proporcionada'}`);
  console.log(`- Estado final: ${state.conversationState}`);
  console.log(`- Intentos de saludo: ${state.greetingAttempts || 1}`);
}

// Ejecutar las pruebas
async function runTests() {
  console.log('=== INICIANDO PRUEBAS DEL FLUJO DE SALUDO ===');
  console.log('Modo de prueba activado. Usando análisis local de mensajes.');
  
  // Caso 1: Usuario proporciona nombre y empresa completos
  await simulateConversation(
    ['Me llamo Juan Pérez y trabajo en Transportes ABC'],
    'Caso 1: Usuario proporciona nombre y empresa completos'
  );
  
  // Caso 2: Usuario proporciona solo nombre y luego empresa
  await simulateConversation(
    ['Soy María González', 'Trabajo en Logística XYZ'],
    'Caso 2: Usuario proporciona solo nombre y luego empresa'
  );
  
  // Caso 3: Usuario proporciona solo empresa y luego nombre
  await simulateConversation(
    ['Vengo de Empresa ABC', 'Me llamo Carlos'],
    'Caso 3: Usuario proporciona solo empresa y luego nombre'
  );
  
  // Caso 4: Usuario es independiente
  await simulateConversation(
    ['Soy Pedro y soy independiente'],
    'Caso 4: Usuario es independiente'
  );
  
  // Caso 5: Usuario no proporciona información después de varios intentos
  await simulateConversation(
    ['Hola', 'Estoy interesado en sus productos', 'Quiero más información'],
    'Caso 5: Usuario no proporciona información después de varios intentos'
  );
  
  // Caso 6: Usuario proporciona información parcial y luego completa
  await simulateConversation(
    ['Hola, soy Ana', 'Trabajo en Distribuidora XYZ'],
    'Caso 6: Usuario proporciona información parcial y luego completa'
  );
  
  console.log('\n=== PRUEBAS COMPLETADAS ===');
}

// Ejecutar las pruebas
runTests().catch(error => {
  console.error('Error en las pruebas:', error);
  process.exit(1);
}); 