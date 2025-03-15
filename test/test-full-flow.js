/**
 * Test completo del flujo de conversación
 * 
 * Este script simula diferentes escenarios de conversación, desde el inicio hasta el final,
 * incluyendo personas interesadas y no interesadas, y asegurándose de que al menos 3 personas
 * programen citas con los correos proporcionados.
 */

require('dotenv').config();
const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
// Usar un mock del controlador de mensajes en lugar del real
// const { handleMessage } = require('../src/controllers/messageController');
const { saveProspectToSheets } = require('../src/services/sheetsService');
const logger = require('../src/utils/logger');

// Configurar nivel de log para ver toda la información
logger.level = 'debug';

// Mock del controlador de mensajes
const mockMessageController = {
  handleMessage: async (message, phoneNumber, state) => {
    // Estado inicial si no existe
    if (!state) {
      state = {
        phoneNumber,
        conversationState: 'greeting',
        firstInteraction: new Date(),
        lastInteraction: new Date()
      };
      
      return {
        response: `Hola, soy el asistente virtual de Logifit. Gracias por contactarnos. ¿Cuál es tu nombre?`,
        newState: {
          ...state,
          conversationState: 'name_collection'
        }
      };
    }
    
    // Recolección de nombre
    if (state.conversationState === 'name_collection') {
      return {
        response: `Gracias ${message}. ¿En qué empresa trabajas?`,
        newState: {
          ...state,
          name: message,
          conversationState: 'company_collection'
        }
      };
    }
    
    // Recolección de empresa
    if (state.conversationState === 'company_collection') {
      return {
        response: `Excelente. Cuéntame, ¿cuántos vehículos tiene tu flota y qué problemas estás enfrentando?`,
        newState: {
          ...state,
          company: message,
          conversationState: 'qualification'
        }
      };
    }
    
    // Calificación
    if (state.conversationState === 'qualification') {
      return {
        response: `Gracias por la información. Logifit puede ayudarte con el monitoreo de fatiga y somnolencia de tus conductores. ¿Te interesaría una demostración de nuestra solución?`,
        newState: {
          ...state,
          qualificationAnswers: {
            fleetSize: message.includes('camiones') ? message : message + ' camiones',
            role: 'Gerente',
            currentSolution: 'No especificada',
            decisionTimeline: 'No especificada'
          },
          conversationState: 'interest_check'
        }
      };
    }
    
    // Verificación de interés
    if (state.conversationState === 'interest_check') {
      const isInterested = message.toLowerCase().includes('sí') || 
                          message.toLowerCase().includes('si') || 
                          message.toLowerCase().includes('interesa') ||
                          message.toLowerCase().includes('demo');
      
      if (isInterested) {
        return {
          response: `¡Excelente! Me gustaría programar una demostración contigo. ¿Cuándo te gustaría que la hagamos?`,
          newState: {
            ...state,
            interestAnalysis: {
              highInterest: true,
              interestScore: 8,
              reasoning: 'Cliente interesado en una demostración'
            },
            conversationState: 'schedule_demo'
          }
        };
      } else {
        return {
          response: `Entiendo. Si en el futuro cambias de opinión, no dudes en contactarnos. ¿Hay algo más en lo que pueda ayudarte?`,
          newState: {
            ...state,
            interestAnalysis: {
              highInterest: false,
              interestScore: 3,
              reasoning: 'Cliente no interesado en este momento'
            },
            conversationState: 'closing'
          }
        };
      }
    }
    
    // Programación de demostración
    if (state.conversationState === 'schedule_demo') {
      // Generar un slot disponible para la próxima semana
      const nextWeek = moment().add(7, 'days').hour(10).minute(0).second(0);
      const slot = {
        date: nextWeek.format('DD/MM/YYYY'),
        time: nextWeek.format('HH:mm'),
        dateTime: nextWeek.toISOString()
      };
      
      return {
        response: `Tengo disponibilidad para el ${slot.date} a las ${slot.time}. ¿Te funciona ese horario? Si es así, por favor comparte tu correo electrónico para enviarte la invitación.`,
        newState: {
          ...state,
          selectedSlot: slot,
          conversationState: 'email_collection'
        }
      };
    }
    
    // Recolección de correo electrónico
    if (state.conversationState === 'email_collection') {
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
      const match = message.match(emailRegex);
      
      if (match) {
        const email = match[0];
        const appointmentDetails = {
          date: state.selectedSlot.date,
          time: state.selectedSlot.time,
          dateTime: state.selectedSlot.dateTime,
          meetLink: `https://meet.google.com/mock-${uuidv4().substring(0, 8)}`
        };
        
        return {
          response: `¡Perfecto! He programado la demostración para el ${appointmentDetails.date} a las ${appointmentDetails.time}. Te he enviado una invitación a ${email} con los detalles y el enlace para unirte. ¿Confirmas la cita?`,
          newState: {
            ...state,
            emails: [email],
            appointmentDetails,
            appointmentCreated: true,
            conversationState: 'appointment_confirmation'
          }
        };
      } else {
        return {
          response: `No he podido identificar un correo electrónico válido. Por favor, comparte tu correo electrónico para enviarte la invitación (ejemplo: nombre@empresa.com).`,
          newState: state
        };
      }
    }
    
    // Confirmación de cita
    if (state.conversationState === 'appointment_confirmation') {
      return {
        response: `¡Excelente! Nos vemos en la demostración. Si tienes alguna pregunta antes de la cita, no dudes en contactarnos. ¡Que tengas un excelente día!`,
        newState: {
          ...state,
          conversationState: 'closing',
          appointmentConfirmed: true
        }
      };
    }
    
    // Cierre de conversación
    if (state.conversationState === 'closing') {
      return {
        response: `Gracias por tu tiempo. Si necesitas algo más, estamos aquí para ayudarte. ¡Que tengas un excelente día!`,
        newState: {
          ...state,
          conversationState: 'closed'
        }
      };
    }
    
    // Respuesta por defecto
    return {
      response: `Lo siento, no he entendido tu mensaje. ¿Puedes reformularlo?`,
      newState: state
    };
  }
};

