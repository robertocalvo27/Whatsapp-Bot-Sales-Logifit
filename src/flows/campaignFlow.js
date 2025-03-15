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

  handleMeetingOffer = async (prospectState, message) => {
    // Analizar si la respuesta es positiva
    const isPositive = this.isPositiveResponse(message);
    
    if (isPositive) {
      try {
        // Obtener el slot disponible más cercano consultando Google Calendar
        const { checkCalendarAvailability, getNearestAvailableSlot } = require('../services/calendarService');
        
        // Obtener slot disponible más cercano
        const availableSlot = await getNearestAvailableSlot(prospectState.timezone);
        
        // Determinar si el slot es para hoy o mañana
        let timeDescription;
        if (availableSlot.isToday) {
          timeDescription = `hoy a las ${availableSlot.time}`;
        } else if (availableSlot.isTomorrow) {
          timeDescription = `mañana a las ${availableSlot.time}`;
        } else {
          timeDescription = `el ${availableSlot.date} a las ${availableSlot.time}`;
        }
        
        const response = `¡Excelente! ¿Te parece bien ${timeDescription}? Te enviaré el link de Google Meet para conectarnos.`;
        
        // Actualizar estado
        const newState = {
          ...prospectState,
          conversationState: this.states.MEETING_SCHEDULING,
          suggestedSlot: availableSlot,
          lastInteraction: new Date()
        };
        
        return {
          response,
          newState
        };
      } catch (error) {
        logger.error('Error al obtener slot disponible:', error);
        
        // En caso de error, usar el método anterior
        const suggestedTime = this.suggestNearestTime(prospectState.timezone);
        
        const response = `¡Excelente! ¿Te parece bien hoy a las ${suggestedTime.split(' ')[1]}? Te enviaré el link de Google Meet.`;
        
        // Actualizar estado
        const newState = {
          ...prospectState,
          conversationState: this.states.MEETING_SCHEDULING,
          suggestedTime,
          lastInteraction: new Date()
        };
        
        return {
          response,
          newState
        };
      }
    } else {
      // Ofrecer alternativas
      const response = `Entiendo. ¿Prefieres programar para otro momento? 

Tengo disponibilidad hoy mismo más tarde o mañana en la mañana. ¿Qué horario te funcionaría mejor?`;
      
      // Actualizar estado
      const newState = {
        ...prospectState,
        conversationState: this.states.MEETING_SCHEDULING,
        lastInteraction: new Date()
      };
      
      return {
        response,
        newState
      };
    }
  };

  handleMeetingScheduling = async (prospectState, message) => {
    // Verificar si el mensaje es una respuesta positiva o negativa
    const isPositive = this.isPositiveResponse(message);
    const isNegative = message.toLowerCase().includes('no') || 
                      message.toLowerCase().includes('otro') || 
                      message.toLowerCase().includes('imposible') || 
                      message.toLowerCase().includes('no puedo');
    
    // Si el cliente acepta la hora sugerida
    if (isPositive) {
      // Verificar si tenemos un slot sugerido
      const suggestedSlot = prospectState.suggestedSlot;
      const suggestedTime = prospectState.suggestedTime;
      
      // Solicitar correo electrónico
      let timeDescription;
      if (suggestedSlot) {
        if (suggestedSlot.isToday) {
          timeDescription = `hoy a las ${suggestedSlot.time}`;
        } else if (suggestedSlot.isTomorrow) {
          timeDescription = `mañana a las ${suggestedSlot.time}`;
        } else {
          timeDescription = `el ${suggestedSlot.date} a las ${suggestedSlot.time}`;
        }
      } else if (suggestedTime) {
        // Formato antiguo
        const timeParts = suggestedTime.split(' ');
        if (timeParts.length > 1) {
          timeDescription = `el ${timeParts[0]} a las ${timeParts[1]}`;
        } else {
          timeDescription = suggestedTime;
        }
      } else {
        // Si no hay hora sugerida, usar hora actual + 2 horas
        const defaultTime = moment().add(2, 'hours').format('HH:mm');
        timeDescription = `hoy a las ${defaultTime}`;
      }
      
      const response = `Perfecto, agendaré la reunión para ${timeDescription}. 

¿Me podrías proporcionar tu correo electrónico corporativo para enviarte la invitación? También puedes indicarme si deseas incluir a alguien más en la reunión.`;
      
      // Actualizar estado
      const newState = {
        ...prospectState,
        conversationState: this.states.EMAIL_COLLECTION,
        selectedSlot: suggestedSlot || { date: moment().format('DD/MM/YYYY'), time: suggestedTime?.split(' ')[1] || moment().add(2, 'hours').format('HH:mm') },
        lastInteraction: new Date()
      };
      
      return {
        response,
        newState
      };
    } 
    // Si el cliente rechaza la hora sugerida
    else if (isNegative) {
      try {
        // Obtener slots alternativos
        const { getNearestAvailableSlot } = require('../services/calendarService');
        
        // Buscar slots para los próximos 3 días
        const availableSlot1 = await getNearestAvailableSlot(prospectState.timezone, 1);
        const availableSlot2 = await getNearestAvailableSlot(prospectState.timezone, 3);
        
        // Filtrar para evitar duplicados
        let alternativeSlots = [availableSlot1];
        if (availableSlot2.dateTime !== availableSlot1.dateTime) {
          alternativeSlots.push(availableSlot2);
        }
        
        // Formatear las alternativas
        const slotDescriptions = alternativeSlots.map(slot => {
          if (slot.isToday) {
            return `hoy a las ${slot.time}`;
          } else if (slot.isTomorrow) {
            return `mañana a las ${slot.time}`;
          } else {
            return `el ${slot.date} a las ${slot.time}`;
          }
        });
        
        let response;
        if (slotDescriptions.length > 1) {
          response = `Entiendo que ese horario no te funciona. Te propongo estas alternativas:

1. ${slotDescriptions[0]}
2. ${slotDescriptions[1]}

¿Cuál de estas opciones te funciona mejor?`;
        } else {
          response = `Entiendo que ese horario no te funciona. ¿Te parece bien ${slotDescriptions[0]}?`;
        }
        
        // Actualizar estado
        const newState = {
          ...prospectState,
          alternativeSlots,
          lastInteraction: new Date()
        };
        
        return {
          response,
          newState
        };
      } catch (error) {
        logger.error('Error al obtener slots alternativos:', error);
        
        // En caso de error, ofrecer alternativas genéricas
        const response = `Entiendo que ese horario no te funciona. ¿Podrías indicarme qué día y horario te resultaría más conveniente? Tenemos disponibilidad de lunes a viernes de 9:00 a 18:00 hrs.`;
        
        return {
          response,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      }
    } 
    // Si el mensaje contiene una propuesta de horario del cliente
    else {
      // Intentar extraer fecha y hora del mensaje
      const extractedDateTime = this.extractTimeFromMessage(message);
      
      if (extractedDateTime) {
        // El cliente ha propuesto un horario específico
        const proposedDate = moment(extractedDateTime);
        
        // Verificar si el horario propuesto es válido (horario laboral y no en el pasado)
        const isValidTime = this.isValidProposedTime(proposedDate);
        
        if (isValidTime) {
          // Formatear para mostrar al usuario
          const formattedDate = proposedDate.format('DD/MM/YYYY');
          const formattedTime = proposedDate.format('HH:mm');
          
          // Solicitar correo electrónico
          const response = `Perfecto, agendaré la reunión para el ${formattedDate} a las ${formattedTime}. 

¿Me podrías proporcionar tu correo electrónico corporativo para enviarte la invitación?`;
          
          // Actualizar estado
          const newState = {
            ...prospectState,
            conversationState: this.states.EMAIL_COLLECTION,
            selectedSlot: {
              date: formattedDate,
              time: formattedTime,
              dateTime: proposedDate.toISOString()
            },
            lastInteraction: new Date()
          };
          
          return {
            response,
            newState
          };
        } else {
          // El horario propuesto no es válido
          const response = `Lo siento, pero el horario que propones no está dentro de nuestro horario laboral o ya ha pasado. Nuestro horario de atención es de lunes a viernes de 9:00 a 18:00 hrs.

¿Podrías proponerme otro horario que te funcione dentro de ese rango?`;
          
          return {
            response,
            newState: {
              ...prospectState,
              lastInteraction: new Date()
            }
          };
        }
      } else {
        // No se pudo extraer un horario del mensaje
        const response = `No pude entender claramente el horario que prefieres. ¿Podrías indicarme qué día y hora te resultaría más conveniente? Por ejemplo: "mañana a las 10:00" o "el viernes a las 15:00".`;
        
        return {
          response,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      }
    }
  };

  /**
   * Verifica si una fecha y hora propuesta es válida (horario laboral y no en el pasado)
   * @param {Object} proposedDate - Fecha propuesta (objeto moment)
   * @returns {boolean} - True si la fecha es válida
   */
  isValidProposedTime(proposedDate) {
    // Verificar que no sea en el pasado
    if (proposedDate.isBefore(moment())) {
      return false;
    }
    
    // Verificar que sea día laboral (lunes a viernes)
    const day = proposedDate.day();
    if (day === 0 || day === 6) { // 0 = domingo, 6 = sábado
      return false;
    }
    
    // Verificar que sea horario laboral (9:00 - 18:00)
    const hour = proposedDate.hour();
    if (hour < 9 || hour >= 18) {
      return false;
    }
    
    // Verificar que no sea hora de almuerzo (13:00 - 14:00)
    if (hour === 13) {
      return false;
    }
    
    return true;
  }

  handleEmailCollection = async (prospectState, message) => {
    // Extraer correos electrónicos
    const emails = this.extractEmails(message);
    
    if (emails.length > 0) {
      try {
        // Obtener el slot seleccionado
        const selectedSlot = prospectState.selectedSlot;
        
        if (!selectedSlot) {
          throw new Error('No se encontró información del slot seleccionado');
        }
        
        // Crear detalles de la cita
        const appointmentDetails = {
          date: selectedSlot.date,
          time: selectedSlot.time,
          dateTime: selectedSlot.dateTime || moment(`${selectedSlot.date} ${selectedSlot.time}`, 'DD/MM/YYYY HH:mm').toISOString()
        };
        
        // Extraer posible nombre de empresa del mensaje o usar el almacenado
        let company = prospectState.company;
        if (!company && message) {
          // Buscar posible nombre de empresa en el mensaje
          const companyMatch = message.match(/(?:empresa|compañía|organización|trabajo en|trabajo para)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+)/i);
          if (companyMatch && companyMatch[1]) {
            company = companyMatch[1].trim();
          }
        }
        
        // Usar el webhook para crear la cita en lugar de crearla directamente
        const webhookData = formatAppointmentData(
          { 
            ...prospectState, 
            emails,
            company: company || 'Empresa del cliente'
          },
          appointmentDetails
        );
        
        // Enviar datos al webhook
        const webhookResult = await sendAppointmentToMake(webhookData);
        
        if (!webhookResult.success) {
          logger.error('Error al enviar datos de cita al webhook:', webhookResult.error);
          throw new Error('Error al crear la cita a través del webhook');
        }
        
        logger.info('Cita creada exitosamente a través del webhook');
        
        // Determinar si la cita es para hoy, mañana o un día específico
        let dateDescription;
        const appointmentDate = moment(appointmentDetails.dateTime);
        const now = moment();
        
        if (appointmentDate.isSame(now, 'day')) {
          dateDescription = `hoy a las ${appointmentDetails.time}`;
        } else if (appointmentDate.isSame(now.clone().add(1, 'day'), 'day')) {
          dateDescription = `mañana a las ${appointmentDetails.time}`;
        } else {
          dateDescription = `el ${appointmentDetails.date} a las ${appointmentDetails.time}`;
        }
        
        const response = `¡Listo! He programado la reunión para ${dateDescription}.

🚀 ¡Únete a nuestra sesión de Logifit! ✨ Logifit es una moderna herramienta tecnológica inteligente adecuada para la gestión del descanso y salud de los colaboradores. Brindamos servicios de monitoreo preventivo como apoyo a la mejora de la salud y prevención de accidentes, con la finalidad de salvaguardar la vida de los trabajadores y ayudarles a alcanzar el máximo de su productividad en el proyecto.
✨🌞 ¡Tu bienestar es nuestra prioridad! ⚒️👍

Te he enviado una invitación por correo electrónico con los detalles y el enlace para la llamada.

Por favor, confirma que has recibido la invitación respondiendo "Confirmado" o "Recibido".`;
        
        // Actualizar estado pero mantener en FOLLOW_UP en lugar de COMPLETED
        const newState = {
          ...prospectState,
          conversationState: this.states.FOLLOW_UP,
          emails,
          company: company || prospectState.company, // Guardar la empresa si se encontró
          appointmentDetails,
          appointmentCreated: true, // Marcar que la cita fue creada
          lastInteraction: new Date()
        };
        
        return {
          response,
          newState
        };
      } catch (error) {
        logger.error('Error al crear cita:', error);
        
        const response = `Lo siento, tuve un problema al agendar la reunión. ¿Podrías confirmarme nuevamente tu disponibilidad?`;
        
        return {
          response,
          newState: prospectState
        };
      }
    } else {
      // No se encontraron correos electrónicos
      const response = `No pude identificar un correo electrónico válido. Por favor, comparte conmigo tu correo electrónico corporativo para poder enviarte la invitación a la reunión.`;
      
      return {
        response,
        newState: prospectState
      };
    }
  };

  handleFollowUp = async (prospectState, message) => {
    // Verificar si ya se creó una cita y estamos esperando confirmación
    if (prospectState.appointmentCreated) {
      // Verificar si el mensaje es una confirmación
      const isConfirmation = /confirm|recib|ok|listo|gracias|recibido/i.test(message);
      
      if (isConfirmation) {
        // El cliente ha confirmado la cita
        const response = `¡Perfecto! Gracias por confirmar. Nos vemos en la reunión el ${prospectState.appointmentDetails.date} a las ${prospectState.appointmentDetails.time}.

Si necesitas hacer algún cambio o tienes alguna pregunta antes de la reunión, no dudes en escribirme.

¡Que tengas un excelente día!`;
        
        // Actualizar estado a COMPLETED
        const newState = {
          ...prospectState,
          conversationState: this.states.COMPLETED,
          confirmationReceived: true,
          lastInteraction: new Date()
        };
        
        return {
          response,
          newState
        };
      } else {
        // El cliente respondió algo diferente a una confirmación
        const response = `Gracias por tu mensaje. ¿Has recibido la invitación para nuestra reunión programada para el ${prospectState.appointmentDetails.date} a las ${prospectState.appointmentDetails.time}?

Por favor, confirma que la has recibido o si necesitas que te la reenvíe.`;
        
        return {
          response,
          newState: prospectState
        };
      }
    }
    
    // Comportamiento original para seguimiento sin cita creada
    // Usar OpenAI para generar una respuesta personalizada
    const prompt = `El prospecto ${prospectState.name} ha preguntado: "${message}" sobre nuestro sistema de control de fatiga y somnolencia. 
    Basado en sus respuestas previas: ${JSON.stringify(prospectState.qualificationAnswers)}.
    
    Genera una respuesta breve y persuasiva que intente llevar la conversación hacia agendar una demostración del producto. Menciona que podemos hacer una llamada rápida de 20 minutos para mostrarle cómo funciona el sistema.`;
    
    const response = await generateOpenAIResponse({
      role: 'system',
      content: prompt
    });
    
    // Actualizar estado
    const newState = {
      ...prospectState,
      conversationState: this.states.MEETING_OFFER,
      lastInteraction: new Date()
    };
    
    return {
      response,
      newState
    };
  };

  analyzeInterest = async (qualificationAnswers) => {
    const answersText = Object.entries(qualificationAnswers)
      .map(([question, answer]) => `${question}: ${answer}`)
      .join('\n');
    
    const analysis = await generateOpenAIResponse({
      role: 'system',
      content: `Analiza las siguientes respuestas de un prospecto para determinar su nivel de interés en nuestro sistema de control de fatiga y somnolencia.
      
      Respuestas del prospecto:
      ${answersText}
      
      Proporciona un análisis en formato JSON con los siguientes campos:
      - highInterest: booleano que indica si el prospecto muestra un alto nivel de interés
      - interestScore: puntuación de 1 a 10 del nivel de interés
      - shouldOfferAppointment: booleano que indica si deberíamos ofrecer programar una cita
      - reasoning: breve explicación de tu análisis
      
      IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin ningún texto adicional, comillas de código o formato markdown.`
    });
    
    try {
      return JSON.parse(analysis);
    } catch (error) {
      logger.error('Error al parsear análisis:', error);
      // Valor por defecto
      return {
        highInterest: true,
        interestScore: 7,
        shouldOfferAppointment: true,
        reasoning: 'No se pudo analizar correctamente, asumiendo interés por defecto'
      };
    }
  };

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

  suggestNearestTime = (timezone = 'America/Lima') => {
    // Obtener hora actual en la zona horaria del cliente
    const now = moment().tz(timezone);
    
    // Crear una copia para trabajar
    let suggestedTime = now.clone();
    
    // Avanzar al menos 1 hora desde ahora
    suggestedTime.add(1, 'hour').startOf('hour');
    
    // Ajustar según día de la semana y hora
    const adjustTimeForWorkingHours = (time) => {
      const day = time.day();
      const hour = time.hour();
      
      // Si es fin de semana (0 = domingo, 6 = sábado), avanzar al lunes
      if (day === 0) { // Domingo
        time.add(1, 'day').hour(9).minute(0);
        return time;
      } else if (day === 6) { // Sábado
        time.add(2, 'day').hour(9).minute(0);
        return time;
      }
      
      // Ajustar según hora del día
      if (hour < 9) {
        // Antes del horario laboral, sugerir 9:00 AM
        time.hour(9).minute(0);
      } else if (hour >= 13 && hour < 14) {
        // Durante el refrigerio, sugerir 2:00 PM
        time.hour(14).minute(0);
      } else if (hour >= 18) {
        // Después del horario laboral, sugerir 9:00 AM del día siguiente
        // Verificar si el día siguiente es fin de semana
        const nextDay = time.clone().add(1, 'day');
        if (nextDay.day() === 6) { // Si es sábado
          time.add(3, 'day').hour(9).minute(0); // Avanzar al lunes
        } else if (nextDay.day() === 0) { // Si es domingo
          time.add(2, 'day').hour(9).minute(0); // Avanzar al lunes
        } else {
          time.add(1, 'day').hour(9).minute(0); // Avanzar al día siguiente
        }
      }
      
      return time;
    };
    
    // Aplicar ajustes de horario laboral
    suggestedTime = adjustTimeForWorkingHours(suggestedTime);
    
    // Formatear la fecha y hora
    return suggestedTime.format('YYYY-MM-DD HH:mm');
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