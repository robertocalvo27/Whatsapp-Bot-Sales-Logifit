const { generateOpenAIResponse, analyzeResponseRelevance } = require('../services/openaiService');
const { checkCalendarAvailability, createCalendarEvent } = require('../services/calendarService');
const { searchCompanyInfo, searchCompanyByName } = require('../services/companyService');
const { sendAppointmentToMake, formatAppointmentData } = require('../services/webhookService');
const { humanizeResponse } = require('../utils/humanizer');
const greetingFlow = require('./greetingFlow');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

/**
 * Maneja el flujo de conversación para campañas de marketing
 */
class CampaignFlow {
  constructor() {
    this.states = {
      GREETING: 'greeting',
      INITIAL_QUALIFICATION: 'initial_qualification',
      DEEP_QUALIFICATION: 'deep_qualification',
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

  processMessage = async (prospectState, message) => {
    try {
      // Agregar mensaje al historial
      if (prospectState.phoneNumber) {
        this.addToHistory(prospectState.phoneNumber, {
          type: 'received',
          content: message
        });
      }

      let result;

      // Si es un nuevo prospecto o está en estado greeting, usar greetingFlow
      if (!prospectState.conversationState || prospectState.conversationState === this.states.GREETING) {
        result = await greetingFlow.handleInitialGreeting(message, prospectState);
      } else {
        // Procesar según el estado actual
        switch (prospectState.conversationState) {
          case this.states.INITIAL_QUALIFICATION:
            result = await this.handleInitialQualification(prospectState, message);
            break;
          
          case this.states.DEEP_QUALIFICATION:
            result = await this.handleDeepQualification(prospectState, message);
            break;
          
          case this.states.MEETING_OFFER:
            result = await this.handleMeetingOffer(prospectState, message);
            break;
          
          case this.states.MEETING_SCHEDULING:
            result = await this.handleMeetingScheduling(prospectState, message);
            break;
          
          case this.states.EMAIL_COLLECTION:
            result = await this.handleEmailCollection(prospectState, message);
            break;
          
          case this.states.FOLLOW_UP:
            result = await this.handleFollowUp(prospectState, message);
            break;
          
          default:
            // Usar OpenAI para generar una respuesta general
            const aiResponse = await generateOpenAIResponse({
              role: 'user',
              content: message
            });
            result = {
              response: aiResponse,
              newState: prospectState
            };
        }
      }

      // Humanizar la respuesta
      const humanizedChunks = await humanizeResponse(result.response);
      
      // Registrar la respuesta en el historial
      if (prospectState.phoneNumber) {
        this.addToHistory(prospectState.phoneNumber, {
          type: 'sent',
          content: result.response
        });
      }

      // Registrar para depuración
      logger.info(`Estado: ${result.newState.conversationState}, Respuesta: ${result.response.substring(0, 50)}...`);
      
      return {
        ...result,
        humanizedResponse: humanizedChunks
      };
    } catch (error) {
      logger.error('Error en processMessage:', error);
      return greetingFlow.handleInitialGreeting(message, prospectState);
    }
  };

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
      // Sugerir horario cercano
      const suggestedTime = this.suggestNearestTime(prospectState.timezone);
      
      const response = `Excelente! ¿Te parece bien hoy a las ${suggestedTime}? Te enviaré el link de Google Meet.`;
      
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
    // Interpretar la selección de horario
    const selectedTime = prospectState.suggestedTime || this.extractTimeFromMessage(message);
    
    if (selectedTime) {
      // Solicitar correo electrónico
      const response = `Perfecto, agendaré la reunión para ${selectedTime}. 

¿Me podrías proporcionar tu correo electrónico corporativo para enviarte la invitación? También puedes indicarme si deseas incluir a alguien más en la reunión.`;
      
      // Actualizar estado
      const newState = {
        ...prospectState,
        conversationState: this.states.EMAIL_COLLECTION,
        selectedTime,
        lastInteraction: new Date()
      };
      
      return {
        response,
        newState
      };
    } else {
      // No se pudo interpretar el horario
      const suggestedTime = this.suggestNearestTime(prospectState.timezone);
      
      const response = `Disculpa, no pude entender el horario. ¿Te parece bien hoy a las ${suggestedTime}? O si prefieres, podemos programarlo para mañana.`;
      
      // Actualizar estado
      const newState = {
        ...prospectState,
        suggestedTime,
        lastInteraction: new Date()
      };
      
      return {
        response,
        newState
      };
    }
  };

  handleEmailCollection = async (prospectState, message) => {
    // Extraer correos electrónicos
    const emails = this.extractEmails(message);
    
    if (emails.length > 0) {
      try {
        // Parsear la hora seleccionada
        const { date, time, dateTime } = this.parseSelectedTime(prospectState.selectedTime, prospectState.timezone);
        
        // Crear detalles de la cita
        const appointmentDetails = {
          date,
          time,
          dateTime
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
        
        const response = `¡Listo! He programado la reunión para ${date} a las ${time}.

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
        
        const response = `Lo siento, tuve un problema al agendar la reunión. ¿Podrías confirmarme nuevamente tu disponibilidad para ${prospectState.selectedTime}?`;
        
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