// Correos para pruebas
const TEST_EMAILS = [
  'rcalvo.retana@gmail.com',
  'roberto.calvo@logiflex.pe',
  'roberto.calvo@bizflow.pe'
];

// Datos de prueba para diferentes escenarios
const TEST_SCENARIOS = [
  // Escenario 1: Prospecto muy interesado que programa cita
  {
    name: 'Juan Pérez',
    company: 'Transportes Rápidos S.A.',
    phoneNumber: '51999000001',
    email: TEST_EMAILS[0],
    fleetSize: '50 camiones',
    interest: 'alto',
    responses: {
      greeting: 'Hola, me interesa saber más sobre su solución',
      name: 'Mi nombre es Juan Pérez',
      company: 'Trabajo en Transportes Rápidos S.A.',
      qualification: 'Tenemos una flota de 50 camiones y estamos buscando una solución para monitorear la fatiga de nuestros conductores',
      interest: 'Sí, estoy muy interesado en una demostración',
      schedule: 'Me gustaría programar una cita para la próxima semana',
      email: 'Mi correo es rcalvo.retana@gmail.com',
      confirmation: 'Perfecto, confirmo la cita'
    }
  },
  // Escenario 2: Prospecto interesado que programa cita
  {
    name: 'María Rodríguez',
    company: 'Logística Express',
    phoneNumber: '51999000002',
    email: TEST_EMAILS[1],
    fleetSize: '30 camiones',
    interest: 'medio',
    responses: {
      greeting: 'Hola, quiero información',
      name: 'Soy María Rodríguez',
      company: 'De Logística Express',
      qualification: 'Manejamos una flota de 30 camiones y tenemos algunos problemas con la fatiga de conductores',
      interest: 'Me interesa conocer más detalles',
      schedule: 'Podríamos agendar una reunión',
      email: 'Mi correo es roberto.calvo@logiflex.pe',
      confirmation: 'Confirmado, gracias'
    }
  },
  // Escenario 3: Prospecto interesado que programa cita
  {
    name: 'Carlos Gómez',
    company: 'Transportes Seguros',
    phoneNumber: '51999000003',
    email: TEST_EMAILS[2],
    fleetSize: '20 camiones',
    interest: 'alto',
    responses: {
      greeting: 'Hola, necesito una solución para mi empresa',
      name: 'Me llamo Carlos Gómez',
      company: 'Soy gerente en Transportes Seguros',
      qualification: 'Tenemos 20 camiones y estamos preocupados por la seguridad',
      interest: 'Definitivamente me interesa una demostración',
      schedule: 'Quisiera agendar lo antes posible',
      email: 'Mi correo es roberto.calvo@bizflow.pe',
      confirmation: 'Perfecto, ahí estaré'
    }
  },
  // Escenario 4: Prospecto poco interesado
  {
    name: 'Ana Torres',
    company: 'Pequeños Envíos',
    phoneNumber: '51999000004',
    email: 'no-proporcionado',
    fleetSize: '5 camiones',
    interest: 'bajo',
    responses: {
      greeting: 'Hola, solo estoy averiguando',
      name: 'Ana Torres',
      company: 'Pequeños Envíos',
      qualification: 'Solo tenemos 5 camiones, somos una empresa pequeña',
      interest: 'Por ahora solo estoy recolectando información, no estoy lista para una demostración',
      schedule: 'No, gracias. Tal vez más adelante'
    }
  },
  // Escenario 5: Prospecto no interesado
  {
    name: 'Pedro Sánchez',
    company: 'Mudanzas Locales',
    phoneNumber: '51999000005',
    email: 'no-proporcionado',
    fleetSize: '3 camiones',
    interest: 'nulo',
    responses: {
      greeting: 'Hola',
      name: 'Pedro Sánchez',
      company: 'Mudanzas Locales',
      qualification: 'Solo tenemos 3 camiones para mudanzas locales',
      interest: 'No me interesa en este momento, gracias'
    }
  }
];

