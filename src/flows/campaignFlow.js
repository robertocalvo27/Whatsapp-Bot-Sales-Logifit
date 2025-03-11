const { generateOpenAIResponse, analyzeResponseRelevance } = require('../services/openaiService');
const { checkCalendarAvailability, createCalendarEvent } = require('../services/calendarService');
const { searchCompanyInfo } = require('../services/companyService');
const { sendAppointmentToMake, formatAppointmentData } = require('../services/webhookService');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

/**
 * Maneja el flujo de conversación para campañas de marketing
 */
class CampaignFlow {
  constructor() {
    this.states = {
      GREETING: 'greeting',
      QUALIFICATION: 'qualification',
      MEETING_OFFER: 'meeting_offer',
      MEETING_SCHEDULING: 'meeting_scheduling',
      EMAIL_COLLECTION: 'email_collection',
      FOLLOW_UP: 'follow_up',
      COMPLETED: 'completed'
    };
    
    this.qualificationQuestions = [
      '¿Han utilizado anteriormente algún software de control de fatiga y somnolencia?',
      '¿Cuántas unidades o conductores tienen en su flota?',
      '¿Cuál es el principal problema que enfrentan con la fatiga de sus conductores?'
    ];
  }

  /**
   * Procesa un mensaje entrante y genera una respuesta según el estado de la conversación
   * @param {Object} prospectState - Estado actual del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async processMessage(prospectState, message) {
    // Si es un nuevo prospecto, inicializar estado
    if (!prospectState.conversationState) {
      return this.handleNewProspect(prospectState, message);
    }

    // Procesar según el estado actual
    switch (prospectState.conversationState) {
      case this.states.GREETING:
        return this.handleGreeting(prospectState, message);
      
      case this.states.QUALIFICATION:
        return this.handleQualification(prospectState, message);
      
      case this.states.MEETING_OFFER:
        return this.handleMeetingOffer(prospectState, message);
      
      case this.states.MEETING_SCHEDULING:
        return this.handleMeetingScheduling(prospectState, message);
      
      case this.states.EMAIL_COLLECTION:
        return this.handleEmailCollection(prospectState, message);
      
      case this.states.FOLLOW_UP:
        return this.handleFollowUp(prospectState, message);
      
      default:
        // Usar OpenAI para generar una respuesta general
        const response = await generateOpenAIResponse({
          role: 'user',
          content: message
        });
        
        return {
          response,
          newState: prospectState
        };
    }
  }

  /**
   * Maneja un nuevo prospecto
   * @param {Object} prospectState - Estado inicial del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleNewProspect(prospectState, message) {
    // Identificar la campaña por palabras clave
    const campaignType = this.identifyCampaign(message);
    
    // Obtener nombre del vendedor desde variables de entorno
    const vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Roberto Calvo';
    
    // Respuesta de saludo personalizada según la campaña
    const greeting = `¡Hola! 👋😊 Soy ${vendedorNombre}, tu Asesor Comercial en LogiFit. ¡Será un placer acompañarte en este recorrido! 

¿Me ayudas compartiendo tu nombre y el de tu empresa, por favor? 📦🚀`;

    // Actualizar estado
    const newState = {
      ...prospectState,
      conversationState: this.states.GREETING,
      campaignType,
      qualificationStep: 0,
      qualificationAnswers: {},
      lastInteraction: new Date()
    };
    
    return {
      response: greeting,
      newState
    };
  }

  /**
   * Maneja la respuesta al saludo inicial
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleGreeting(prospectState, message) {
    // Extraer nombre y posiblemente empresa/cargo
    const name = this.extractName(message);
    
    // Intentar extraer nombre de empresa
    let company = null;
    const companyMatch = message.match(/(?:empresa|compañía|organización|trabajo en|trabajo para)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+)/i);
    if (companyMatch && companyMatch[1]) {
      company = companyMatch[1].trim();
    }
    
    // Buscar información de la empresa si se menciona un RUC
    let companyInfo = null;
    const ruc = this.extractRUC(message);
    if (ruc) {
      companyInfo = await searchCompanyInfo(ruc);
      // Si encontramos info por RUC, usarla para el nombre de la empresa
      if (companyInfo && companyInfo.razonSocial) {
        company = companyInfo.razonSocial;
      }
    }
    
    // Iniciar calificación
    const question = this.qualificationQuestions[0];
    const response = `Mucho gusto ${name}! 😊 

Para poder ayudarte mejor con nuestra solución de control de fatiga y somnolencia, me gustaría hacerte algunas preguntas rápidas.

${question}`;

    // Actualizar estado
    const newState = {
      ...prospectState,
      name,
      company,
      companyInfo,
      conversationState: this.states.QUALIFICATION,
      qualificationStep: 1,
      lastInteraction: new Date()
    };
    
    return {
      response,
      newState
    };
  }

  /**
   * Maneja las respuestas a las preguntas de calificación
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleQualification(prospectState, message) {
    // Obtener la pregunta actual
    const currentQuestion = this.qualificationQuestions[prospectState.qualificationStep - 1];
    
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
    if (prospectState.qualificationStep < this.qualificationQuestions.length) {
      // Siguiente pregunta
      const nextQuestion = this.qualificationQuestions[prospectState.qualificationStep];
      
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
  }

  /**
   * Maneja la respuesta a la oferta de reunión
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleMeetingOffer(prospectState, message) {
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
  }

  /**
   * Maneja la programación de la reunión
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleMeetingScheduling(prospectState, message) {
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
  }

  /**
   * Maneja la recolección de correo electrónico
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleEmailCollection(prospectState, message) {
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
✨🌟🌞 ¡Tu bienestar es nuestra prioridad! ⚒️👍

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
  }

  /**
   * Maneja el seguimiento después de la calificación
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleFollowUp(prospectState, message) {
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
  }

  /**
   * Analiza el interés del prospecto
   * @param {Object} qualificationAnswers - Respuestas a las preguntas de calificación
   * @returns {Promise<Object>} - Análisis de interés
   */
  async analyzeInterest(qualificationAnswers) {
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
  }

