/**
 * Test para validar el flujo completo de invitación
 * 
 * Este script prueba:
 * 1. Saludo inicial
 * 2. Calificación del prospecto
 * 3. Invitación y programación de cita
 */

require('dotenv').config();
const moment = require('moment-timezone');
const { generateOpenAIResponse } = require('../src/services/openaiService');
const campaignFlow = require('../src/flows/campaignFlow');
const invitationFlow = require('../src/flows/invitationFlow');
const logger = require('../src/utils/logger');

// Configuración de prueba
const TEST_PHONE = '51999999999'; // Número de prueba
const TEST_EMAIL = 'rcalvo.retana@gmail.com'; // Email para la invitación real

// Función principal de prueba
async function testInvitationFlow() {
  try {
    logger.info('Iniciando prueba del flujo de invitación');
    
    // Estado inicial del prospecto
    let prospectState = {
      phoneNumber: TEST_PHONE,
      name: 'Roberto Calvo',
      company: 'Logifit Test',
      conversationState: 'initial',
      lastInteraction: new Date(),
      timezone: 'America/Lima'
    };
    
    logger.info('Estado inicial del prospecto:', prospectState);
    
    // 1. Simular saludo inicial
    const initialMessage = "Hola, me interesa saber más sobre su sistema de monitoreo de fatiga";
    logger.info(`Mensaje del cliente: "${initialMessage}"`);
    
    let result = await campaignFlow.processMessage(initialMessage, prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    logger.info('Nuevo estado:', prospectState);
    
    // 2. Simular respuestas para calificación
    const qualificationResponses = [
      "Soy el gerente de operaciones de una empresa de transporte", // Rol
      "Tenemos una flota de 30 camiones", // Tamaño de flota
      "Sí, tenemos problemas con la fatiga de los conductores", // Problema
      "Estamos buscando una solución inmediata" // Urgencia
    ];
    
    for (const message of qualificationResponses) {
      logger.info(`Mensaje del cliente: "${message}"`);
      result = await campaignFlow.processMessage(message, prospectState);
      prospectState = result.newState;
      
      logger.info(`Respuesta del bot: "${result.response}"`);
      logger.info('Nuevo estado:', prospectState);
      
      // Esperar un momento entre mensajes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Verificar si el prospecto ha sido calificado correctamente
    if (prospectState.conversationState !== 'qualification' && 
        prospectState.conversationState !== 'invitation') {
      throw new Error('El prospecto no ha sido calificado correctamente');
    }
    
    logger.info('El prospecto ha sido calificado correctamente');
    
    // 3. Simular aceptación de invitación a demostración
    const acceptInvitationMessage = "Sí, me gustaría agendar una demostración";
    logger.info(`Mensaje del cliente: "${acceptInvitationMessage}"`);
    
    result = await campaignFlow.processMessage(acceptInvitationMessage, prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    logger.info('Nuevo estado:', prospectState);
    
    // 4. Simular aceptación del horario propuesto
    const acceptTimeMessage = "Sí, me parece bien ese horario";
    logger.info(`Mensaje del cliente: "${acceptTimeMessage}"`);
    
    result = await campaignFlow.processMessage(acceptTimeMessage, prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    logger.info('Nuevo estado:', prospectState);
    
    // 5. Proporcionar correo electrónico para la invitación
    const emailMessage = `Mi correo es ${TEST_EMAIL}`;
    logger.info(`Mensaje del cliente: "${emailMessage}"`);
    
    result = await campaignFlow.processMessage(emailMessage, prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    logger.info('Nuevo estado:', prospectState);
    
    // 6. Confirmar recepción de la invitación
    const confirmationMessage = "Recibido, gracias";
    logger.info(`Mensaje del cliente: "${confirmationMessage}"`);
    
    result = await campaignFlow.processMessage(confirmationMessage, prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    logger.info('Nuevo estado final:', prospectState);
    
    // Verificar si la cita fue creada correctamente
    if (!prospectState.appointmentCreated) {
      throw new Error('La cita no fue creada correctamente');
    }
    
    // Mostrar detalles de la cita
    logger.info('Detalles de la cita:');
    logger.info(`- Fecha: ${prospectState.appointmentDetails.date}`);
    logger.info(`- Hora: ${prospectState.appointmentDetails.time}`);
    logger.info(`- Email: ${prospectState.emails[0]}`);
    
    logger.info('Prueba completada con éxito');
    return {
      success: true,
      appointmentDetails: prospectState.appointmentDetails,
      email: prospectState.emails[0]
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
  testInvitationFlow()
    .then(result => {
      if (result.success) {
        logger.info('✅ Prueba exitosa. Se ha creado una cita para:');
        logger.info(`📅 Fecha: ${result.appointmentDetails.date}`);
        logger.info(`🕒 Hora: ${result.appointmentDetails.time}`);
        logger.info(`📧 Email: ${result.email}`);
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

module.exports = { testInvitationFlow }; 