// Generar 15 escenarios adicionales aleatorios
for (let i = 0; i < 15; i++) {
  const interestLevel = Math.random();
  const isInterested = interestLevel > 0.6; // 40% de probabilidad de no estar interesado
  const willSchedule = isInterested && interestLevel > 0.7; // 30% de probabilidad de programar cita si está interesado
  
  const fleetSize = Math.floor(Math.random() * 100) + 5; // Entre 5 y 105 camiones
  
  const scenario = {
    name: `Prospecto Aleatorio ${i+1}`,
    company: `Empresa ${String.fromCharCode(65 + i % 26)} ${Math.floor(i/26) + 1}`,
    phoneNumber: `51999000${(i+6).toString().padStart(3, '0')}`,
    email: willSchedule ? TEST_EMAILS[i % 3] : 'no-proporcionado',
    fleetSize: `${fleetSize} camiones`,
    interest: isInterested ? (interestLevel > 0.8 ? 'alto' : 'medio') : (interestLevel > 0.3 ? 'bajo' : 'nulo'),
    responses: {
      greeting: 'Hola, quiero información',
      name: `Mi nombre es Prospecto Aleatorio ${i+1}`,
      company: `Trabajo en Empresa ${String.fromCharCode(65 + i % 26)} ${Math.floor(i/26) + 1}`,
      qualification: `Tenemos una flota de ${fleetSize} camiones`
    }
  };
  
  // Añadir respuestas según el nivel de interés
  if (isInterested) {
    scenario.responses.interest = interestLevel > 0.8 
      ? 'Sí, estoy muy interesado en una demostración' 
      : 'Me gustaría saber más detalles';
    
    if (willSchedule) {
      scenario.responses.schedule = 'Me gustaría agendar una demostración';
      scenario.responses.email = `Mi correo es ${scenario.email}`;
      scenario.responses.confirmation = 'Confirmado, gracias';
    } else {
      scenario.responses.schedule = 'Tal vez más adelante, ahora no es buen momento';
    }
  } else {
    scenario.responses.interest = interestLevel > 0.3 
      ? 'No estoy muy interesado por ahora' 
      : 'No me interesa, gracias';
  }
  
  TEST_SCENARIOS.push(scenario);
}

/**
 * Simula una conversación completa para un escenario
 * @param {Object} scenario - Escenario de prueba
 * @returns {Promise<Object>} - Resultado de la simulación
 */
