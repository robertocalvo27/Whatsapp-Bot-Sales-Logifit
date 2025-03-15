/**
 * Flujo de cierre de conversación
 * Este módulo maneja el cierre de conversaciones con prospectos
 */

const { generateOpenAIResponse } = require('../services/openaiService');
const { updateProspectState } = require('../models/prospectModel');
const { CONVERSATION_STATES } = require('../utils/constants');
const { saveProspectToSheets } = require('../services/sheetsService');
const logger = require('../utils/logger');

/**
 * Maneja el cierre de la conversación
 * @param {Object} prospectState - Estado actual del prospecto
 * @param {string} text - Texto del mensaje del usuario
 * @returns {Object} - Respuesta y acciones a realizar
 */
async function handleClosingFlow(prospectState, text) {
  try {
    // Analizar si el usuario tiene alguna consulta adicional
    const analysis = await generateOpenAIResponse({
      role: 'system',
      content: `Analiza la siguiente respuesta de un cliente después de programar una cita.
      Determina si tiene alguna consulta adicional o si está listo para finalizar la conversación.
      Respuesta del cliente: "${text}"
      Responde únicamente con "CONSULTA" si tiene alguna pregunta adicional o "FINALIZAR" si parece estar satisfecho y listo para terminar.`
    });
    
    // Guardar datos en Google Sheets antes de finalizar la conversación
    if (analysis.includes('FINALIZAR')) {
      try {
        // Preparar datos para guardar en Google Sheets
        const sheetResult = await saveProspectToSheets({
          name: prospectState.name,
          phoneNumber: prospectState.phoneNumber,
          company: prospectState.company,
          source: prospectState.source || 'WhatsApp',
          campaignName: prospectState.campaignName || 'Orgánico',
          qualificationAnswers: prospectState.qualificationAnswers || {},
          interestAnalysis: prospectState.interestAnalysis || {},
          appointmentCreated: !!prospectState.appointmentDetails,
          appointmentDetails: prospectState.appointmentDetails || {},
          conversationState: CONVERSATION_STATES.CLOSED
        });
        
        if (sheetResult.success) {
          logger.info(`Datos del prospecto ${prospectState.phoneNumber} guardados correctamente en Google Sheets`);
        } else {
          logger.error(`Error al guardar datos en Google Sheets: ${sheetResult.error}`);
        }
      } catch (error) {
        logger.error('Error al guardar datos en Google Sheets:', error);
      }
      
      // Actualizar estado a CLOSED
      await updateProspectState(prospectState.phoneNumber, {
        conversationState: CONVERSATION_STATES.CLOSED,
        lastInteraction: new Date()
      });
      
      // Mensaje de despedida personalizado según si tiene cita o no
      if (prospectState.appointmentDetails) {
        return {
          message: `¡Perfecto, ${prospectState.name}! Ha sido un placer atenderte.

Te esperamos en nuestra cita programada para el ${prospectState.appointmentDetails.date} a las ${prospectState.appointmentDetails.time}.

Si necesitas algo más antes de esa fecha, no dudes en escribirnos.

¡Que tengas un excelente día! 👋`,
          nextState: CONVERSATION_STATES.CLOSED
        };
      } else {
        return {
          message: `¡Gracias por contactarnos, ${prospectState.name}! Ha sido un placer atenderte.

Si en el futuro necesitas información sobre nuestras soluciones de monitoreo de fatiga y somnolencia, no dudes en escribirnos nuevamente.

¡Que tengas un excelente día! 👋`,
          nextState: CONVERSATION_STATES.CLOSED
        };
      }
    } else {
      // Cambiar a modo de consulta general
      await updateProspectState(prospectState.phoneNumber, {
        conversationState: CONVERSATION_STATES.GENERAL_INQUIRY,
        lastInteraction: new Date()
      });
      
      return {
        message: `Claro, ${prospectState.name}. Estoy aquí para responder cualquier pregunta adicional que tengas.

¿En qué más puedo ayudarte?`,
        nextState: CONVERSATION_STATES.GENERAL_INQUIRY
      };
    }
  } catch (error) {
    logger.error('Error en el flujo de cierre:', error);
    return {
      message: `Lo siento, ${prospectState.name}, estamos experimentando algunos problemas técnicos. ¿Hay algo más en lo que pueda ayudarte?`,
      nextState: prospectState.conversationState
    };
  }
}

/**
 * Maneja el cierre forzado de una conversación (por comando de operador)
 * @param {Object} prospectState - Estado actual del prospecto
 * @returns {Object} - Respuesta y acciones a realizar
 */
async function handleForcedClosing(prospectState) {
  try {
    // Guardar datos en Google Sheets
    try {
      const sheetResult = await saveProspectToSheets({
        name: prospectState.name,
        phoneNumber: prospectState.phoneNumber,
        company: prospectState.company,
        source: prospectState.source || 'WhatsApp',
        campaignName: prospectState.campaignName || 'Orgánico',
        qualificationAnswers: prospectState.qualificationAnswers || {},
        interestAnalysis: prospectState.interestAnalysis || {},
        appointmentCreated: !!prospectState.appointmentDetails,
        appointmentDetails: prospectState.appointmentDetails || {},
        conversationState: CONVERSATION_STATES.CLOSED
      });
      
      if (sheetResult.success) {
        logger.info(`Datos del prospecto ${prospectState.phoneNumber} guardados correctamente en Google Sheets (cierre forzado)`);
      } else {
        logger.error(`Error al guardar datos en Google Sheets (cierre forzado): ${sheetResult.error}`);
      }
    } catch (error) {
      logger.error('Error al guardar datos en Google Sheets (cierre forzado):', error);
    }
    
    // Actualizar estado a CLOSED
    await updateProspectState(prospectState.phoneNumber, {
      conversationState: CONVERSATION_STATES.CLOSED,
      lastInteraction: new Date(),
      closedByOperator: true
    });
    
    return {
      message: `Gracias por tu interés, ${prospectState.name || 'estimado cliente'}. Un asesor humano continuará la conversación contigo en breve.`,
      nextState: CONVERSATION_STATES.CLOSED
    };
  } catch (error) {
    logger.error('Error en el cierre forzado:', error);
    return {
      message: `Lo siento, estamos experimentando algunos problemas técnicos. Un asesor humano te atenderá en breve.`,
      nextState: prospectState.conversationState
    };
  }
}

module.exports = {
  handleClosingFlow,
  handleForcedClosing
}; 