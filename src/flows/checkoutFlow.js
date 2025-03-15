/**
 * Flujo de checkout para prospectos no interesados o no interesantes
 * 
 * Este flujo maneja la salida elegante de prospectos que no muestran interés
 * o que no cumplen con los criterios de calificación para ser considerados
 * prospectos de alto valor.
 */

const { generateOpenAIResponse } = require('../services/openaiService');
const logger = require('../utils/logger');
const { withHumanDelayAsync } = require('../utils/humanDelay');

class CheckoutFlow {
  constructor() {
    this.vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Roberto Calvo';
  }

  /**
   * Inicia el proceso de checkout para un prospecto
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async startCheckout(message, prospectState) {
    try {
      logger.info(`Iniciando proceso de checkout para ${prospectState.name || 'Desconocido'}`);
      
      // Determinar el motivo del checkout
      const checkoutReason = this.determineCheckoutReason(prospectState);
      logger.info(`Motivo de checkout: ${checkoutReason}`);
      
      // Determinar el paso actual del flujo de checkout
      const checkoutStep = prospectState.checkoutStep || 'initial';
      
      let result;
      switch (checkoutStep) {
        case 'initial':
          result = await this.handleInitialCheckout(message, prospectState, checkoutReason);
          break;
        case 'second_qualification':
          result = await this.handleSecondQualification(message, prospectState, checkoutReason);
          break;
        case 'info_offer':
          result = await this.handleInfoOffer(message, prospectState, checkoutReason);
          break;
        case 'feedback':
          result = await this.handleFeedback(message, prospectState, checkoutReason);
          break;
        case 'final':
          result = await this.handleFinalCheckout(message, prospectState, checkoutReason);
          break;
        default:
          result = await this.handleInitialCheckout(message, prospectState, checkoutReason);
      }
      
      // Aplicar retraso humanizado antes de devolver la respuesta
      return withHumanDelayAsync(Promise.resolve(result), result.response);
    } catch (error) {
      logger.error(`Error en startCheckout: ${error.message}`);
      
      // Respuesta por defecto en caso de error
      const errorResponse = {
        response: `Disculpa, tuve un problema procesando tu solicitud. ¿Hay algo más en lo que pueda ayudarte?`,
        newState: {
          ...prospectState,
          lastInteraction: new Date(),
          lastError: error.message
        }
      };
      
      // Aplicar retraso humanizado incluso para mensajes de error
      return withHumanDelayAsync(Promise.resolve(errorResponse), errorResponse.response);
    }
  }

  /**
   * Determina el motivo del checkout
   * @param {Object} prospectState - Estado del prospecto
   * @returns {string} - Motivo del checkout
   */
  determineCheckoutReason(prospectState) {
    // Verificar si el prospecto ha expresado desinterés
    if (prospectState.expressedDisinterest) {
      return 'DISINTEREST';
    }
    
    // Verificar si el prospecto no ha proporcionado información suficiente
    if (!prospectState.name || prospectState.name === 'Desconocido' || 
        !prospectState.company || prospectState.company === 'Desconocida') {
      return 'INSUFFICIENT_INFO';
    }
    
    // Verificar si el prospecto tiene una flota pequeña
    if (prospectState.fleetSizeCategory === 'pequeña' || 
        (prospectState.fleetSize && !isNaN(parseInt(prospectState.fleetSize)) && parseInt(prospectState.fleetSize) < 20)) {
      return 'SMALL_FLEET';
    }
    
    // Verificar si el prospecto no es tomador de decisiones
    if (prospectState.role && !prospectState.isDecisionMaker) {
      return 'NOT_DECISION_MAKER';
    }
    
    // Verificar si el prospecto no tiene urgencia
    if (prospectState.urgency === 'baja' || 
        (prospectState.decisionTimeline && prospectState.decisionTimeline === 'largo plazo')) {
      return 'LOW_URGENCY';
    }
    
    // Si no hay un motivo claro, considerar como bajo potencial general
    return 'LOW_POTENTIAL';
  }

