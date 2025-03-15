/**
 * Script de demostración para marketing
 * 
 * Este script simula 10 conversaciones completas para demostrar
 * la integración con Google Sheets y el flujo completo del bot.
 */

require('dotenv').config();
const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
const { saveProspectToSheets } = require('../src/services/sheetsService');
const logger = require('../src/utils/logger');

// Configurar nivel de log para ver toda la información
logger.level = 'debug';

// Correos para pruebas
const TEST_EMAILS = [
  'rcalvo.retana@gmail.com',
  'roberto.calvo@logiflex.pe',
  'roberto.calvo@bizflow.pe',
  'marketing@logiflex.pe',
  'ventas@logiflex.pe'
];

// Datos de prueba para diferentes escenarios de marketing
const MARKETING_SCENARIOS = [
  // Escenario 1: Prospecto de campaña Facebook con flota grande e interés alto
  {
    name: 'Luis Mendoza',
    company: 'Transportes Nacionales S.A.',
    phoneNumber: '51920000001',
    email: TEST_EMAILS[0],
    fleetSize: '120 camiones',
    interest: 'alto',
    source: 'Facebook Ads',
    campaignName: 'Campaña Fatiga Marzo 2025',
    responses: {
      greeting: 'Hola, vi su anuncio en Facebook sobre monitoreo de fatiga',
      name: 'Mi nombre es Luis Mendoza',
      company: 'Soy gerente de operaciones en Transportes Nacionales',
      qualification: 'Tenemos una flota de 120 camiones y estamos buscando mejorar la seguridad',
      interest: 'Estoy muy interesado en implementar su solución lo antes posible',
      schedule: 'Me gustaría agendar una demostración esta semana',
      email: 'Mi correo es rcalvo.retana@gmail.com',
      confirmation: 'Perfecto, confirmo la cita'
    }
  },
  // Escenario 2: Prospecto de LinkedIn con flota mediana e interés medio-alto
  {
    name: 'Carolina Vásquez',
    company: 'Logística Integral',
    phoneNumber: '51920000002',
    email: TEST_EMAILS[1],
    fleetSize: '45 camiones',
    interest: 'medio-alto',
    source: 'LinkedIn',
    campaignName: 'InMails Seguridad Vial 2025',
    responses: {
      greeting: 'Hola, recibí su mensaje en LinkedIn',
      name: 'Soy Carolina Vásquez',
      company: 'Trabajo en Logística Integral como directora de seguridad',
      qualification: 'Tenemos 45 camiones y hemos tenido algunos incidentes por fatiga',
      interest: 'Me interesa conocer más sobre su tecnología',
      schedule: 'Podríamos coordinar una reunión virtual',
      email: 'Mi correo es roberto.calvo@logiflex.pe',
      confirmation: 'Confirmado, nos vemos en la reunión'
    }
  },
  // Escenario 3: Prospecto de Google Ads con flota grande e interés alto
  {
    name: 'Roberto Guzmán',
    company: 'Transportes Express Internacional',
    phoneNumber: '51920000003',
    email: TEST_EMAILS[2],
    fleetSize: '85 camiones',
    interest: 'alto',
    source: 'Google Ads',
    campaignName: 'Search Monitoreo Fatiga 2025',
    responses: {
      greeting: 'Buenas tardes, encontré su página web buscando soluciones de monitoreo de fatiga',
      name: 'Me llamo Roberto Guzmán',
      company: 'Soy dueño de Transportes Express Internacional',
      qualification: 'Operamos 85 camiones en rutas internacionales y la seguridad es prioridad',
      interest: 'Definitivamente necesitamos una solución como la suya',
      schedule: 'Quisiera una demostración lo antes posible',
      email: 'Pueden contactarme a roberto.calvo@bizflow.pe',
      confirmation: 'Perfecto, ahí estaré'
    }
  },
  // Escenario 4: Prospecto de Email Marketing con flota mediana e interés medio
  {
    name: 'Patricia Morales',
    company: 'Distribuidora Central',
    phoneNumber: '51920000004',
    email: TEST_EMAILS[3],
    fleetSize: '30 camiones',
    interest: 'medio',
    source: 'Email Marketing',
    campaignName: 'Newsletter Marzo 2025',
    responses: {
      greeting: 'Hola, recibí su correo sobre soluciones de seguridad',
      name: 'Soy Patricia Morales',
      company: 'Trabajo en Distribuidora Central',
      qualification: 'Tenemos 30 camiones para distribución urbana',
      interest: 'Me interesa saber más sobre costos y beneficios',
      schedule: 'Podríamos agendar una llamada para la próxima semana',
      email: 'Mi correo es marketing@logiflex.pe',
      confirmation: 'Confirmado, gracias'
    }
  },
  // Escenario 5: Prospecto de Referido con flota pequeña e interés alto
  {
    name: 'Miguel Soto',
    company: 'Transportes Regionales',
    phoneNumber: '51920000005',
    email: TEST_EMAILS[4],
    fleetSize: '15 camiones',
    interest: 'alto',
    source: 'Referido',
    campaignName: 'Programa de Referidos',
    responses: {
      greeting: 'Hola, me recomendó su servicio Transportes Nacionales',
      name: 'Mi nombre es Miguel Soto',
      company: 'Tengo una empresa llamada Transportes Regionales',
      qualification: 'Aunque solo tenemos 15 camiones, la seguridad es fundamental para nosotros',
      interest: 'Estoy muy interesado en implementar su solución',
      schedule: 'Me gustaría agendar una visita a sus oficinas',
      email: 'Mi correo es ventas@logiflex.pe',
      confirmation: 'Perfecto, nos vemos entonces'
    }
  },
  // Escenario 6: Prospecto de Feria con flota grande e interés medio-bajo
  {
    name: 'Fernando Ríos',
    company: 'Carga Pesada S.A.',
    phoneNumber: '51920000006',
    email: 'no-proporcionado',
    fleetSize: '70 camiones',
    interest: 'medio-bajo',
    source: 'Feria Transporte',
    campaignName: 'Expo Transporte 2025',
    responses: {
      greeting: 'Hola, los visité en su stand de la feria',
      name: 'Soy Fernando Ríos',
      company: 'De Carga Pesada S.A.',
      qualification: 'Tenemos 70 camiones pero ya usamos otro sistema',
      interest: 'Solo estoy explorando opciones alternativas',
      schedule: 'Por ahora no estoy interesado en una demostración'
    }
  },
  // Escenario 7: Prospecto de Instagram con flota mediana e interés alto
  {
    name: 'Diana Ortiz',
    company: 'Transportes Seguros',
    phoneNumber: '51920000007',
    email: TEST_EMAILS[0],
    fleetSize: '40 camiones',
    interest: 'alto',
    source: 'Instagram',
    campaignName: 'Stories Seguridad Vial',
    responses: {
      greeting: 'Hola, vi su publicación en Instagram',
      name: 'Me llamo Diana Ortiz',
      company: 'Soy gerente en Transportes Seguros',
      qualification: 'Tenemos 40 camiones y la seguridad es nuestra prioridad',
      interest: 'Me interesa mucho su solución de monitoreo',
      schedule: 'Quisiera agendar una demostración',
      email: 'Mi correo es rcalvo.retana@gmail.com',
      confirmation: 'Confirmado, gracias'
    }
  },
  // Escenario 8: Prospecto de YouTube con flota pequeña e interés medio
  {
    name: 'Javier Paredes',
    company: 'Transportes Locales',
    phoneNumber: '51920000008',
    email: TEST_EMAILS[1],
    fleetSize: '12 camiones',
    interest: 'medio',
    source: 'YouTube',
    campaignName: 'Video Testimoniales',
    responses: {
      greeting: 'Hola, vi su video en YouTube sobre prevención de accidentes',
      name: 'Soy Javier Paredes',
      company: 'De Transportes Locales',
      qualification: 'Tenemos una pequeña flota de 12 camiones',
      interest: 'Me interesa saber si su solución es adecuada para flotas pequeñas',
      schedule: 'Me gustaría programar una llamada informativa',
      email: 'Mi correo es roberto.calvo@logiflex.pe',
      confirmation: 'Perfecto, ahí estaré'
    }
  },
  // Escenario 9: Prospecto de TikTok con flota mediana e interés alto
  {
    name: 'Alejandra Rojas',
    company: 'Transportes Eficientes',
    phoneNumber: '51920000009',
    email: TEST_EMAILS[2],
    fleetSize: '35 camiones',
    interest: 'alto',
    source: 'TikTok',
    campaignName: 'TikTok Ads Marzo 2025',
    responses: {
      greeting: 'Hola, vi su video en TikTok sobre la tecnología de monitoreo',
      name: 'Me llamo Alejandra Rojas',
      company: 'Soy directora de Transportes Eficientes',
      qualification: 'Tenemos 35 camiones y estamos muy interesados en mejorar la seguridad',
      interest: 'Definitivamente queremos implementar su solución',
      schedule: 'Quisiera agendar una demostración esta semana',
      email: 'Mi correo es roberto.calvo@bizflow.pe',
      confirmation: 'Confirmado, nos vemos'
    }
  },
  // Escenario 10: Prospecto de Webinar con flota grande e interés alto
  {
    name: 'Raúl Mendoza',
    company: 'Logística Nacional',
    phoneNumber: '51920000010',
    email: TEST_EMAILS[3],
    fleetSize: '95 camiones',
    interest: 'alto',
    source: 'Webinar',
    campaignName: 'Webinar Seguridad Vial 2025',
    responses: {
      greeting: 'Hola, participé en su webinar sobre fatiga en conductores',
      name: 'Soy Raúl Mendoza',
      company: 'De Logística Nacional',
      qualification: 'Manejamos una flota de 95 camiones a nivel nacional',
      interest: 'Estoy muy interesado en su solución después de ver la presentación',
      schedule: 'Me gustaría agendar una demostración personalizada',
      email: 'Mi correo es marketing@logiflex.pe',
      confirmation: 'Perfecto, confirmo la cita'
    }
  }
];

