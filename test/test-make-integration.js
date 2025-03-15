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
const axios = require('axios');

// Configuración de prueba
const TEST_PHONE = '51999999999'; // Número de prueba
const TEST_EMAIL = 'rcalvo.retana@gmail.com'; // Email para la invitación real

// Configurar nivel de log para ver toda la información
logger.level = 'debug';

// Función principal de prueba
async function testMakeIntegration() {
  try {
    logger.info('Iniciando prueba de integración con Make.com');
    
    // Verificar la URL del webhook
    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('No se ha configurado la URL del webhook de Make.com en el archivo .env');
    }
    logger.info(`URL del webhook configurada: ${webhookUrl}`);
    
    // Verificar la configuración del vendedor
    const vendedorEmail = process.env.VENDEDOR_EMAIL;
    const vendedorNombre = process.env.VENDEDOR_NOMBRE;
    if (!vendedorEmail || !vendedorNombre) {
      logger.warn('⚠️ No se ha configurado correctamente la información del vendedor en .env');
      logger.warn(`VENDEDOR_EMAIL: ${vendedorEmail || 'No configurado'}`);
      logger.warn(`VENDEDOR_NOMBRE: ${vendedorNombre || 'No configurado'}`);
    } else {
      logger.info(`Vendedor configurado: ${vendedorNombre} <${vendedorEmail}>`);
    }
    
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
    
    // Asegurarse de que el correo sea el correcto
    const emailMessage = `Mi correo es ${TEST_EMAIL}`;
    logger.info(`Mensaje del cliente: "${emailMessage}"`);
    
    result = await invitationFlow.handleEmailCollection(emailMessage, prospectState);
    prospectState = result.newState;
    
    logger.info(`Respuesta del bot: "${result.response}"`);
    
    // 4. Verificar si la cita fue creada correctamente
    if (!prospectState.appointmentCreated) {
      throw new Error('La cita no fue creada correctamente');
    }
    
    // Verificar que el correo se haya guardado correctamente
    if (!prospectState.emails || prospectState.emails.length === 0 || prospectState.emails[0] !== TEST_EMAIL) {
      throw new Error(`El correo no se guardó correctamente. Emails guardados: ${JSON.stringify(prospectState.emails)}`);
    }
    
    // 5. Mostrar detalles de la cita y datos enviados a Make.com
    logger.info('Detalles de la cita:');
    logger.info(`- Fecha: ${prospectState.appointmentDetails.date}`);
    logger.info(`- Hora: ${prospectState.appointmentDetails.time}`);
    logger.info(`- Email: ${prospectState.emails[0]}`);
    
    // 6. Mostrar los datos que se enviaron a Make.com
    const webhookData = formatAppointmentData(prospectState, prospectState.appointmentDetails);
    logger.info('Datos enviados a Make.com:', JSON.stringify(webhookData, null, 2));
    
    // 7. Enviar manualmente los datos al webhook para asegurarnos
    logger.info('Enviando datos manualmente al webhook de Make.com...');
    
    try {
      // Enviar directamente con axios para tener más control
      const axiosConfig = {
        timeout: 15000, // 15 segundos
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const response = await axios.post(webhookUrl, webhookData, axiosConfig);
      logger.info(`Respuesta de Make.com (status ${response.status}):`, response.data);
      
      // Verificar si la respuesta contiene un Hangout Link
      const hasHangoutLink = response.data && response.data.Hangout_Link;
      
      if (hasHangoutLink) {
        logger.info(`✅ Evento creado exitosamente en Google Calendar con Hangout Link: ${response.data.Hangout_Link}`);
      } else {
        logger.warn('⚠️ La respuesta de Make.com no contiene un Hangout Link');
        
        // Verificar si hay algún mensaje de error en la respuesta
        if (response.data && response.data.error) {
          logger.error(`❌ Error en Make.com: ${response.data.error}`);
        }
      }
      
      // Verificar si el escenario en Make.com está configurado correctamente
      logger.info('Verificando configuración del escenario en Make.com...');
      logger.info('1. Asegúrate de que el escenario "Automatizar invitaciones de ventas - Logifit" esté activado');
      logger.info('2. Verifica que el módulo de Google Calendar tenga los permisos correctos');
      logger.info('3. Comprueba que el calendario configurado sea el correcto');
      
      // Verificar si el correo está configurado correctamente
      logger.info('Verificando configuración del correo...');
      logger.info(`1. Asegúrate de que el correo ${TEST_EMAIL} esté escrito correctamente`);
      logger.info('2. Revisa la carpeta de spam o promociones en tu correo');
      logger.info('3. Verifica que el correo del vendedor tenga permisos para enviar invitaciones');
      
      if (response.status >= 200 && response.status < 300) {
        logger.info('✅ Datos enviados correctamente a Make.com');
        
        // Esperar un poco para que Make.com procese la solicitud
        logger.info('Esperando 5 segundos para que Make.com procese la solicitud...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        logger.info('Verifica tu correo para confirmar la recepción de la invitación');
      } else {
        logger.error(`❌ Respuesta inesperada de Make.com: ${response.status}`);
      }
    } catch (error) {
      logger.error('❌ Error al enviar datos a Make.com:', error.message);
      if (error.response) {
        logger.error('Detalles de la respuesta de error:', {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw new Error(`Error al enviar datos a Make.com: ${error.message}`);
    }
    
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
        logger.info('Si no recibes el correo en unos minutos, verifica:');
        logger.info('1. Que la URL del webhook en .env sea correcta');
        logger.info('2. Que el escenario en Make.com esté activado');
        logger.info('3. Revisa la carpeta de spam en tu correo');
        logger.info('4. Verifica los filtros en el escenario de Make.com (vemos que hay filtros que no pasan)');
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