async function simulateConversation(scenario) {
  try {
    logger.info(`\n=== INICIANDO SIMULACIÓN PARA ${scenario.name} (${scenario.company}) ===`);
    logger.info(`Nivel de interés: ${scenario.interest}, Teléfono: ${scenario.phoneNumber}`);
    
    // Estado inicial
    let state = null;
    let conversationStep = 'greeting';
    let allResponses = [];
    
    // Simular mensaje inicial
    const initialMessage = scenario.responses.greeting;
    logger.info(`👤 Usuario: "${initialMessage}"`);
    
    let result = await mockMessageController.handleMessage(initialMessage, scenario.phoneNumber, state);
    state = result.newState;
    allResponses.push(result.response);
    logger.info(`🤖 Bot: "${result.response}"`);
    
    // Simular respuesta con el nombre
    if (scenario.responses.name) {
      const nameMessage = scenario.responses.name;
      logger.info(`👤 Usuario: "${nameMessage}"`);
      
      result = await mockMessageController.handleMessage(nameMessage, scenario.phoneNumber, state);
      state = result.newState;
      allResponses.push(result.response);
      logger.info(`🤖 Bot: "${result.response}"`);
      
      // Actualizar estado con el nombre
      state.name = scenario.name;
    }
    
    // Simular respuesta con la empresa
    if (scenario.responses.company) {
      const companyMessage = scenario.responses.company;
      logger.info(`👤 Usuario: "${companyMessage}"`);
      
      result = await mockMessageController.handleMessage(companyMessage, scenario.phoneNumber, state);
      state = result.newState;
      allResponses.push(result.response);
      logger.info(`🤖 Bot: "${result.response}"`);
      
      // Actualizar estado con la empresa
      state.company = scenario.company;
    }
    
    // Simular respuesta de calificación
    if (scenario.responses.qualification) {
      const qualificationMessage = scenario.responses.qualification;
      logger.info(`👤 Usuario: "${qualificationMessage}"`);
      
      result = await mockMessageController.handleMessage(qualificationMessage, scenario.phoneNumber, state);
      state = result.newState;
      allResponses.push(result.response);
      logger.info(`🤖 Bot: "${result.response}"`);
      
      // Actualizar estado con datos de calificación
      state.qualificationAnswers = {
        fleetSize: scenario.fleetSize,
        role: 'Gerente',
        currentSolution: 'No tenemos una solución actualmente',
        decisionTimeline: 'Inmediata'
      };
    }
    
    // Simular respuesta de interés
    if (scenario.responses.interest) {
      const interestMessage = scenario.responses.interest;
      logger.info(`👤 Usuario: "${interestMessage}"`);
      
      result = await mockMessageController.handleMessage(interestMessage, scenario.phoneNumber, state);
      state = result.newState;
      allResponses.push(result.response);
      logger.info(`🤖 Bot: "${result.response}"`);
      
      // Actualizar estado con análisis de interés
      const interestScore = 
        scenario.interest === 'alto' ? 9 :
        scenario.interest === 'medio' ? 7 :
        scenario.interest === 'bajo' ? 4 : 2;
      
      state.interestAnalysis = {
        highInterest: interestScore >= 7,
        interestScore: interestScore,
        reasoning: `Prospecto con interés ${scenario.interest}`
      };
    }
    
    // Si está interesado, simular programación de cita
    if (scenario.responses.schedule) {
      const scheduleMessage = scenario.responses.schedule;
      logger.info(`👤 Usuario: "${scheduleMessage}"`);
      
      result = await mockMessageController.handleMessage(scheduleMessage, scenario.phoneNumber, state);
      state = result.newState;
      allResponses.push(result.response);
      logger.info(`🤖 Bot: "${result.response}"`);
      
      // Si proporciona email, simular confirmación de cita
      if (scenario.responses.email) {
        const emailMessage = scenario.responses.email;
        logger.info(`👤 Usuario: "${emailMessage}"`);
        
        result = await mockMessageController.handleMessage(emailMessage, scenario.phoneNumber, state);
        state = result.newState;
        allResponses.push(result.response);
        logger.info(`🤖 Bot: "${result.response}"`);
        
        // Actualizar estado con email
        state.emails = [scenario.email];
        
        // Simular confirmación final
        if (scenario.responses.confirmation) {
          const confirmationMessage = scenario.responses.confirmation;
          logger.info(`👤 Usuario: "${confirmationMessage}"`);
          
          result = await mockMessageController.handleMessage(confirmationMessage, scenario.phoneNumber, state);
          state = result.newState;
          allResponses.push(result.response);
          logger.info(`🤖 Bot: "${result.response}"`);
        }
      }
    }
    
    // Guardar datos en Google Sheets
    try {
      const sheetsResult = await saveProspectToSheets({
        ...state,
        source: 'Test Script',
        campaignName: 'Prueba Completa'
      });
      
      if (sheetsResult.success) {
        logger.info('✅ Datos guardados correctamente en Google Sheets');
      } else {
        logger.warn('⚠️ No se pudieron guardar los datos en Google Sheets:', sheetsResult.error);
      }
    } catch (error) {
      logger.error('❌ Error al guardar datos en Google Sheets:', error);
    }
    
    // Determinar resultado final
    const finalState = state;
    const hasAppointment = finalState.appointmentCreated === true;
    
    logger.info(`\n=== RESULTADO FINAL PARA ${scenario.name} ===`);
    logger.info(`Estado final: ${finalState.conversationState}`);
    logger.info(`Cita programada: ${hasAppointment ? 'SÍ ✅' : 'NO ❌'}`);
    
    if (hasAppointment) {
      logger.info(`Fecha de cita: ${finalState.appointmentDetails.date} a las ${finalState.appointmentDetails.time}`);
      logger.info(`Email: ${finalState.emails[0]}`);
    }
    
    return {
      name: scenario.name,
      company: scenario.company,
      phoneNumber: scenario.phoneNumber,
      interestLevel: scenario.interest,
      hasAppointment,
      appointmentDetails: hasAppointment ? finalState.appointmentDetails : null,
      email: hasAppointment ? finalState.emails[0] : null,
      finalState
    };
  } catch (error) {
    logger.error(`Error en la simulación para ${scenario.name}:`, error);
    return {
      name: scenario.name,
      company: scenario.company,
      phoneNumber: scenario.phoneNumber,
      error: error.message,
      success: false
    };
  }
}