/**
 * Simula una conversación completa para un escenario de marketing
 * @param {Object} scenario - Escenario de prueba
 * @returns {Promise<Object>} - Resultado de la simulación
 */
async function simulateMarketingConversation(scenario) {
  try {
    logger.info(`\n=== INICIANDO SIMULACIÓN PARA ${scenario.name} (${scenario.company}) ===`);
    logger.info(`Fuente: ${scenario.source}, Campaña: ${scenario.campaignName}`);
    logger.info(`Nivel de interés: ${scenario.interest}, Teléfono: ${scenario.phoneNumber}`);
    
    // Estado inicial
    let state = {
      phoneNumber: scenario.phoneNumber,
      conversationState: 'greeting',
      firstInteraction: new Date(),
      lastInteraction: new Date(),
      source: scenario.source,
      campaignName: scenario.campaignName
    };
    
    // Simular flujo de conversación
    logger.info(`👤 Usuario: "${scenario.responses.greeting}"`);
    
    // Recolección de nombre
    state.conversationState = 'name_collection';
    logger.info(`🤖 Bot: "Hola, soy el asistente virtual de Logifit. Gracias por contactarnos. ¿Cuál es tu nombre?"`);
    
    if (scenario.responses.name) {
      logger.info(`👤 Usuario: "${scenario.responses.name}"`);
      state.name = scenario.name;
      state.conversationState = 'company_collection';
      logger.info(`🤖 Bot: "Gracias ${scenario.name}. ¿En qué empresa trabajas?"`);
    }
    
    // Recolección de empresa
    if (scenario.responses.company) {
      logger.info(`👤 Usuario: "${scenario.responses.company}"`);
      state.company = scenario.company;
      state.conversationState = 'qualification';
      logger.info(`🤖 Bot: "Excelente. Cuéntame, ¿cuántos vehículos tiene tu flota y qué problemas estás enfrentando?"`);
    }
    
    // Calificación
    if (scenario.responses.qualification) {
      logger.info(`👤 Usuario: "${scenario.responses.qualification}"`);
      state.qualificationAnswers = {
        fleetSize: scenario.fleetSize,
        role: 'Gerente',
        currentSolution: 'No especificada',
        decisionTimeline: 'No especificada'
      };
      state.conversationState = 'interest_check';
      logger.info(`🤖 Bot: "Gracias por la información. Logifit puede ayudarte con el monitoreo de fatiga y somnolencia de tus conductores. ¿Te interesaría una demostración de nuestra solución?"`);
    }
    
    // Verificación de interés
    if (scenario.responses.interest) {
      logger.info(`👤 Usuario: "${scenario.responses.interest}"`);
      
      // Determinar nivel de interés
      const isHighInterest = scenario.interest.includes('alto');
      const interestScore = 
        scenario.interest === 'alto' ? 9 :
        scenario.interest === 'medio-alto' ? 8 :
        scenario.interest === 'medio' ? 7 :
        scenario.interest === 'medio-bajo' ? 5 : 3;
      
      state.interestAnalysis = {
        highInterest: isHighInterest,
        interestScore: interestScore,
        reasoning: `Prospecto con interés ${scenario.interest}`
      };
      
      if (isHighInterest || scenario.interest.includes('medio')) {
        state.conversationState = 'schedule_demo';
        logger.info(`🤖 Bot: "¡Excelente! Me gustaría programar una demostración contigo. ¿Cuándo te gustaría que la hagamos?"`);
      } else {
        state.conversationState = 'closing';
        logger.info(`🤖 Bot: "Entiendo. Si en el futuro cambias de opinión, no dudes en contactarnos. ¿Hay algo más en lo que pueda ayudarte?"`);
      }
    }
    
    // Programación de demostración
    if (scenario.responses.schedule && state.conversationState === 'schedule_demo') {
      logger.info(`👤 Usuario: "${scenario.responses.schedule}"`);
      
      // Generar un slot disponible para la próxima semana
      const nextWeek = moment().add(7, 'days').hour(10).minute(0).second(0);
      const slot = {
        date: nextWeek.format('DD/MM/YYYY'),
        time: nextWeek.format('HH:mm'),
        dateTime: nextWeek.toISOString()
      };
      
      state.selectedSlot = slot;
      state.conversationState = 'email_collection';
      logger.info(`🤖 Bot: "Tengo disponibilidad para el ${slot.date} a las ${slot.time}. ¿Te funciona ese horario? Si es así, por favor comparte tu correo electrónico para enviarte la invitación."`);
    } else if (scenario.responses.schedule) {
      logger.info(`👤 Usuario: "${scenario.responses.schedule}"`);
      state.conversationState = 'closed';
      logger.info(`🤖 Bot: "Gracias por tu tiempo. Si necesitas algo más, estamos aquí para ayudarte. ¡Que tengas un excelente día!"`);
    }
    
    // Recolección de correo electrónico
    if (scenario.responses.email && state.conversationState === 'email_collection') {
      logger.info(`👤 Usuario: "${scenario.responses.email}"`);
      
      const appointmentDetails = {
        date: state.selectedSlot.date,
        time: state.selectedSlot.time,
        dateTime: state.selectedSlot.dateTime,
        meetLink: `https://meet.google.com/mock-${uuidv4().substring(0, 8)}`
      };
      
      state.emails = [scenario.email];
      state.appointmentDetails = appointmentDetails;
      state.appointmentCreated = true;
      state.conversationState = 'appointment_confirmation';
      
      logger.info(`🤖 Bot: "¡Perfecto! He programado la demostración para el ${appointmentDetails.date} a las ${appointmentDetails.time}. Te he enviado una invitación a ${scenario.email} con los detalles y el enlace para unirte. ¿Confirmas la cita?"`);
    }
    
    // Confirmación de cita
    if (scenario.responses.confirmation && state.conversationState === 'appointment_confirmation') {
      logger.info(`👤 Usuario: "${scenario.responses.confirmation}"`);
      
      state.conversationState = 'closing';
      state.appointmentConfirmed = true;
      
      logger.info(`🤖 Bot: "¡Excelente! Nos vemos en la demostración. Si tienes alguna pregunta antes de la cita, no dudes en contactarnos. ¡Que tengas un excelente día!"`);
    }
    
    // Guardar datos en Google Sheets
    try {
      const sheetsResult = await saveProspectToSheets(state);
      
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
      source: scenario.source,
      campaignName: scenario.campaignName,
      interestLevel: scenario.interest,
      fleetSize: scenario.fleetSize,
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
 * Ejecuta todas las simulaciones de marketing
 */
async function runMarketingSimulations() {
  try {
    logger.info('=== INICIANDO SIMULACIONES DE MARKETING ===');
    
    const results = [];
    let appointmentCount = 0;
    
    // Ejecutar cada escenario
    for (const scenario of MARKETING_SCENARIOS) {
      // Esperar 1 segundo entre simulaciones para evitar sobrecarga
      if (results.length > 0) {
        logger.info('Esperando 1 segundo...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const result = await simulateMarketingConversation(scenario);
      results.push(result);
      
      if (result.hasAppointment) {
        appointmentCount++;
      }
    }
    
    // Mostrar resumen de resultados
    logger.info('\n=== RESUMEN DE RESULTADOS DE MARKETING ===');
    logger.info(`Total de simulaciones: ${results.length}`);
    logger.info(`Citas programadas: ${appointmentCount}`);
    
    // Mostrar detalles por fuente de marketing
    const sourceStats = {};
    results.forEach(result => {
      if (!sourceStats[result.source]) {
        sourceStats[result.source] = {
          total: 0,
          appointments: 0,
          conversion: 0
        };
      }
      
      sourceStats[result.source].total++;
      if (result.hasAppointment) {
        sourceStats[result.source].appointments++;
      }
    });
    
    // Calcular tasas de conversión
    Object.keys(sourceStats).forEach(source => {
      const stats = sourceStats[source];
      stats.conversion = (stats.appointments / stats.total) * 100;
    });
    
    logger.info('\n=== ESTADÍSTICAS POR FUENTE DE MARKETING ===');
    Object.keys(sourceStats).forEach(source => {
      const stats = sourceStats[source];
      logger.info(`${source}: ${stats.appointments}/${stats.total} (${stats.conversion.toFixed(1)}% conversión)`);
    });
    
    // Mostrar detalles de las citas programadas
    logger.info('\n=== DETALLES DE CITAS PROGRAMADAS POR MARKETING ===');
    results.filter(r => r.hasAppointment).forEach((result, index) => {
      logger.info(`${index + 1}. ${result.name} (${result.company})`);
      logger.info(`   Fuente: ${result.source} - Campaña: ${result.campaignName}`);
      logger.info(`   Email: ${result.email}`);
      logger.info(`   Fecha: ${result.appointmentDetails.date} a las ${result.appointmentDetails.time}`);
      logger.info(`   Teléfono: ${result.phoneNumber}`);
      logger.info(`   Tamaño de flota: ${result.fleetSize}`);
      logger.info('---');
    });
    
    return {
      success: true,
      totalSimulations: results.length,
      appointmentCount,
      sourceStats,
      results
    };
  } catch (error) {
    logger.error('Error al ejecutar las simulaciones de marketing:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Ejecutar las simulaciones si se llama directamente
if (require.main === module) {
  runMarketingSimulations()
    .then(results => {
      if (results.success) {
        logger.info('✅ Demostración de marketing completada exitosamente');
        process.exit(0);
      } else {
        logger.error('❌ Demostración de marketing fallida');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Error inesperado:', error);
      process.exit(1);
    });
}

module.exports = { simulateMarketingConversation, runMarketingSimulations }; 