const { generateOpenAIResponse, analyzeResponseRelevance } = require('../services/openaiService');
const { checkCalendarAvailability, createCalendarEvent, getNearestAvailableSlot } = require('../services/calendarService');
const { searchCompanyInfo, searchCompanyByName } = require('../services/companyService');
const { sendAppointmentToMake, formatAppointmentData } = require('../services/webhookService');
const { humanizeResponse } = require('../utils/humanizer');
const greetingFlow = require('./greetingFlow');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const qualificationFlow = require('./qualificationFlow');
const invitationFlow = require('./invitationFlow');
const checkoutFlow = require('./checkoutFlow');
const { withHumanDelayAsync } = require('../utils/humanDelay');

/**
 * Clase principal que maneja el flujo de la campaña
 * Orquesta los diferentes flujos de conversación según el estado
 */
class CampaignFlow {
  constructor() {
    this.vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Roberto Calvo';
    this.states = {
      GREETING: 'greeting',
      INITIAL_QUALIFICATION: 'initial_qualification',
      DEEP_QUALIFICATION: 'deep_qualification',
      INVITATION: 'invitation',
      CHECKOUT: 'checkout',
      MEETING_OFFER: 'meeting_offer',
      MEETING_SCHEDULING: 'meeting_scheduling',
      EMAIL_COLLECTION: 'email_collection',
      FOLLOW_UP: 'follow_up',
      COMPLETED: 'completed'
    };
    
    // Preguntas específicas por tipo de prospecto
    this.qualificationQuestions = {
      CURIOSO: [
        '¿Actualmente conduces algún tipo de vehículo pesado?',
        '¿En qué empresa trabajas actualmente?',
        '¿Conoces al encargado de seguridad o flota en tu empresa?'
      ],
      INFLUENCER: [
        '¿Qué rol desempeñas en la gestión de la flota o seguridad?',
        '¿Cuántas unidades o conductores tienen en su flota actualmente?',
        '¿Qué problemas específicos han identificado con la fatiga de conductores?',
        '¿Quién sería el encargado de evaluar esta solución en tu empresa?'
      ],
      ENCARGADO: [
        '¿Qué estrategias están utilizando actualmente para gestionar la fatiga?',
        '¿Cuál es el tamaño de su flota y en qué sectores operan?',
        '¿Han tenido incidentes relacionados con fatiga en los últimos meses?',
        '¿Tienen un presupuesto asignado para soluciones de seguridad este año?'
      ]
    };

    // Historial de mensajes para mantener contexto
    this.messageHistory = new Map();

    // Patrones para identificar mensajes de campaña
    this.campaignPatterns = {
      FACEBOOK: [
        /necesito más información/i,
        /información sobre esta oferta/i,
        /me interesa saber más/i,
        /quiero saber más/i,
        /información sobre el precio/i,
        /el precio/i
      ],
      GENERAL: [
        /oferta flash/i,
        /descuento/i,
        /promoción/i,
        /smart bands?/i,
        /fatiga/i,
        /somnolencia/i
      ]
    };

    // Patrones para clasificar tipos de prospecto
    this.prospectTypePatterns = {
      INDEPENDIENTE: [
        /personal/i,
        /independiente/i,
        /particular/i,
        /individual/i,
        /por mi cuenta/i,
        /conductor/i
      ]
    };
  }

  addToHistory = (phoneNumber, message) => {
    if (!this.messageHistory.has(phoneNumber)) {
      this.messageHistory.set(phoneNumber, []);
    }
    this.messageHistory.get(phoneNumber).push({
      ...message,
      timestamp: new Date()
    });
  };

  getHistory = (phoneNumber) => {
    return this.messageHistory.get(phoneNumber) || [];
  };