  /**
   * Maneja el inicio del proceso de checkout
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} checkoutReason - Motivo del checkout
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleInitialCheckout(message, prospectState, checkoutReason) {
    // Verificar si el mensaje contiene una expresión de desinterés clara
    const clearDisinterest = message.toLowerCase().includes('no me interesa') || 
                            message.toLowerCase().includes('no estoy interesado') || 
                            message.toLowerCase().includes('no quiero') || 
                            message.toLowerCase().includes('no necesito') ||
                            message.toLowerCase().includes('no gracias');
    
    if (clearDisinterest) {
      return this.handleFinalCheckout(message, prospectState, 'DISINTEREST');
    }
    
    // Intentar una segunda calificación para confirmar el motivo del checkout
    let response;
    switch (checkoutReason) {
      case 'INSUFFICIENT_INFO':
        response = `Para poder ofrecerte la mejor solución, me ayudaría conocer un poco más sobre tu empresa y tus necesidades. ¿Podrías compartirme más detalles sobre el tamaño de tu flota y tus principales desafíos en cuanto a la seguridad de los conductores?`;
        break;
      case 'SMALL_FLEET':
        response = `Entiendo que actualmente manejas una flota más pequeña. ¿Tienes planes de crecimiento en el corto o mediano plazo? Nuestras soluciones pueden adaptarse a diferentes tamaños de flota y escalarse conforme crecen las necesidades.`;
        break;
      case 'NOT_DECISION_MAKER':
        response = `Gracias por tu interés en nuestra solución. ¿Hay alguien más en tu organización que esté involucrado en la toma de decisiones sobre este tipo de tecnologías? Podría ser útil incluirlos en la conversación para que conozcan los beneficios de LogiFit.`;
        break;
      case 'LOW_URGENCY':
        response = `Entiendo que por ahora no es una prioridad inmediata. ¿Te gustaría recibir información sobre nuestra solución para considerarla en el futuro cuando sea más oportuno para ustedes?`;
        break;
      default:
        response = `Gracias por tu interés en LogiFit. Para entender mejor cómo podríamos ayudarte, ¿podrías contarme cuáles son los principales desafíos que enfrentas actualmente con la seguridad de tus conductores?`;
    }
    
    return {
      response,
      newState: {
        ...prospectState,
        conversationState: 'checkout',
        checkoutStep: 'second_qualification',
        checkoutReason,
        lastInteraction: new Date()
      }
    };
  }

  /**
   * Maneja la segunda calificación durante el proceso de checkout
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} checkoutReason - Motivo del checkout
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleSecondQualification(message, prospectState, checkoutReason) {
    // Analizar la respuesta para detectar posibles cambios en la calificación
    const positiveSignals = message.toLowerCase().includes('crecimiento') || 
                           message.toLowerCase().includes('expandir') || 
                           message.toLowerCase().includes('aumentar') || 
                           message.toLowerCase().includes('más vehículos') ||
                           message.toLowerCase().includes('mas vehiculos') ||
                           message.toLowerCase().includes('pronto') ||
                           message.toLowerCase().includes('interesado') ||
                           message.toLowerCase().includes('decisión') ||
                           message.toLowerCase().includes('decision');
    
    const negativeSignals = message.toLowerCase().includes('no') || 
                           message.toLowerCase().includes('ahora no') || 
                           message.toLowerCase().includes('después') || 
                           message.toLowerCase().includes('despues') ||
                           message.toLowerCase().includes('luego') ||
                           message.toLowerCase().includes('otro momento');
    
    // Si hay señales positivas, ofrecer información
    if (positiveSignals && !negativeSignals) {
      return this.handleInfoOffer(message, prospectState, checkoutReason);
    }
    
    // Si hay señales negativas claras, pasar a la fase final
    if (negativeSignals && !positiveSignals) {
      return this.handleFeedback(message, prospectState, checkoutReason);
    }
    
    // Si la respuesta no es clara, ofrecer información de todas formas
    const response = `Entiendo. Tenemos material informativo sobre nuestra solución LogiFit que podría ser útil para ti. ¿Te gustaría recibir esta información por correo electrónico para revisarla cuando tengas tiempo?`;
    
    return {
      response,
      newState: {
        ...prospectState,
        conversationState: 'checkout',
        checkoutStep: 'info_offer',
        lastInteraction: new Date()
      }
    };
  }

  /**
   * Maneja el ofrecimiento de información durante el proceso de checkout
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} checkoutReason - Motivo del checkout
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleInfoOffer(message, prospectState, checkoutReason) {
    // Verificar si el mensaje contiene una respuesta positiva
    const positiveResponse = message.toLowerCase().includes('sí') || 
                            message.toLowerCase().includes('si') || 
                            message.toLowerCase().includes('claro') || 
                            message.toLowerCase().includes('ok') ||
                            message.toLowerCase().includes('buena idea') ||
                            message.toLowerCase().includes('me interesa') ||
                            message.toLowerCase().includes('adelante');
    
    // Verificar si el mensaje contiene una respuesta negativa
    const negativeResponse = message.toLowerCase().includes('no') || 
                            message.toLowerCase().includes('ahora no') || 
                            message.toLowerCase().includes('después') || 
                            message.toLowerCase().includes('despues') ||
                            message.toLowerCase().includes('luego') ||
                            message.toLowerCase().includes('otro momento');
    
    // Verificar si el mensaje contiene un correo electrónico
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const emailMatch = message.match(emailRegex);
    const email = emailMatch ? emailMatch[0] : null;
    
    let response;
    const newState = {
      ...prospectState,
      conversationState: 'checkout',
      lastInteraction: new Date()
    };
    
    if (email) {
      // Si proporcionó un correo electrónico, confirmar y pasar a feedback
      response = `¡Perfecto! Enviaré la información sobre LogiFit a ${email}. La recibirás en breve.

¿Hay algo específico sobre nuestra solución que te gustaría conocer más a fondo?`;
      
      newState.email = email;
      newState.infoRequested = true;
      newState.checkoutStep = 'feedback';
    } else if (positiveResponse) {
      // Si la respuesta es positiva pero no proporcionó correo, solicitarlo
      response = `Excelente. ¿A qué correo electrónico te gustaría que enviara la información sobre LogiFit?`;
      
      newState.checkoutStep = 'info_offer';
    } else if (negativeResponse) {
      // Si la respuesta es negativa, pasar a feedback
      response = `Entiendo. Si en algún momento necesitas información sobre soluciones de monitoreo de fatiga, no dudes en contactarnos.

¿Hay algún comentario o sugerencia que te gustaría compartir sobre nuestra conversación?`;
      
      newState.checkoutStep = 'feedback';
    } else {
      // Si la respuesta no es clara, insistir amablemente
      response = `Para enviarte información detallada sobre LogiFit, necesitaría tu correo electrónico. ¿Te gustaría recibir esta información?`;
      
      newState.checkoutStep = 'info_offer';
    }
    
    return {
      response,
      newState
    };
  }

  /**
   * Maneja la solicitud de feedback durante el proceso de checkout
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} checkoutReason - Motivo del checkout
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleFeedback(message, prospectState, checkoutReason) {
    // Guardar el feedback si lo proporciona
    if (message.length > 5) {
      prospectState.feedback = message;
    }
    
    // Mensaje de despedida y agradecimiento
    const response = `Gracias por tu tiempo y por compartir tus comentarios. Ha sido un placer atenderte.

Si en el futuro necesitas información sobre soluciones de monitoreo de fatiga para conductores, no dudes en contactarnos nuevamente. ¡Que tengas un excelente día!`;
    
    return {
      response,
      newState: {
        ...prospectState,
        conversationState: 'checkout',
        checkoutStep: 'final',
        checkoutComplete: true,
        lastInteraction: new Date()
      }
    };
  }

  /**
   * Maneja la fase final del proceso de checkout
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} checkoutReason - Motivo del checkout
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleFinalCheckout(message, prospectState, checkoutReason) {
    // Mensaje de despedida final
    const response = `Entiendo. Gracias por tu tiempo y consideración. 

Si en algún momento tus necesidades cambian o tienes preguntas sobre soluciones de monitoreo de fatiga para conductores, estaremos aquí para ayudarte. ¡Que tengas un excelente día!`;
    
    return {
      response,
      newState: {
        ...prospectState,
        conversationState: 'closed',
        checkoutStep: 'final',
        checkoutComplete: true,
        checkoutReason,
        lastInteraction: new Date()
      }
    };
  }
}

module.exports = new CheckoutFlow(); 