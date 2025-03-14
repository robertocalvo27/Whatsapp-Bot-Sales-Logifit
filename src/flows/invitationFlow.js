/**
 * Flujo de invitación para prospectos calificados
 * 
 * Este flujo maneja la invitación y seguimiento de prospectos que han sido
 * calificados y cumplen con criterios de alto valor (flota grande, decisores, etc.)
 */

const { generateOpenAIResponse } = require('../services/openaiService');
const logger = require('../utils/logger');
const { withHumanDelayAsync } = require('../utils/humanDelay');

class InvitationFlow {
  constructor() {
    this.vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Roberto Calvo';
  }

  /**
   * Determina si un prospecto califica como de alto valor
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Object} - Resultado de la evaluación
   */
  evaluateProspectValue(prospectState) {
    // Verificar si tenemos nombre y empresa
    const hasIdentity = prospectState.name && 
                       prospectState.name !== 'Desconocido' && 
                       prospectState.company && 
                       prospectState.company !== 'Desconocida';
    
    // Verificar si tiene una flota grande (más de 20 conductores)
    let hasLargeFleet = false;
    if (prospectState.fleetSizeCategory === 'grande') {
      hasLargeFleet = true;
    } else if (prospectState.fleetSize && !isNaN(parseInt(prospectState.fleetSize))) {
      hasLargeFleet = parseInt(prospectState.fleetSize) >= 20;
    }
    
    // Verificar si es tomador de decisiones
    const isDecisionMaker = prospectState.isDecisionMaker || false;
    
    // Verificar urgencia
    const hasUrgency = prospectState.urgency === 'alta' || 
                      (prospectState.decisionTimeline && 
                       (prospectState.decisionTimeline === 'inmediato' || 
                        prospectState.decisionTimeline === 'corto plazo'));
    
    // Calcular valor del prospecto
    let prospectValue = 'BAJO';
    let invitationPriority = 'BAJA';
    
    if (hasLargeFleet && hasIdentity) {
      prospectValue = 'ALTO';
      invitationPriority = 'ALTA';
    } else if ((hasLargeFleet || isDecisionMaker) && hasIdentity) {
      prospectValue = 'MEDIO';
      invitationPriority = 'MEDIA';
    } else if (hasUrgency && hasIdentity) {
      prospectValue = 'MEDIO';
      invitationPriority = 'MEDIA';
    }
    
    return {
      hasIdentity,
      hasLargeFleet,
      isDecisionMaker,
      hasUrgency,
      prospectValue,
      invitationPriority,
      shouldInvite: prospectValue !== 'BAJO'
    };
  }