  /**
   * Procesa un mensaje entrante y determina qué flujo debe manejarlo
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async processMessage(message, prospectState) {
    try {
      logger.info(`Procesando mensaje: "${message}" en estado: ${prospectState.conversationState || 'nuevo'}`);
      
      let result;
      
      // Si no hay estado o es un nuevo prospecto, iniciar con el saludo
      if (!prospectState.conversationState || prospectState.conversationState === 'new') {
        logger.info('Iniciando flujo de saludo para nuevo prospecto');
        result = await greetingFlow.handleInitialGreeting(message, prospectState);
      } else {
        // Dirigir el mensaje al flujo correspondiente según el estado de la conversación
        switch (prospectState.conversationState) {
          case 'greeting':
            logger.info('Continuando flujo de saludo');
            result = await greetingFlow.handleInitialGreeting(message, prospectState);
            break;
            
          case 'initial_qualification':
            logger.info('Continuando flujo de calificación inicial');
            result = await qualificationFlow.startQualification(message, prospectState);
            break;
            
          case 'qualified':
            logger.info('Prospecto ya calificado, evaluando siguiente paso');
            // Evaluar si el prospecto califica para invitación o checkout
            result = await this.routeQualifiedProspect(message, prospectState);
            break;
            
          case 'invitation':
            logger.info('Procesando flujo de invitación');
            result = await invitationFlow.startInvitation(message, prospectState);
            break;
            
          case 'checkout':
            logger.info('Procesando flujo de checkout');
            result = await checkoutFlow.startCheckout(message, prospectState);
            break;
            
          case 'appointment_scheduling':
            logger.info('Procesando programación de cita');
            result = await this.handleAppointmentScheduling(message, prospectState);
            break;
            
          case 'nurturing':
            logger.info('Procesando nutrición de prospecto');
            result = await this.handleNurturing(message, prospectState);
            break;
            
          case 'closed':
            logger.info('Conversación cerrada, reiniciando');
            result = await this.handleClosedConversation(message, prospectState);
            break;
            
          default:
            logger.warn(`Estado de conversación desconocido: ${prospectState.conversationState}`);
            // Si el estado es desconocido, reiniciar con el saludo
            result = await greetingFlow.handleInitialGreeting(message, {
              ...prospectState,
              conversationState: null
            });
        }
      }
      
      // Aplicar retraso humanizado antes de devolver la respuesta
      return withHumanDelayAsync(Promise.resolve(result), result.response);
    } catch (error) {
      logger.error('Error en processMessage:', error.message);
      
      // En caso de error, proporcionar una respuesta genérica y mantener el estado
      const errorResponse = {
        response: `Disculpa, tuve un problema procesando tu mensaje. ¿Podrías reformularlo o intentar de nuevo más tarde? Si necesitas asistencia inmediata, puedes contactar directamente a ${this.vendedorNombre}.`,
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
   * Evalúa y dirige a un prospecto calificado al flujo correspondiente
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async routeQualifiedProspect(message, prospectState) {
    try {
      logger.info(`Evaluando prospecto calificado: ${prospectState.name || 'Desconocido'} de ${prospectState.company || 'Empresa desconocida'}`);
      
      // Verificar si el prospecto es de alto valor según los criterios
      const isHighValueProspect = invitationFlow.evaluateProspectValue(prospectState);
      logger.info(`¿Es prospecto de alto valor?: ${isHighValueProspect}`);
      
      if (isHighValueProspect) {
        // Si es de alto valor, dirigir al flujo de invitación
        logger.info(`Dirigiendo a ${prospectState.name || 'Desconocido'} al flujo de invitación`);
        return await invitationFlow.startInvitation(message, {
          ...prospectState,
          conversationState: 'invitation'
        });
      } else {
        // Si no es de alto valor, dirigir al flujo de checkout
        logger.info(`Dirigiendo a ${prospectState.name || 'Desconocido'} al flujo de checkout`);
        return await checkoutFlow.startCheckout(message, {
          ...prospectState,
          conversationState: 'checkout'
        });
      }
    } catch (error) {
      logger.error(`Error en routeQualifiedProspect: ${error.message}`);
      
      // En caso de error, mantener en estado calificado y ofrecer opciones genéricas
      return {
        response: `Gracias por compartir esa información. ¿Te gustaría conocer más sobre nuestra solución LogiFit o prefieres programar una llamada con nuestro especialista?`,
        newState: {
          ...prospectState,
          lastInteraction: new Date(),
          lastError: error.message
        }
      };
    }
  }

  /**
   * Maneja prospectos ya calificados según su tipo y potencial
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleQualifiedProspect(message, prospectState) {
    try {
      // Verificar si el mensaje indica interés en una cita
      const lowerMessage = message.toLowerCase();
      const wantsAppointment = lowerMessage.includes('cita') || 
                              lowerMessage.includes('reunión') || 
                              lowerMessage.includes('reunir') ||
                              lowerMessage.includes('llamada') ||
                              lowerMessage.includes('hablar') ||
                              lowerMessage.includes('sí') ||
                              lowerMessage.includes('si');
      
      // Verificar si el mensaje indica interés en más información
      const wantsMoreInfo = lowerMessage.includes('información') || 
                           lowerMessage.includes('info') || 
                           lowerMessage.includes('detalles') ||
                           lowerMessage.includes('más') ||
                           lowerMessage.includes('envía') ||
                           lowerMessage.includes('manda');
      
      // Determinar la siguiente acción basada en el tipo de prospecto y su respuesta
      if (wantsAppointment) {
        // Si quiere una cita, pasar a programación
        return {
          response: `¡Excelente! Me encantaría coordinar una llamada con nuestro especialista. ¿Qué día y horario te resultaría más conveniente para esta reunión? Tenemos disponibilidad de lunes a viernes de 9:00 a 18:00 hrs.`,
          newState: {
            ...prospectState,
            conversationState: 'appointment_scheduling',
            appointmentRequested: true,
            lastInteraction: new Date()
          }
        };
      } else if (wantsMoreInfo) {
        // Si quiere más información, enviar material según su tipo
        let response;
        
        if (prospectState.prospectType === 'ENCARGADO') {
          response = `Con gusto te envío más información. Te comparto un documento con los detalles técnicos de nuestra solución LogiFit, casos de éxito y un análisis de ROI específico para empresas de transporte. ¿Hay algún aspecto en particular sobre el que te gustaría profundizar?`;
        } else if (prospectState.prospectType === 'INFLUENCER') {
          response = `Claro, te envío información que te será útil para presentar nuestra solución internamente. Incluye una presentación ejecutiva, beneficios clave y testimonios de clientes. Si necesitas apoyo para presentarlo a los tomadores de decisión, podemos coordinar una demostración conjunta.`;
        } else {
          response = `Con gusto te comparto información general sobre nuestra solución LogiFit. Te envío un folleto digital con las características principales y beneficios. Si tienes alguna pregunta específica, no dudes en consultarme.`;
        }
        
        return {
          response,
          newState: {
            ...prospectState,
            conversationState: 'nurturing',
            infoSent: true,
            lastInteraction: new Date()
          }
        };
      } else {
        // Si la respuesta no es clara, hacer una pregunta directa
        return {
          response: `Para poder ayudarte mejor, ¿prefieres que agendemos una llamada con nuestro especialista o te gustaría recibir más información por este medio?`,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      }
    } catch (error) {
      logger.error('Error en handleQualifiedProspect:', error.message);
      
      return {
        response: `Gracias por tu interés. ¿Te gustaría programar una llamada con nuestro especialista o prefieres recibir más información por este medio?`,
        newState: {
          ...prospectState,
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Maneja la programación de citas
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleAppointmentScheduling(message, prospectState) {
    try {
      // Analizar si el mensaje contiene información de fecha/hora
      const hasDateInfo = this.containsDateInfo(message);
      
      if (hasDateInfo) {
        // Si proporciona fecha/hora, confirmar la cita
        return {
          response: `Perfecto, he agendado tu cita para la fecha y horario que me indicas. Nuestro especialista ${this.vendedorNombre} se pondrá en contacto contigo en ese momento. Te enviaré un recordatorio un día antes. ¿Hay algo más en lo que pueda ayudarte mientras tanto?`,
          newState: {
            ...prospectState,
            appointmentConfirmed: true,
            appointmentDetails: message, // Guardar los detalles proporcionados
            lastInteraction: new Date()
          }
        };
      } else {
        // Si no proporciona fecha/hora, solicitar nuevamente
        return {
          response: `Para agendar la cita, necesito que me indiques qué día y horario te resultaría más conveniente. Tenemos disponibilidad de lunes a viernes de 9:00 a 18:00 hrs.`,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      }
    } catch (error) {
      logger.error('Error en handleAppointmentScheduling:', error.message);
      
      return {
        response: `Disculpa, tuve un problema al procesar la información de la cita. ¿Podrías indicarme nuevamente qué día y horario te resultaría más conveniente para la llamada?`,
        newState: {
          ...prospectState,
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Maneja el proceso de nutrición de prospectos
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleNurturing(message, prospectState) {
    try {
      // Analizar si el mensaje indica interés en una cita después de recibir información
      const lowerMessage = message.toLowerCase();
      const wantsAppointment = lowerMessage.includes('cita') || 
                              lowerMessage.includes('reunión') || 
                              lowerMessage.includes('reunir') ||
                              lowerMessage.includes('llamada') ||
                              lowerMessage.includes('hablar') ||
                              lowerMessage.includes('especialista');
      
      // Analizar si tiene preguntas adicionales
      const hasQuestions = lowerMessage.includes('pregunta') || 
                          lowerMessage.includes('duda') || 
                          lowerMessage.includes('cómo') ||
                          lowerMessage.includes('cuánto') ||
                          lowerMessage.includes('?');
      
      if (wantsAppointment) {
        // Si quiere una cita después de recibir información, pasar a programación
        return {
          response: `¡Excelente decisión! Me encantaría coordinar una llamada con nuestro especialista. ¿Qué día y horario te resultaría más conveniente? Tenemos disponibilidad de lunes a viernes de 9:00 a 18:00 hrs.`,
          newState: {
            ...prospectState,
            conversationState: 'appointment_scheduling',
            appointmentRequested: true,
            lastInteraction: new Date()
          }
        };
      } else if (hasQuestions) {
        // Si tiene preguntas adicionales, responder según el tipo de prospecto
        let response;
        
        if (prospectState.prospectType === 'ENCARGADO') {
          response = `Gracias por tu pregunta. Estaré encantado de resolverla, aunque para darte información más precisa y personalizada para ${prospectState.company || 'tu empresa'}, lo ideal sería coordinar una llamada con nuestro especialista. ¿Te gustaría que agendemos una breve reunión?`;
        } else {
          response = `Gracias por tu pregunta. Intentaré responderla lo mejor posible. Si necesitas información más detallada o personalizada, podríamos coordinar una llamada con nuestro especialista. ¿Qué te parece?`;
        }
        
        return {
          response,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      } else {
        // Si no hay una intención clara, ofrecer ayuda adicional
        return {
          response: `Espero que la información que te compartí sea útil. Si tienes alguna pregunta específica o te gustaría programar una llamada con nuestro especialista para profundizar en cómo podemos ayudar a ${prospectState.company || 'tu empresa'}, no dudes en decírmelo.`,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      }
    } catch (error) {
      logger.error('Error en handleNurturing:', error.message);
      
      return {
        response: `Espero que la información que te compartí sea útil. ¿Hay algo más en lo que pueda ayudarte?`,
        newState: {
          ...prospectState,
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Maneja conversaciones cerradas o inactivas
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleClosedConversation(message, prospectState) {
    // Reiniciar la conversación pero mantener la información del prospecto
    return await greetingFlow.handleInitialGreeting(message, {
      name: prospectState.name,
      company: prospectState.company,
      isIndependent: prospectState.isIndependent,
      messageHistory: prospectState.messageHistory || [],
      conversationState: null,
      lastInteraction: new Date()
    });
  }

  /**
   * Verifica si un mensaje contiene información de fecha/hora
   * @param {string} message - Mensaje a analizar
   * @returns {boolean} - True si contiene información de fecha/hora
   */
  containsDateInfo(message) {
    const lowerMessage = message.toLowerCase();
    
    // Patrones comunes de fechas y horas
    const datePatterns = [
      /lunes|martes|miércoles|miercoles|jueves|viernes/,
      /\d{1,2}\s+de\s+\w+/,
      /\d{1,2}\/\d{1,2}/,
      /mañana|pasado\s+mañana|hoy/,
      /próxima\s+semana|proxima\s+semana|esta\s+semana/
    ];
    
    const timePatterns = [
      /\d{1,2}:\d{2}/,
      /\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)/i,
      /\d{1,2}\s*(?:hrs|horas)/,
      /medio\s*día|mediodia|tarde|mañana|maniana/
    ];
    