  /**
   * Identifica la campaña basada en palabras clave
   * @param {string} message - Mensaje recibido
   * @returns {string} - Tipo de campaña
   */
  identifyCampaign(message) {
    // Implementación básica, se puede mejorar con análisis de texto
    if (/fatiga|somnolencia|cansancio|accidente|seguridad/i.test(message)) {
      return 'fatiga';
    }
    
    return 'general';
  }

  /**
   * Extrae el nombre del mensaje
   * @param {string} message - Mensaje recibido
   * @returns {string} - Nombre extraído
   */
  extractName(message) {
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
  }

  /**
   * Extrae el RUC del mensaje
   * @param {string} message - Mensaje recibido
   * @returns {string|null} - RUC extraído o null
   */
  extractRUC(message) {
    const rucMatch = message.match(/\b\d{11}\b/);
    return rucMatch ? rucMatch[0] : null;
  }

  /**
   * Extrae correos electrónicos del mensaje
   * @param {string} message - Mensaje recibido
   * @returns {Array<string>} - Correos electrónicos extraídos
   */
  extractEmails(message) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return message.match(emailRegex) || [];
  }

  /**
   * Determina si una respuesta es positiva
   * @param {string} message - Mensaje recibido
   * @returns {boolean} - True si es positiva
   */
  isPositiveResponse(message) {
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
  }

  /**
   * Sugiere el horario más cercano disponible
   * @param {string} timezone - Zona horaria del cliente
   * @returns {string} - Horario sugerido
   */
  suggestNearestTime(timezone = 'America/Lima') {
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
  }

  /**
   * Extrae la hora de un mensaje
   * @param {string} message - Mensaje recibido
   * @returns {string|null} - Hora extraída o null
   */
  extractTimeFromMessage(message) {
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
  }

  /**
   * Parsea la hora seleccionada
   * @param {string} selectedTime - Hora seleccionada en formato YYYY-MM-DD HH:MM
   * @param {string} timezone - Zona horaria del cliente
   * @returns {Object} - Fecha, hora y fecha-hora
   */
  parseSelectedTime(selectedTime, timezone = 'America/Lima') {
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
  }
}

module.exports = new CampaignFlow(); 