  /**
   * Inicia el proceso de invitación para un prospecto calificado
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async startInvitation(message, prospectState) {
    try {
      logger.info(`Iniciando proceso de invitación para ${prospectState.name} de ${prospectState.company}`);
      
      // Evaluar el valor del prospecto
      const evaluation = this.evaluateProspectValue(prospectState);
      logger.info(`Evaluación del prospecto: ${JSON.stringify(evaluation)}`);
      
      // Si no califica para invitación, derivar a flujo de nutrición
      if (!evaluation.shouldInvite) {
        logger.info(`Prospecto no califica para invitación, derivando a flujo de nutrición`);
        return this.handleLowValueProspect(message, prospectState, evaluation);
      }
      
      // Determinar el paso actual del flujo de invitación
      const invitationStep = prospectState.invitationStep || 'initial';
      
      let result;
      switch (invitationStep) {
        case 'initial':
          result = await this.handleInitialInvitation(message, prospectState, evaluation);
          break;
        case 'price_request':
          result = await this.handlePriceRequest(message, prospectState, evaluation);
          break;
        case 'demo_scheduling':
          result = await this.handleDemoScheduling(message, prospectState, evaluation);
          break;
        case 'contact_info':
          result = await this.handleContactInfoCollection(message, prospectState, evaluation);
          break;
        case 'follow_up':
          result = await this.handleFollowUp(message, prospectState, evaluation);
          break;
        default:
          result = await this.handleInitialInvitation(message, prospectState, evaluation);
      }
      
      // Aplicar retraso humanizado antes de devolver la respuesta
      return withHumanDelayAsync(Promise.resolve(result), result.response);
    } catch (error) {
      logger.error(`Error en startInvitation: ${error.message}`);
      
      // Respuesta por defecto en caso de error
      const errorResponse = {
        response: `Disculpa, tuve un problema procesando tu solicitud. ¿Podrías intentar nuevamente o reformular tu pregunta?`,
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
   * Maneja la invitación inicial para prospectos de alto valor
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {Object} evaluation - Evaluación del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleInitialInvitation(message, prospectState, evaluation) {
    // Verificar si el mensaje contiene solicitud de precio o cotización
    const askingForPrice = message.toLowerCase().includes('precio') || 
                          message.toLowerCase().includes('costo') || 
                          message.toLowerCase().includes('cotización') || 
                          message.toLowerCase().includes('cotizacion') ||
                          message.toLowerCase().includes('cuánto') ||
                          message.toLowerCase().includes('cuanto') ||
                          message.toLowerCase().includes('tarifa');
    
    if (askingForPrice) {
      return this.handlePriceRequest(message, prospectState, evaluation);
    }
    
    // Preparar mensaje de invitación según el valor del prospecto
    let response;
    if (evaluation.prospectValue === 'ALTO') {
      response = `${prospectState.name}, basado en la información que me has compartido sobre ${prospectState.company}, creo que nuestra solución LogiFit podría ser muy adecuada para sus necesidades. 

Me gustaría invitarte a una demostración personalizada donde podrás ver cómo nuestro sistema puede ayudar a mejorar la seguridad de tus conductores y la eficiencia de tu flota.

¿Te interesaría agendar esta demostración? Podemos adaptarnos a tu disponibilidad.`;
    } else {
      response = `${prospectState.name}, gracias por tu interés en nuestra solución LogiFit. 

Basado en lo que me comentas, creo que podríamos ofrecerte una demostración de nuestro sistema para que puedas evaluar si se adapta a las necesidades de ${prospectState.company}.

¿Te gustaría agendar una breve llamada para mostrarte cómo funciona nuestro sistema?`;
    }
    
    return {
      response,
      newState: {
        ...prospectState,
        conversationState: 'invitation',
        invitationStep: 'demo_scheduling',
        invitationPriority: evaluation.invitationPriority,
        prospectValue: evaluation.prospectValue,
        lastInteraction: new Date()
      }
    };
  }

  /**
   * Maneja solicitudes de precio o cotización
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {Object} evaluation - Evaluación del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handlePriceRequest(message, prospectState, evaluation) {
    const response = `Entiendo que estás interesado en conocer los precios de nuestra solución LogiFit. 

Nuestros planes se adaptan al tamaño de la flota y las necesidades específicas de cada empresa. Para poder ofrecerte una cotización precisa, necesitaríamos conocer más detalles sobre tus requerimientos.

Lo mejor sería agendar una breve llamada donde podamos discutir tus necesidades específicas y presentarte una propuesta personalizada. ¿Te parece bien si coordinamos una llamada?`;
    
    return {
      response,
      newState: {
        ...prospectState,
        conversationState: 'invitation',
        invitationStep: 'demo_scheduling',
        invitationPriority: evaluation.invitationPriority,
        prospectValue: evaluation.prospectValue,
        priceRequested: true,
        lastInteraction: new Date()
      }
    };
  }

  /**
   * Maneja la programación de demostraciones
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {Object} evaluation - Evaluación del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleDemoScheduling(message, prospectState, evaluation) {
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
    
    // Verificar si el mensaje contiene información de contacto
    const hasContactInfo = message.toLowerCase().includes('correo') || 
                          message.toLowerCase().includes('email') || 
                          message.toLowerCase().includes('teléfono') || 
                          message.toLowerCase().includes('telefono') ||
                          message.toLowerCase().includes('celular') ||
                          message.toLowerCase().includes('@');
    
    if (positiveResponse) {
      // Si la respuesta es positiva, solicitar información de contacto
      const response = `¡Excelente! Para coordinar la demostración, ¿podrías proporcionarme tu correo electrónico y un número de teléfono donde podamos contactarte?

Nuestro equipo se pondrá en contacto contigo para agendar la demostración en el horario que mejor te convenga.`;
      
      return {
        response,
        newState: {
          ...prospectState,
          conversationState: 'invitation',
          invitationStep: 'contact_info',
          demoAccepted: true,
          lastInteraction: new Date()
        }
      };
    } else if (negativeResponse) {
      // Si la respuesta es negativa, ofrecer alternativas
      const response = `Entiendo que quizás no sea el momento adecuado para una demostración. 

¿Te gustaría que te enviara información detallada sobre nuestra solución y casos de éxito para que puedas revisarla cuando tengas tiempo? También podríamos programar la demostración para más adelante, cuando te sea más conveniente.`;
      
      return {
        response,
        newState: {
          ...prospectState,
          conversationState: 'invitation',
          invitationStep: 'follow_up',
          demoRejected: true,
          lastInteraction: new Date()
        }
      };
    } else if (hasContactInfo) {
      // Si el mensaje ya contiene información de contacto, procesarla
      return this.handleContactInfoCollection(message, prospectState, evaluation);
    } else {
      // Si la respuesta no es clara, insistir amablemente
      const response = `Para poder mostrarte cómo nuestra solución LogiFit puede beneficiar a ${prospectState.company}, me gustaría coordinar una breve demostración personalizada. 

¿Te interesaría agendar esta demostración en los próximos días? Solo tomaría unos 20-30 minutos de tu tiempo.`;
      
      return {
        response,
        newState: {
          ...prospectState,
          conversationState: 'invitation',
          invitationStep: 'demo_scheduling',
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Maneja la recolección de información de contacto
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {Object} evaluation - Evaluación del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleContactInfoCollection(message, prospectState, evaluation) {
    // Extraer correo electrónico del mensaje
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const emailMatch = message.match(emailRegex);
    const email = emailMatch ? emailMatch[0] : null;
    
    // Extraer número de teléfono del mensaje
    const phoneRegex = /\b(?:\+?[0-9]{1,3}[-. ]?)?(?:\([0-9]{1,3}\)[-. ]?)?[0-9]{1,4}[-. ]?[0-9]{1,4}[-. ]?[0-9]{1,9}\b/;
    const phoneMatch = message.match(phoneRegex);
    const phone = phoneMatch ? phoneMatch[0] : null;
    
    // Actualizar el estado con la información de contacto
    const newState = {
      ...prospectState,
      conversationState: 'invitation',
      invitationStep: 'follow_up',
      contactInfoProvided: true,
      lastInteraction: new Date()
    };
    
    if (email) {
      newState.email = email;
    }
    
    if (phone) {
      newState.phone = phone;
    }
    
    // Verificar si tenemos toda la información necesaria
    const hasAllInfo = newState.email && newState.phone;
    
    let response;
    if (hasAllInfo) {
      response = `¡Perfecto! He registrado tu correo electrónico (${newState.email}) y tu número de teléfono (${newState.phone}).

Nuestro equipo se pondrá en contacto contigo muy pronto para coordinar la demostración. Mientras tanto, ¿hay algún aspecto específico de nuestra solución que te gustaría que abordáramos durante la demostración?`;
    } else if (newState.email && !newState.phone) {
      response = `Gracias por proporcionarme tu correo electrónico (${newState.email}). Para completar la coordinación, ¿podrías también compartirme un número de teléfono donde podamos contactarte?`;
      newState.invitationStep = 'contact_info';
    } else if (!newState.email && newState.phone) {
      response = `Gracias por proporcionarme tu número de teléfono (${newState.phone}). Para completar la coordinación, ¿podrías también compartirme tu correo electrónico?`;
      newState.invitationStep = 'contact_info';
    } else {
      response = `Para poder coordinar la demostración, necesitaría tu correo electrónico y un número de teléfono donde podamos contactarte. ¿Podrías proporcionarme esta información, por favor?`;
      newState.invitationStep = 'contact_info';
    }
    
    return {
      response,
      newState
    };
  }

  /**
   * Maneja el seguimiento después de la invitación
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {Object} evaluation - Evaluación del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleFollowUp(message, prospectState, evaluation) {
    // Verificar si el mensaje contiene una solicitud específica
    const askingForInfo = message.toLowerCase().includes('información') || 
                         message.toLowerCase().includes('informacion') || 
                         message.toLowerCase().includes('detalles') || 
                         message.toLowerCase().includes('más') ||
                         message.toLowerCase().includes('mas');
    
    const askingForDemo = message.toLowerCase().includes('demo') || 
                         message.toLowerCase().includes('demostración') || 
                         message.toLowerCase().includes('demostracion') || 
                         message.toLowerCase().includes('llamada') ||
                         message.toLowerCase().includes('reunión') ||
                         message.toLowerCase().includes('reunion');
    
    let response;
    const newState = {
      ...prospectState,
      conversationState: 'invitation',
      invitationStep: 'follow_up',
      lastInteraction: new Date()
    };
    
    if (askingForDemo) {
      response = `¡Claro! Estaré encantado de coordinar una demostración para ti. 

Para agendar la demostración, necesitaría tu correo electrónico y un número de teléfono donde podamos contactarte. ¿Podrías proporcionarme esta información, por favor?`;
      
      newState.invitationStep = 'contact_info';
      newState.demoRequested = true;
    } else if (askingForInfo) {
      response = `Con gusto te enviaré más información sobre nuestra solución LogiFit. 

Te enviaré un documento con detalles técnicos, beneficios y casos de éxito que podrás revisar cuando tengas tiempo. ¿A qué correo electrónico prefieres que te envíe esta información?`;
      
      newState.invitationStep = 'contact_info';
      newState.infoRequested = true;
    } else {
      // Respuesta genérica de seguimiento
      response = `Gracias por tu interés en LogiFit. Estamos aquí para ayudarte con cualquier duda o consulta que tengas sobre nuestra solución.

¿Hay algo específico sobre lo que te gustaría saber más? Puedo proporcionarte información adicional o coordinar una demostración cuando lo consideres conveniente.`;
    }
    
    return {
      response,
      newState
    };
  }

  /**
   * Maneja prospectos de bajo valor
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @param {Object} evaluation - Evaluación del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleLowValueProspect(message, prospectState, evaluation) {
    // Para prospectos de bajo valor, ofrecer información pero no insistir en una demostración
    const response = `Gracias por tu interés en nuestra solución LogiFit. 

Tenemos material informativo que podría ser útil para entender cómo nuestro sistema puede ayudar a mejorar la seguridad de los conductores y la eficiencia de la flota.

¿Te gustaría recibir esta información por correo electrónico?`;
    
    return {
      response,
      newState: {
        ...prospectState,
        conversationState: 'nurturing',
        nurturingStep: 'info_offer',
        prospectValue: evaluation.prospectValue,
        lastInteraction: new Date()
      }
    };
  }
}

module.exports = new InvitationFlow(); 