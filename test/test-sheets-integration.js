/**
 * Test para validar la integración con Google Sheets a través de Make.com
 * 
 * Este script prueba:
 * 1. El registro de un nuevo prospecto en Google Sheets
 * 2. La actualización de datos de un prospecto existente
 */

require('dotenv').config();
const { saveProspectToSheets, updateProspectInSheets } = require('../src/services/sheetsService');
const logger = require('../src/utils/logger');

// Configuración de prueba
const TEST_PHONE = '51999999999'; // Número de prueba

// Configurar nivel de log para ver toda la información
logger.level = 'debug';

/**
 * Prueba el registro de un nuevo prospecto en Google Sheets
 */
async function testSaveProspect() {
  try {
    logger.info('Iniciando prueba de registro de nuevo prospecto en Google Sheets');
    
    // Verificar la URL del webhook
    const webhookUrl = process.env.MAKE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('No se ha configurado la URL del webhook para Google Sheets en el archivo .env');
    }
    logger.info(`URL del webhook configurada: ${webhookUrl}`);
    
    // Crear datos de prueba
    const prospectData = {
      phoneNumber: TEST_PHONE,
      name: 'Roberto Calvo',
      company: 'Logifit Test',
      emails: ['test@example.com'],
      qualificationAnswers: {
        role: 'Gerente de Operaciones',
        fleetSize: '30 camiones',
        currentSolution: 'Sí, tenemos problemas con la fatiga',
        decisionTimeline: 'Inmediata'
      },
      interestAnalysis: {
        highInterest: true,
        interestScore: 9,
        reasoning: 'Prospecto de alto valor con necesidad inmediata'
      },
      conversationState: 'qualification',
      lastInteraction: new Date(),
      firstInteraction: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 día atrás
      source: 'Test Script'
    };
    
    logger.info('Datos de prueba para el registro:', prospectData);
    
    // Guardar prospecto en Google Sheets
    const result = await saveProspectToSheets(prospectData);
    
    if (result.success) {
      logger.info('✅ Prospecto guardado correctamente en Google Sheets');
      logger.info('Respuesta:', result.data);
    } else {
      logger.error('❌ Error al guardar prospecto en Google Sheets:', result.error);
      logger.error('Detalles:', result.message);
    }
    
    return result;
  } catch (error) {
    logger.error('Error en la prueba de registro:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Prueba la actualización de un prospecto existente en Google Sheets
 */
async function testUpdateProspect() {
  try {
    logger.info('Iniciando prueba de actualización de prospecto en Google Sheets');
    
    // Verificar la URL del webhook
    const webhookUrl = process.env.MAKE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('No se ha configurado la URL del webhook para Google Sheets en el archivo .env');
    }
    logger.info(`URL del webhook configurada: ${webhookUrl}`);
    
    // Crear datos de prueba para actualización
    const updatedData = {
      name: 'Roberto Calvo',
      company: 'Logifit Test Actualizado',
      emails: ['test@example.com', 'test2@example.com'],
      qualificationAnswers: {
        role: 'Director de Operaciones',
        fleetSize: '50 camiones',
        currentSolution: 'Sí, tenemos problemas con la fatiga y buscamos solución',
        decisionTimeline: 'Inmediata'
      },
      interestAnalysis: {
        highInterest: true,
        interestScore: 10,
        reasoning: 'Prospecto de alto valor con necesidad inmediata y decisión tomada'
      },
      appointmentDetails: {
        date: '17/03/2025',
        time: '09:00',
        dateTime: new Date(2025, 2, 17, 9, 0, 0).toISOString()
      },
      appointmentCreated: true,
      conversationState: 'appointment_confirmed',
      lastInteraction: new Date(),
      source: 'Test Script - Update'
    };
    
    logger.info('Datos de prueba para la actualización:', updatedData);
    
    // Actualizar prospecto en Google Sheets
    const result = await updateProspectInSheets(TEST_PHONE, updatedData);
    
    if (result.success) {
      logger.info('✅ Prospecto actualizado correctamente en Google Sheets');
      logger.info('Respuesta:', result.data);
    } else {
      logger.error('❌ Error al actualizar prospecto en Google Sheets:', result.error);
      logger.error('Detalles:', result.message);
    }
    
    return result;
  } catch (error) {
    logger.error('Error en la prueba de actualización:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Ejecuta todas las pruebas
 */
async function runAllTests() {
  try {
    logger.info('=== INICIANDO PRUEBAS DE INTEGRACIÓN CON GOOGLE SHEETS ===');
    
    // Prueba 1: Guardar nuevo prospecto
    logger.info('\n=== PRUEBA 1: GUARDAR NUEVO PROSPECTO ===');
    const saveResult = await testSaveProspect();
    
    // Esperar 2 segundos entre pruebas
    logger.info('Esperando 2 segundos...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Prueba 2: Actualizar prospecto existente
    logger.info('\n=== PRUEBA 2: ACTUALIZAR PROSPECTO EXISTENTE ===');
    const updateResult = await testUpdateProspect();
    
    // Resumen de resultados
    logger.info('\n=== RESUMEN DE RESULTADOS ===');
    logger.info(`Guardar prospecto: ${saveResult.success ? '✅ ÉXITO' : '❌ ERROR'}`);
    logger.info(`Actualizar prospecto: ${updateResult.success ? '✅ ÉXITO' : '❌ ERROR'}`);
    
    logger.info('\n=== PRUEBAS COMPLETADAS ===');
    
    return {
      saveResult,
      updateResult,
      allSuccess: saveResult.success && updateResult.success
    };
  } catch (error) {
    logger.error('Error al ejecutar las pruebas:', error);
    return {
      error: error.message,
      allSuccess: false
    };
  }
}

// Ejecutar las pruebas si se llama directamente
if (require.main === module) {
  runAllTests()
    .then(results => {
      if (results.allSuccess) {
        logger.info('✅ Todas las pruebas completadas con éxito');
        process.exit(0);
      } else {
        logger.error('❌ Algunas pruebas fallaron');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Error inesperado:', error);
      process.exit(1);
    });
}

module.exports = { testSaveProspect, testUpdateProspect, runAllTests }; 