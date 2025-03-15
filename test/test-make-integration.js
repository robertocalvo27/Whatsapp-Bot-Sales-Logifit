/**
 * Test para validar la integración con Make.com
 * 
 * Este script prueba:
 * 1. La creación de una cita en Google Calendar
 * 2. El envío de la invitación por correo electrónico
 * 3. La integración con Make.com
 */

require('dotenv').config();
const moment = require('moment-timezone');
const { generateOpenAIResponse } = require('../src/services/openaiService');
const campaignFlow = require('../src/flows/campaignFlow');
const invitationFlow = require('../src/flows/invitationFlow');
const { formatAppointmentData, sendAppointmentToMake } = require('../src/services/webhookService');
const logger = require('../src/utils/logger');

// Configuración de prueba
const TEST_PHONE = '51999999999'; // Número de prueba
const TEST_EMAIL = 'rcalvo.retana@gmail.com'; // Email para la invitación real

// Función principal de prueba
async function testMakeIntegration() {
  try {
    logger.info('Iniciando prueba de integración con Make.com');
    
    // Estado inicial del prospecto ya calificado
    let prospectState = {
      phoneNumber: TEST_PHONE,
      name: 'Roberto Calvo',
      company: 'Logifit Test',
      conversationState: 'qualification',
      qualificationStep: 'completed',
      qualificationAnswers: {
        role: 'Gerente de Operaciones',
        fleetSize: '30 camiones',
        currentSolution: 'Sí, tenemos problemas con la fatiga',
        decisionTimeline: 'Inmediata'
      },
      interestAnalysis: {
        highInterest: true,
        interestScore: 9,
        shouldOfferAppointment: true,
        reasoning: 'Prospecto de alto valor con necesidad inmediata'
      },
      lastInteraction: new Date(),
      timezone: 'America/Lima'
    };
    
    logger.info('Estado inicial del prospecto:', prospectState);
    
    // 1. Obtener un horario disponible
    logger.info('Obteniendo horario disponible...');
    
    let result = await invitationFlow.offerAvailableTimeSlot(prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    logger.info('Horario sugerido:', prospectState.suggestedSlot);
    
    // 2. Simular aceptación del horario
    logger.info('Simulando aceptación del horario...');
    
    result = await invitationFlow.handleScheduleConfirmation("Sí, me parece bien ese horario", prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    logger.info('Horario seleccionado:', prospectState.selectedSlot);
    
    // 3. Proporcionar correo electrónico
    logger.info('Proporcionando correo electrónico...');
    
    result = await invitationFlow.handleEmailCollection(`Mi correo es ${TEST_EMAIL}`, prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    
    // 4. Verificar si la cita fue creada correctamente
    if (!prospectState.appointmentCreated) {
      throw new Error('La cita no fue creada correctamente');
    }
    
    // 5. Mostrar detalles de la cita y datos enviados a Make.com
    logger.info('Detalles de la cita:');
    logger.info(`- Fecha: ${prospectState.appointmentDetails.date}`);
    logger.info(`- Hora: ${prospectState.appointmentDetails.time}`);
    logger.info(`- Email: ${prospectState.emails[0]}`);
    
    // 6. Mostrar los datos que se enviaron a Make.com
    const webhookData = formatAppointmentData(prospectState, prospectState.appointmentDetails);
    logger.info('Datos enviados a Make.com:', JSON.stringify(webhookData, null, 2));
    
    logger.info('Prueba completada con éxito');
    return {
      success: true,
      appointmentDetails: prospectState.appointmentDetails,
      email: prospectState.emails[0],
      webhookData
    };
  } catch (error) {
    logger.error('Error en la prueba:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Ejecutar la prueba
if (require.main === module) {
  testMakeIntegration()
    .then(result => {
      if (result.success) {
        logger.info('✅ Prueba exitosa. Se ha creado una cita para:');
        logger.info(`📅 Fecha: ${result.appointmentDetails.date}`);
        logger.info(`🕒 Hora: ${result.appointmentDetails.time}`);
        logger.info(`📧 Email: ${result.email}`);
        logger.info('Verifica tu correo para confirmar la recepción de la invitación.');
      } else {
        logger.error('❌ Prueba fallida:', result.error);
      }
      process.exit(0);
    })
    .catch(error => {
      logger.error('Error inesperado:', error);
      process.exit(1);
    });
}

module.exports = { testMakeIntegration }; 