    // Verificar si contiene patrones de fecha
    const hasDate = datePatterns.some(pattern => pattern.test(lowerMessage));
    
    // Verificar si contiene patrones de hora
    const hasTime = timePatterns.some(pattern => pattern.test(lowerMessage));
    
    // Considerar que tiene información de fecha/hora si contiene al menos uno de cada uno
    // o si menciona explícitamente disponibilidad
    return (hasDate && hasTime) || 
           lowerMessage.includes('disponible') || 
           lowerMessage.includes('disponibilidad') ||
           lowerMessage.includes('puedo');
  }

  identifyCampaign = (prospectState, message) => {
    try {
      // Verificar si el mensaje contiene una imagen o es un mensaje reenviado
      const isForwarded = /forwarded|reenviado/i.test(message);
      
      // Verificar si es un enlace de Facebook o una imagen
      const isFacebookLink = /fb\.me|facebook\.com/i.test(message);
      const hasImage = /image|imagen|photo|foto/i.test(message);
      
      // Obtener historial completo
      const history = prospectState.phoneNumber ? this.getHistory(prospectState.phoneNumber) : [];
      const allMessages = [...history.map(m => m.content), message].join('\n');

      // Verificar patrones de Facebook
      const isFacebookCampaign = this.campaignPatterns.FACEBOOK.some(pattern => 
        pattern.test(allMessages)
      ) || isForwarded || isFacebookLink;

      // Verificar patrones generales
      const isGeneralCampaign = this.campaignPatterns.GENERAL.some(pattern => 
        pattern.test(allMessages)
      ) || isForwarded || hasImage || isFacebookLink;

      // Extraer palabras clave
      const keywords = this.extractCampaignKeywords(allMessages);

      // Si hay enlaces de Facebook, asumir que es una campaña
      if (isFacebookLink) {
        keywords.push('oferta');
        keywords.push('smart band');
      }

      return {
        source: isFacebookCampaign ? 'FACEBOOK' : 'GENERAL',
        type: isGeneralCampaign ? 'CAMPAIGN' : 'ORGANIC',
        keywords: keywords,
        isForwarded: isForwarded,
        hasImage: hasImage,
        isFacebookLink: isFacebookLink
      };
    } catch (error) {
      logger.error('Error al identificar campaña:', error);
      return {
        source: 'GENERAL',
        type: 'ORGANIC',
        keywords: []
      };
    }
  };

  extractCampaignKeywords = (text) => {
    const keywords = [];
    const patterns = [
      /smart\s*bands?/i,
      /fatiga/i,
      /somnolencia/i,
      /seguridad/i,
      /conductor(?:es)?/i,
      /flota/i,
      /precio/i,
      /oferta/i,
      /descuento/i
    ];

    patterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match) {
        keywords.push(match[0].toLowerCase());
      }
    });

    return [...new Set(keywords)]; // Eliminar duplicados
  };

  extractNameAndCompany = (message) => {
    let name = null;
    let company = null;
    
    // Convertir mensaje a minúsculas para comparación
    const lowerMessage = message.toLowerCase();
    
    // Patrones para detectar nombres
    const namePatterns = [
      /(?:me llamo|soy) ([^,]+)(?:,|\sy)/i,
      /(?:me llamo|soy) ([^,]+)(?:$|,)/i,
      /(?:^|\s)([^,]+)(?:,\s*(?:de|gerente|conductor|trabajo|trabajando))(?:\s+en|\s+de)?/i
    ];

    // Patrones para detectar empresas
    const companyPatterns = [
      /(?:trabajo en|trabajando en|empresa|de la empresa)\s+([^,.]+)/i,
      /(?:gerente|conductor)\s+(?:en|de)\s+([^,.]+)/i,
      /(?:,\s*de\s+)([^,.]+)/i
    ];

    // Buscar nombre
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        name = match[1].trim();
        break;
      }
    }

    // Buscar empresa
    for (const pattern of companyPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        company = match[1].trim();
        break;
      }
    }

    // Limpiar el nombre
    if (name) {
      // Remover palabras comunes y cargos
      const wordsToRemove = [
        'soy', 'me', 'llamo', 'trabajo', 'en', 'de', 'la', 'empresa',
        'gerente', 'conductor', 'operaciones', 'independiente'
      ];
      name = name.split(' ')
        .filter(word => !wordsToRemove.includes(word.toLowerCase()))
        .join(' ')
        .trim();
    }

    // Limpiar la empresa
    if (company) {
      // Remover palabras comunes
      const companyWordsToRemove = [
        'la', 'empresa', 'en', 'de', 'operaciones'
      ];
      company = company.split(' ')
        .filter(word => !companyWordsToRemove.includes(word.toLowerCase()))
        .join(' ')
        .trim();
    }

    // Manejar caso de conductor independiente
    if (lowerMessage.includes('conductor independiente')) {
      company = 'Independiente/Personal';
    }

    return { name, company };
  };

  handleInitialQualification = async (prospectState, message) => {
    try {
      // Si no hay pregunta actual, establecer la primera
      if (!prospectState.currentQuestion) {
        const questions = this.qualificationQuestions[prospectState.prospectType || 'CURIOSO'];
        prospectState.currentQuestion = questions[0];
      }

      // Analizar la relevancia de la respuesta
      const relevanceAnalysis = await analyzeResponseRelevance(message, prospectState.currentQuestion);
      
      if (relevanceAnalysis.isRelevant) {
        // Guardar la respuesta
        if (!prospectState.qualificationAnswers) {
          prospectState.qualificationAnswers = {};
        }
        prospectState.qualificationAnswers[prospectState.currentQuestion] = message;

        // Determinar siguiente pregunta
        const questions = this.qualificationQuestions[prospectState.prospectType || 'CURIOSO'];
        const currentIndex = questions.indexOf(prospectState.currentQuestion);
        
        if (currentIndex < questions.length - 1) {
          // Pasar a la siguiente pregunta
          prospectState.currentQuestion = questions[currentIndex + 1];
          
          return {
            response: prospectState.currentQuestion,
            newState: prospectState
          };
        } else {
          // Finalizar calificación inicial
          delete prospectState.currentQuestion;
          
          // Si es CURIOSO, terminar con mensaje educativo
          if (prospectState.prospectType === 'CURIOSO') {
            prospectState.conversationState = this.states.COMPLETED;
            return {
              response: `Gracias por tu interés. Te comparto información sobre cómo nuestro sistema ayuda a prevenir accidentes por fatiga:\n\n` +
                       `• Monitoreo en tiempo real del estado del conductor\n` +
                       `• Alertas preventivas antes de que ocurra un microsueño\n` +
                       `• Reportes y análisis de patrones de fatiga\n\n` +
                       `Si en el futuro trabajas con una empresa de transporte, no dudes en contactarnos nuevamente.`,
              newState: prospectState
            };
          }
          
          // Para otros tipos, pasar a calificación profunda
          prospectState.conversationState = this.states.DEEP_QUALIFICATION;
          prospectState.currentQuestion = this.qualificationQuestions.ENCARGADO[0];
          
          return {
            response: `Gracias por la información. Me gustaría hacerte algunas preguntas más específicas para entender mejor cómo podemos ayudar a ${prospectState.company}.\n\n${prospectState.currentQuestion}`,
            newState: prospectState
          };
        }
      } else {
        // Si la respuesta no es relevante, repetir la pregunta
        return {
          response: `Disculpa, no pude entender bien tu respuesta. ¿Podrías responder específicamente a esta pregunta?\n\n${prospectState.currentQuestion}`,
          newState: prospectState
        };
      }
    } catch (error) {
      logger.error('Error en handleInitialQualification:', error);
      throw error;
    }
  };

  handleDeepQualification = async (prospectState, message) => {
    // Obtener la pregunta actual
    const currentQuestion = this.qualificationQuestions[prospectState.prospectType][prospectState.qualificationStep - 1];
    
    // Analizar si la respuesta es relevante a la pregunta actual
    const relevanceAnalysis = await analyzeResponseRelevance(currentQuestion, message);
    
    // Si la respuesta no es relevante, manejarla de forma especial
    if (!relevanceAnalysis.isRelevant) {
      logger.info(`Respuesta no relevante detectada: "${message}" para pregunta: "${currentQuestion}"`);
      console.log(`Respuesta no relevante detectada. Razonamiento: ${relevanceAnalysis.reasoning}`);
      
      // Si no debemos continuar con el flujo normal, responder según la sugerencia
      if (!relevanceAnalysis.shouldContinue) {
        return {
          response: relevanceAnalysis.suggestedResponse,
          newState: prospectState // Mantener el mismo estado para repetir la pregunta después
        };
      }
      
      // Si a pesar de no ser relevante debemos continuar, añadir una nota y seguir
      console.log('Continuando con el flujo normal a pesar de respuesta no relevante');
    }
    
    // Guardar respuesta a la pregunta actual
    const qualificationAnswers = {
      ...prospectState.qualificationAnswers,
      [currentQuestion]: message
    };
    
    // Verificar si hay más preguntas
    if (prospectState.qualificationStep < this.qualificationQuestions[prospectState.prospectType].length) {
      // Siguiente pregunta
      const nextQuestion = this.qualificationQuestions[prospectState.prospectType][prospectState.qualificationStep];
      
      // Actualizar estado
      const newState = {
        ...prospectState,
        qualificationAnswers,
        qualificationStep: prospectState.qualificationStep + 1,
        lastInteraction: new Date()
      };
      
      return {
        response: nextQuestion,
        newState
      };
    } else {
      // Analizar interés con OpenAI
      const analysis = await this.analyzeInterest(qualificationAnswers);
      
      let response;
      let nextState;
      
      // Si hay interés, ofrecer una reunión
      if (analysis.shouldOfferAppointment) {
        response = `Gracias por tus respuestas, ${prospectState.name}. 

¿Tienes 20 minutos para explicarte cómo funciona nuestro sistema de control de fatiga y somnolencia? Podemos agendar una llamada rápida.`;
        
        nextState = this.states.MEETING_OFFER;
      } else {
        // Si no hay suficiente interés, hacer una pregunta general
        response = `Gracias por tus respuestas, ${prospectState.name}.

¿Hay algo específico sobre nuestro sistema de control de fatiga y somnolencia que te gustaría conocer?`;
        
        nextState = this.states.FOLLOW_UP;
      }
      
      // Actualizar estado
      const newState = {
        ...prospectState,
        qualificationAnswers,
        conversationState: nextState,
        interestAnalysis: analysis,
        lastInteraction: new Date()
      };
      
      return {
        response,
        newState
      };
    }
  };

  /**
   * Maneja la oferta de reunión
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleMeetingOffer(message, prospectState) {
    try {
      // Analizar la respuesta del usuario con OpenAI
      const analysisPrompt = `Analiza este mensaje de un cliente respondiendo a una oferta para agendar una reunión o demostración.
      
      Mensaje del cliente: "${message}"
      
      Determina si el cliente:
      1. Acepta la oferta de reunión
      2. Rechaza la oferta de reunión
      3. Solicita más información antes de decidir
      4. Su respuesta no es clara
      
      Responde ÚNICAMENTE con un objeto JSON con esta estructura exacta:
      {
        "intent": "accept" | "reject" | "more_info" | "unclear",
        "reasoning": string // Breve explicación de tu análisis
      }`;
      
      let analysis;
      
      try {
        // Intentar usar OpenAI para el análisis
        const openAIResponse = await generateOpenAIResponse({
          role: 'system',
          content: analysisPrompt
        });
        
        analysis = JSON.parse(openAIResponse);
        logger.info('Análisis de OpenAI para oferta de reunión:', analysis);
      } catch (error) {
        logger.error('Error al analizar respuesta con OpenAI:', error.message);
        
        // Fallback a análisis simple si OpenAI falla
        analysis = this.analyzeSimpleMeetingResponse(message);
        logger.info('Usando análisis simple como fallback para oferta de reunión:', analysis);
      }
      
      // Manejar según el tipo de respuesta
      if (analysis.intent === 'accept') {
        // Cliente acepta la oferta de reunión
        // Usar el flujo de invitación para ofrecer un horario disponible
        return await invitationFlow.offerAvailableTimeSlot(prospectState);
      } else if (analysis.intent === 'reject') {
        // Cliente rechaza la oferta de reunión
        const response = `Entiendo que por ahora no estás interesado en una reunión. Si en el futuro necesitas más información o quieres conocer más sobre nuestros servicios, no dudes en contactarnos. ¿Hay algo más en lo que pueda ayudarte?`;
        
        return {
          response,
          newState: {
            ...prospectState,
            conversationState: 'qualification',
            qualificationStep: 'rejected_meeting',
            lastInteraction: new Date()
          }
        };
      } else if (analysis.intent === 'more_info') {
        // Cliente solicita más información
        const response = `Claro, entiendo que necesitas más información antes de decidir. Logifit es una solución tecnológica que ayuda a prevenir accidentes laborales mediante el monitoreo de fatiga y somnolencia en tiempo real. Nuestro sistema utiliza inteligencia artificial para detectar signos de fatiga en los conductores y operadores, enviando alertas inmediatas para prevenir accidentes.

¿Hay algún aspecto específico sobre el que te gustaría saber más? ¿O prefieres que agendemos una demostración para que puedas ver el sistema en acción?`;
        
        return {
          response,
          newState: {
            ...prospectState,
            conversationState: 'qualification',
            qualificationStep: 'providing_info',
            lastInteraction: new Date()
          }
        };
      } else {
        // Respuesta no clara
        const response = `Disculpa, no estoy seguro si estás interesado en agendar una reunión para conocer más sobre Logifit. ¿Te gustaría que coordinemos una breve demostración para mostrarte cómo funciona nuestro sistema?`;
        
        return {
          response,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      }
    } catch (error) {
      logger.error('Error en handleMeetingOffer:', error);
      
      // Respuesta genérica en caso de error
      const response = `Disculpa, tuve un problema procesando tu respuesta. ¿Te gustaría que agendemos una reunión para mostrarte cómo Logifit puede ayudar a tu empresa?`;
      
      return {
        response,
        newState: {
          ...prospectState,
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Analiza la respuesta simple a una oferta de reunión (método de fallback)
   * @param {string} message - Mensaje del cliente
   * @returns {Object} - Resultado del análisis
   */
  analyzeSimpleMeetingResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Patrones para respuestas positivas
    const positivePatterns = [
      /\bs[ií]\b/i,
      /\bclaro\b/i,
      /\bpor supuesto\b/i,
      /\bde acuerdo\b/i,
      /\bok\b/i,
      /\bbueno\b/i,
      /\bexcelente\b/i,
      /\bperfecto\b/i,
      /\bme parece bien\b/i,
      /\bme gustaría\b/i,
      /\bquiero\b/i,
      /\binteresa\b/i
    ];
    
    // Patrones para respuestas negativas
    const negativePatterns = [
      /\bno\b/i,
      /\bno puedo\b/i,
      /\bno quiero\b/i,
      /\bno me interesa\b/i,
      /\bno gracias\b/i,
      /\bno es necesario\b/i,
      /\bno hace falta\b/i
    ];
    
    // Patrones para solicitud de más información
    const moreInfoPatterns = [
      /\bmás información\b/i,
      /\bcuéntame más\b/i,
      /\bexplícame\b/i,
      /\bdetalles\b/i,
      /\bcómo funciona\b/i,
      /\bqué es\b/i,
      /\bcuánto cuesta\b/i,
      /\bprecio\b/i,
      /\btarifa\b/i
    ];
    
    // Verificar si es una respuesta positiva
    if (positivePatterns.some(pattern => pattern.test(lowerMessage))) {
      return {
        intent: 'accept',
        reasoning: 'El cliente acepta la oferta de reunión'
      };
    }
    
    // Verificar si es una respuesta negativa
    if (negativePatterns.some(pattern => pattern.test(lowerMessage))) {
      return {
        intent: 'reject',
        reasoning: 'El cliente rechaza la oferta de reunión'
      };
    }
    
    // Verificar si solicita más información
    if (moreInfoPatterns.some(pattern => pattern.test(lowerMessage))) {
      return {
        intent: 'more_info',
        reasoning: 'El cliente solicita más información antes de decidir'
      };
    }
    
    // Si no se puede determinar
    return {
      intent: 'unclear',
      reasoning: 'No se puede determinar claramente la respuesta del cliente'
    };
  }

  /**
   * Maneja la programación de reuniones
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleMeetingScheduling(message, prospectState) {
    try {
      // Usar el flujo de invitación para manejar la programación
      
      // Determinar el paso actual en el flujo de invitación
      const invitationStep = prospectState.invitationStep || 'schedule_confirmation';
      
      switch (invitationStep) {
        case 'schedule_confirmation':
          return await invitationFlow.handleScheduleConfirmation(message, prospectState);
          
        case 'email_collection':
          return await invitationFlow.handleEmailCollection(message, prospectState);
          
        case 'follow_up':
          // Manejar seguimiento después de la creación de la cita
          const response = `¡Perfecto! Nos vemos en la reunión. Si necesitas hacer algún cambio o tienes alguna pregunta antes de la reunión, no dudes en avisarme.`;
          
          return {
            response,
            newState: {
              ...prospectState,
              conversationState: 'follow_up',
              lastInteraction: new Date()
            }
          };
          
        default:
          // Si no hay un paso definido, ofrecer un horario
          return await invitationFlow.offerAvailableTimeSlot(prospectState);
      }
    } catch (error) {
      logger.error('Error en handleMeetingScheduling:', error);
      
      // Respuesta genérica en caso de error
      const response = `Disculpa, tuve un problema al procesar la programación de la reunión. ¿Podrías indicarme nuevamente tu disponibilidad?`;
      
      return {
        response,
        newState: {
          ...prospectState,
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Sugiere el tiempo más cercano disponible (MÉTODO DEPRECADO - Usar invitationFlow.offerAvailableTimeSlot)
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async suggestNearestTime(prospectState) {
    logger.warn('Método suggestNearestTime está deprecado. Usar invitationFlow.offerAvailableTimeSlot');
    
    // Usar el nuevo método del flujo de invitación
    return await invitationFlow.offerAvailableTimeSlot(prospectState);
  }

  extractName = (message) => {
    // Implementación básica, se puede mejorar con NLP
    const words = message.split(/\s+/);
    if (words.length > 0) {
      // Tomar la primera palabra que comience con mayúscula
      for (const word of words) {
        if (word.length > 2 && /^[A-ZÁÉÍÓÚÑ]/.test(word)) {
          return word;
        }
      }
      // Si no hay palabras con mayúscula, tomar la primera palabra
      return words[0];
    }
    
    return 'Cliente';
  };

  extractRUC = (message) => {
    const rucMatch = message.match(/\b\d{11}\b/);
    return rucMatch ? rucMatch[0] : null;
  };

  extractEmails = (message) => {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return message.match(emailRegex) || [];
  };

  isPositiveResponse = (message) => {
    const positivePatterns = [
      /\bs[ií]\b/i,
      /\bclaro\b/i,
      /\bpor supuesto\b/i,
      /\bde acuerdo\b/i,
      /\bok\b/i,
      /\bbueno\b/i,
      /\bexcelente\b/i,
      /\bperfecto\b/i,
      /\bme parece bien\b/i
    ];
    
    return positivePatterns.some(pattern => pattern.test(message));
  };

  extractTimeFromMessage = (message) => {
    // Patrones para diferentes formatos de hora
    const patterns = [
      // Formato "hoy a las HH:MM"
      { regex: /hoy a las (\d{1,2})[:.:]?(\d{2})?/i, today: true },
      // Formato "mañana a las HH:MM"
      { regex: /ma[ñn]ana a las (\d{1,2})[:.:]?(\d{2})?/i, tomorrow: true },
      // Formato "HH:MM"
      { regex: /\b(\d{1,2})[:.:](\d{2})\b/, today: true },
      // Formato "a las HH"
      { regex: /a las (\d{1,2})/i, today: true },
      // Formato "a las HH de la tarde/noche"
      { regex: /a las (\d{1,2})(?:\s+de la\s+(tarde|noche))?/i, today: true, pmIfSpecified: true }
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern.regex);
      if (match) {
        let hour = parseInt(match[1], 10);
        const minute = match[2] ? parseInt(match[2], 10) : 0;
        
        // Ajustar AM/PM si se especifica "tarde" o "noche"
        if (pattern.pmIfSpecified && match[3] && (match[3].toLowerCase() === 'tarde' || match[3].toLowerCase() === 'noche') && hour < 12) {
          hour += 12;
        }
        
        // Ajustar formato 24 horas
        if (hour < 8 && hour !== 0) {
          hour += 12; // Asumir PM para horas entre 1-7
        }
        
        const now = new Date();
        let date = new Date(now);
        
        if (pattern.tomorrow) {
          date.setDate(date.getDate() + 1);
        }
        
        date.setHours(hour, minute, 0, 0);
        
        // Formato YYYY-MM-DD HH:MM
        return date.toISOString().substring(0, 16).replace('T', ' ');
      }
    }
    
    return null;
  };

  parseSelectedTime = (selectedTime, timezone = 'America/Lima') => {
    try {
      // Si no hay hora seleccionada, usar la hora actual + 1 hora
      if (!selectedTime) {
        return this.parseSelectedTime(this.suggestNearestTime(timezone), timezone);
      }
      
      // Parsear la fecha y hora
      const dateTime = moment.tz(selectedTime, 'YYYY-MM-DD HH:mm', timezone);
      
      // Formatear para mostrar al usuario
      const date = dateTime.format('DD/MM/YYYY');
      const time = dateTime.format('HH:mm');
      
      // Convertir a UTC para Google Calendar
      const utcDateTime = dateTime.clone().tz('UTC').format();
      
      return {
        date,
        time,
        dateTime: utcDateTime
      };
    } catch (error) {
      logger.error('Error al parsear hora seleccionada:', error);
      
      // Valor por defecto en caso de error
      const now = moment().tz(timezone).add(1, 'hour').startOf('hour');
      return {
        date: now.format('DD/MM/YYYY'),
        time: now.format('HH:mm'),
        dateTime: now.clone().tz('UTC').format()
      };
    }
  };
}

module.exports = new CampaignFlow(); 