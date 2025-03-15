/**
 * Flujo de invitación para prospectos calificados
 * 
 * Este flujo maneja la invitación y seguimiento de prospectos que han sido
 * calificados y cumplen con criterios de alto valor (flota grande, decisores, etc.)
 */

const { generateOpenAIResponse } = require('../services/openaiService');
const logger = require('../utils/logger');
const { withHumanDelayAsync } = require('../utils/humanDelay');
const moment = require('moment-timezone');

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

  /**
   * Ofrece un horario disponible al cliente basado en la disponibilidad del calendario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async offerAvailableTimeSlot(prospectState) {
    try {
      // Importar servicio de calendario
      const { getNearestAvailableSlot } = require('../services/calendarService');
      
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
        conversationState: 'invitation',
        invitationStep: 'schedule_confirmation',
        suggestedSlot: availableSlot,
        lastInteraction: new Date()
      };
      
      return {
        response,
        newState
      };
    } catch (error) {
      logger.error('Error al obtener slot disponible:', error);
      
      // En caso de error, usar un horario genérico
      const now = moment().tz(prospectState.timezone || 'America/Lima');
      let suggestedTime = now.clone().add(2, 'hours').startOf('hour');
      
      // Ajustar para horario laboral
      if (suggestedTime.hour() < 9) {
        suggestedTime.hour(9).minute(0);
      } else if (suggestedTime.hour() >= 18) {
        suggestedTime.add(1, 'day').hour(9).minute(0);
      }
      
      const timeDescription = suggestedTime.isSame(now, 'day') 
        ? `hoy a las ${suggestedTime.format('HH:mm')}` 
        : `mañana a las ${suggestedTime.format('HH:mm')}`;
      
      const response = `¡Excelente! ¿Te parece bien ${timeDescription}? Te enviaré el link de Google Meet.`;
      
      // Actualizar estado
      const newState = {
        ...prospectState,
        conversationState: 'invitation',
        invitationStep: 'schedule_confirmation',
        suggestedTime: suggestedTime.format('YYYY-MM-DD HH:mm'),
        lastInteraction: new Date()
      };
      
      return {
        response,
        newState
      };
    }
  }

  /**
   * Maneja la respuesta del cliente a la oferta de horario
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleScheduleConfirmation(message, prospectState) {
    try {
      // Usar OpenAI para analizar si la respuesta es positiva o negativa
      const analysisPrompt = `Analiza este mensaje de un cliente respondiendo a una propuesta de horario para una reunión.
      
      Mensaje del cliente: "${message}"
      
      Determina si el cliente:
      1. Acepta el horario propuesto
      2. Rechaza el horario propuesto
      3. Propone un horario alternativo
      4. Su respuesta no es clara
      
      Responde ÚNICAMENTE con un objeto JSON con esta estructura exacta:
      {
        "acceptance": "accept" | "reject" | "alternative" | "unclear",
        "proposedTime": string | null, // Si propone un horario alternativo, extráelo aquí en formato "DD/MM/YYYY HH:MM" o null si no hay propuesta
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
        logger.info('Análisis de OpenAI para confirmación de horario:', analysis);
      } catch (error) {
        logger.error('Error al analizar respuesta con OpenAI:', error.message);
        
        // Fallback a análisis simple si OpenAI falla
        analysis = this.analyzeScheduleResponse(message);
        logger.info('Usando análisis simple como fallback para confirmación de horario:', analysis);
      }
      
      // Manejar según el tipo de respuesta
      if (analysis.acceptance === 'accept') {
        // Cliente acepta el horario
        return this.handleAcceptedSchedule(prospectState);
      } else if (analysis.acceptance === 'reject') {
        // Cliente rechaza el horario
        return this.handleRejectedSchedule(prospectState);
      } else if (analysis.acceptance === 'alternative' && analysis.proposedTime) {
        // Cliente propone un horario alternativo
        return this.handleAlternativeSchedule(prospectState, analysis.proposedTime);
      } else {
        // Respuesta no clara, pedir clarificación
        const response = `Disculpa, no estoy seguro si ese horario te funciona. ¿Podrías confirmarme si te parece bien el horario que te propuse o sugerirme otro que te resulte más conveniente?`;
        
        return {
          response,
          newState: {
            ...prospectState,
            lastInteraction: new Date()
          }
        };
      }
    } catch (error) {
      logger.error('Error en handleScheduleConfirmation:', error.message);
      
      // Respuesta genérica en caso de error
      const response = `Disculpa, tuve un problema procesando tu respuesta. ¿Podrías confirmarme si el horario propuesto te funciona o sugerirme otro que te resulte más conveniente?`;
      
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
   * Analiza la respuesta del cliente sobre el horario propuesto (método de fallback)
   * @param {string} message - Mensaje del cliente
   * @returns {Object} - Resultado del análisis
   */
  analyzeScheduleResponse(message) {
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
      /\bme parece bien\b/i
    ];
    
    // Patrones para respuestas negativas
    const negativePatterns = [
      /\bno\b/i,
      /\bno puedo\b/i,
      /\bimposible\b/i,
      /\botro\b/i,
      /\bdistinto\b/i,
      /\bdiferente\b/i
    ];
    
    // Patrones para propuestas alternativas
    const alternativePatterns = [
      /\bprefiero\b/i,
      /\bmejor\b/i,
      /\bpuedo\b/i,
      /\bdisponible\b/i,
      /\ba las\b/i,
      /\bel\b/i
    ];
    
    // Verificar si es una respuesta positiva
    if (positivePatterns.some(pattern => pattern.test(lowerMessage))) {
      return {
        acceptance: 'accept',
        proposedTime: null,
        reasoning: 'El cliente acepta el horario propuesto'
      };
    }
    
    // Verificar si es una respuesta negativa
    if (negativePatterns.some(pattern => pattern.test(lowerMessage))) {
      return {
        acceptance: 'reject',
        proposedTime: null,
        reasoning: 'El cliente rechaza el horario propuesto'
      };
    }
    
    // Verificar si propone un horario alternativo
    if (alternativePatterns.some(pattern => pattern.test(lowerMessage))) {
      // Intentar extraer fecha y hora
      // Esto es simplificado, idealmente se usaría OpenAI para esto
      const dateTimeMatch = lowerMessage.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(?:a las\s+)?(\d{1,2})(?::(\d{2}))?/);
      
      if (dateTimeMatch) {
        const day = dateTimeMatch[1];
        const month = dateTimeMatch[2];
        const year = dateTimeMatch[3] || new Date().getFullYear();
        const hour = dateTimeMatch[4];
        const minute = dateTimeMatch[5] || '00';
        
        return {
          acceptance: 'alternative',
          proposedTime: `${day}/${month}/${year} ${hour}:${minute}`,
          reasoning: 'El cliente propone un horario alternativo'
        };
      }
      
      return {
        acceptance: 'alternative',
        proposedTime: null,
        reasoning: 'El cliente parece proponer un horario alternativo pero no se pudo extraer'
      };
    }
    
    // Si no se puede determinar
    return {
      acceptance: 'unclear',
      proposedTime: null,
      reasoning: 'No se puede determinar claramente la respuesta del cliente'
    };
  }

  /**
   * Maneja el caso cuando el cliente acepta el horario propuesto
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleAcceptedSchedule(prospectState) {
    // Verificar si tenemos un slot sugerido
    const suggestedSlot = prospectState.suggestedSlot;
    const suggestedTime = prospectState.suggestedTime;
    
    // Determinar la descripción del horario
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
      const dateTime = moment(suggestedTime);
      const now = moment();
      
      if (dateTime.isSame(now, 'day')) {
        timeDescription = `hoy a las ${dateTime.format('HH:mm')}`;
      } else if (dateTime.isSame(now.clone().add(1, 'day'), 'day')) {
        timeDescription = `mañana a las ${dateTime.format('HH:mm')}`;
      } else {
        timeDescription = `el ${dateTime.format('DD/MM/YYYY')} a las ${dateTime.format('HH:mm')}`;
      }
    } else {
      // Si no hay hora sugerida, usar hora actual + 2 horas
      const defaultTime = moment().add(2, 'hours').format('HH:mm');
      timeDescription = `hoy a las ${defaultTime}`;
    }
    
    // Solicitar correo electrónico
    const response = `Perfecto, agendaré la reunión para ${timeDescription}. 

¿Me podrías proporcionar tu correo electrónico corporativo para enviarte la invitación? También puedes indicarme si deseas incluir a alguien más en la reunión.`;
    
    // Actualizar estado
    const newState = {
      ...prospectState,
      conversationState: 'invitation',
      invitationStep: 'email_collection',
      selectedSlot: suggestedSlot || { 
        date: moment(suggestedTime).format('DD/MM/YYYY'), 
        time: moment(suggestedTime).format('HH:mm'),
        dateTime: moment(suggestedTime).toISOString()
      },
      lastInteraction: new Date()
    };
    
    return {
      response,
      newState
    };
  }

  /**
   * Maneja el caso cuando el cliente rechaza el horario propuesto
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleRejectedSchedule(prospectState) {
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

  /**
   * Maneja el caso cuando el cliente propone un horario alternativo
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} proposedTime - Horario propuesto por el cliente
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleAlternativeSchedule(prospectState, proposedTime) {
    try {
      // Convertir el horario propuesto a un objeto moment
      const proposedDate = moment(proposedTime, 'DD/MM/YYYY HH:mm');
      
      // Verificar si el horario propuesto es válido
      if (!proposedDate.isValid()) {
        throw new Error('Formato de fecha inválido');
      }
      
      // Verificar si el horario está dentro del horario laboral
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
          conversationState: 'invitation',
          invitationStep: 'email_collection',
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
    } catch (error) {
      logger.error('Error al procesar horario alternativo:', error);
      
      // En caso de error, solicitar clarificación
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

  /**
   * Maneja la recolección de correo electrónico para la cita
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleEmailCollection(message, prospectState) {
    // Extraer correos electrónicos
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = message.match(emailRegex) || [];
    
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
        
        // Usar el webhook para crear la cita
        const { formatAppointmentData, sendAppointmentToMake } = require('../services/webhookService');
        
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
        
        // Actualizar estado
        const newState = {
          ...prospectState,
          conversationState: 'invitation',
          invitationStep: 'follow_up',
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
  }
}

module.exports = new InvitationFlow(); 