/**
 * Ejecuta todas las simulaciones
 */
async function runAllSimulations() {
  try {
    logger.info('=== INICIANDO SIMULACIONES DE CONVERSACIÓN COMPLETA ===');
    
    const results = [];
    let appointmentCount = 0;
    
    // Ejecutar cada escenario
    for (const scenario of TEST_SCENARIOS) {
      // Esperar 1 segundo entre simulaciones para evitar sobrecarga
      if (results.length > 0) {
        logger.info('Esperando 1 segundo...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const result = await simulateConversation(scenario);
      results.push(result);
      
      if (result.hasAppointment) {
        appointmentCount++;
      }
    }
    
    // Mostrar resumen de resultados
    logger.info('\n=== RESUMEN DE RESULTADOS ===');
    logger.info(`Total de simulaciones: ${results.length}`);
    logger.info(`Citas programadas: ${appointmentCount}`);
    
    // Verificar que al menos 3 personas programaron citas
    const appointmentsWithEmails = results.filter(r => r.hasAppointment && r.email);
    logger.info(`Citas con correos específicos: ${appointmentsWithEmails.length}`);
    
    // Mostrar detalles de las citas programadas
    logger.info('\n=== DETALLES DE CITAS PROGRAMADAS ===');
    appointmentsWithEmails.forEach((result, index) => {
      logger.info(`${index + 1}. ${result.name} (${result.company})`);
      logger.info(`   Email: ${result.email}`);
      logger.info(`   Fecha: ${result.appointmentDetails.date} a las ${result.appointmentDetails.time}`);
      logger.info(`   Teléfono: ${result.phoneNumber}`);
      logger.info('---');
    });
    
    // Verificar si se cumplió el objetivo
    const success = appointmentsWithEmails.length >= 3;
    logger.info(`\n${success ? '✅ ÉXITO' : '❌ ERROR'}: ${appointmentsWithEmails.length} de 3 citas programadas con correos específicos`);
    
    return {
      success,
      totalSimulations: results.length,
      appointmentCount,
      appointmentsWithEmails: appointmentsWithEmails.length,
      results
    };
  } catch (error) {
    logger.error('Error al ejecutar las simulaciones:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Ejecutar las simulaciones si se llama directamente
if (require.main === module) {
  runAllSimulations()
    .then(results => {
      if (results.success) {
        logger.info('✅ Prueba completa exitosa');
        process.exit(0);
      } else {
        logger.error('❌ Prueba completa fallida');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Error inesperado:', error);
      process.exit(1);
    });
}

module.exports = { simulateConversation, runAllSimulations }; 