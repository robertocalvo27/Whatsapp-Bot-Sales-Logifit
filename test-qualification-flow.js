/**
 * Script para probar el flujo de calificación
 * 
 * Este script simula una conversación con el bot para probar
 * el flujo de calificación y la detección de roles y potencial.
 */

// Configurar variables de entorno para pruebas
process.env.OPENAI_API_KEY = 'sk-test-key';
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.VENDEDOR_NOMBRE = 'Roberto Calvo';

// Importar el flujo de calificación
const qualificationFlow = require('./src/flows/qualificationFlow');

/**
 * Simula una conversación con el bot
 * @param {Array<string>} userMessages - Mensajes del usuario
 * @param {string} testCaseName - Nombre del caso de prueba
 * @param {Object} initialState - Estado inicial opcional
 */
async function simulateConversation(userMessages, testCaseName, initialState = null) {
  console.log(`\n----- ${testCaseName} -----`);
  
  // Estado inicial del prospecto
  let state = initialState || {
    conversationState: 'initial_qualification',
    name: 'Juan Pérez',
    company: 'Transportes ABC',
    qualificationStep: 'No definido'
  };
  
  console.log('Estado inicial:');
  console.log(JSON.stringify(state, null, 2));
  
  // Procesar cada mensaje del usuario
  for (const userMessage of userMessages) {
    console.log(`\nUsuario: ${userMessage}`);
    
    // Registrar tiempo de inicio
    const startTime = Date.now();
    
    // Procesar el mensaje
    const { response, newState } = await qualificationFlow.startQualification(userMessage, state);
    
    // Calcular tiempo de respuesta
    const responseTime = Date.now() - startTime;
    
    // Mostrar respuesta del bot y tiempo
    console.log(`Bot: ${response}`);
    console.log(`Tiempo de respuesta: ${responseTime}ms`);
    
    // Actualizar el estado
    state = newState;
    
    // Mostrar el estado actual
    console.log('Estado actual:', JSON.stringify(state, null, 2));
  }
  
  // Mostrar resumen del caso
  console.log('\nResumen del caso:');
  console.log(`- Nombre: ${state.name}`);
  console.log(`- Empresa: ${state.company}`);
  console.log(`- Tamaño de flota: ${state.fleetSize || 'desconocido'} (${state.fleetSizeCategory || 'desconocido'})`);
  console.log(`- Solución actual: ${state.hasSolution ? 'Sí' : 'No'}`);
  console.log(`- Plazo de decisión: ${state.decisionTimeline || 'desconocido'}`);
  console.log(`- Urgencia: ${state.urgency || 'desconocida'}`);
  console.log(`- Rol: ${state.role || 'No especificado'}`);
  console.log(`- Tomador de decisiones: ${state.isDecisionMaker ? 'Sí' : 'No'}`);
  if (state.prospectType) console.log(`- Tipo de prospecto: ${state.prospectType}`);
  if (state.prospectPotential) console.log(`- Potencial: ${state.prospectPotential}`);
  console.log(`- Estado final: ${state.conversationState}`);
  console.log(`- Calificación completa: ${state.qualificationComplete ? 'Sí' : 'No'}`);
}

// Ejecutar las pruebas
async function runTests() {
  console.log('=== INICIANDO PRUEBAS DEL FLUJO DE CALIFICACIÓN ===');
  console.log('Modo de prueba activado. Usando análisis local de mensajes.');
  
  // Caso 1: Prospecto con flota grande y tomador de decisiones
  await simulateConversation(
    [
      'Tenemos una flota de 50 vehículos', 
      'No, actualmente no usamos ningún sistema de monitoreo', 
      'Estamos evaluando implementarlo en el próximo mes',
      'Mi cargo es Gerente de Transporte en la empresa',
      'Sí, me gustaría agendar una llamada' // Respuesta al último paso
    ],
    'Caso 1: Prospecto con flota grande y tomador de decisiones'
  );
  
  // Caso 2: Prospecto con flota mediana y no tomador de decisiones
  await simulateConversation(
    [
      'Manejamos unos 15 camiones', 
      'Sí, usamos Guardvant pero no estamos satisfechos', 
      'Probablemente en unos 3 meses',
      'Trabajo como asistente del área de logística',
      'Prefiero recibir información por este medio' // Respuesta al último paso
    ],
    'Caso 2: Prospecto con flota mediana y no tomador de decisiones'
  );
  
  // Caso 3: Prospecto con flota pequeña e independiente
  await simulateConversation(
    [
      'Solo tenemos 3 vehículos', 
      'No, nunca hemos usado algo así', 
      'No lo sé, tal vez el próximo año',
      'Soy el dueño y propietario de la empresa',
      'Quiero más información sobre precios' // Respuesta al último paso
    ],
    'Caso 3: Prospecto con flota pequeña e independiente'
  );
  
  // Caso 4: Prospecto con urgencia alta
  await simulateConversation(
    [
      'Tenemos 25 unidades', 
      'No tenemos ningún sistema', 
      'Lo necesitamos urgentemente, esta semana si es posible',
      'Mi puesto es Director de Seguridad en la compañía',
      'Sí, agendemos una llamada' // Respuesta al último paso
    ],
    'Caso 4: Prospecto con urgencia alta'
  );
  
  // Caso 5: Prospecto que ya tiene una solución de la competencia
  await simulateConversation(
    [
      'Contamos con 40 vehículos', 
      'Sí, actualmente usamos Seeing Machines pero buscamos alternativas', 
      'En los próximos 30 días',
      'Soy el Coordinador de Flota de la empresa',
      'Me gustaría recibir más información' // Respuesta al último paso
    ],
    'Caso 5: Prospecto que ya tiene una solución de la competencia'
  );
  
  // Caso 6: Prospecto con nombre desconocido (para probar el salto de la confirmación de rol)
  await simulateConversation(
    [
      'Tenemos 20 vehículos', 
      'No usamos ningún sistema actualmente', 
      'Estamos evaluando para el próximo trimestre',
      'No quiero dar mi puesto' // Añadir un mensaje adicional para ver la respuesta
    ],
    'Caso 6: Prospecto con nombre desconocido',
    {
      name: 'Desconocido',
      company: 'Empresa XYZ'
    }
  );
  
  console.log('\n=== PRUEBAS COMPLETADAS ===');
}

// Ejecutar las pruebas
runTests().catch(error => {
  console.error('Error en las pruebas:', error);
  process.exit(1);
}); 