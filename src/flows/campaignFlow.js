const { generateOpenAIResponse } = require('../services/openaiService');
const { checkCalendarAvailability, createCalendarEvent } = require('../services/calendarService');
const { searchCompanyInfo } = require('../services/companyService');
const moment = require('moment');
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
    
    // Respuesta de saludo personalizada según la campaña
    const greeting = `Buen día, gracias por contactarnos! 👋
Para tener una mejor comunicación me brinda su nombre y área de trabajo`;

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
    
    // Buscar información de la empresa si se menciona un RUC
    let companyInfo = null;
    const ruc = this.extractRUC(message);
    if (ruc) {
      companyInfo = await searchCompanyInfo(ruc);
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
    // Guardar respuesta a la pregunta actual
    const currentQuestion = this.qualificationQuestions[prospectState.qualificationStep - 1];
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
   * Maneja la recolección de correos electrónicos
   * @param {Object} prospectState - Estado del prospecto
   * @param {string} message - Mensaje recibido
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleEmailCollection(prospectState, message) {
    // Extraer correos electrónicos
    const emails = this.extractEmails(message);
    
    if (emails.length > 0) {
      // Crear evento en el calendario
      try {
        const appointmentDetails = await this.createAppointment(prospectState, emails);
        
        const response = `¡Listo! He programado la reunión para ${appointmentDetails.date} a las ${appointmentDetails.time}.

🚀 ¡Únete a nuestra sesión de Logifit! ✨ Logifit es una moderna herramienta tecnológica inteligente adecuada para la gestión del descanso y salud de los colaboradores. Brindamos servicios de monitoreo preventivo como apoyo a la mejora de la salud y prevención de accidentes, con la finalidad de salvaguardar la vida de los trabajadores y ayudarles a alcanzar el máximo de su productividad en el proyecto.
✨🌟🌞 ¡Tu bienestar es nuestra prioridad! ⚒️👍

Te he enviado una invitación por correo electrónico con los detalles y el enlace para la llamada.

Por favor, confirma que has recibido la invitación respondiendo "Confirmado" o "Recibido".`;
        
        // Actualizar estado pero mantener en FOLLOW_UP en lugar de COMPLETED
        const newState = {
          ...prospectState,
          conversationState: this.states.FOLLOW_UP,
          emails,
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
   * Crea una cita en el calendario
   * @param {Object} prospectState - Estado del prospecto
   * @param {Array<string>} emails - Correos electrónicos
   * @returns {Promise<Object>} - Detalles de la cita
   */
  async createAppointment(prospectState, emails) {
    try {
      // Obtener la hora seleccionada
      const selectedTime = prospectState.selectedTime;
      
      // Parsear la hora seleccionada
      const { date, time, dateTime } = this.parseSelectedTime(selectedTime, prospectState.timezone);
      
      // Crear evento en Google Calendar
      const eventDetails = {
        summary: 'Demostración de Logifit - Sistema de Control de Fatiga',
        description: `Reunión con ${prospectState.name} para demostración del sistema de control de fatiga y somnolencia de Logifit.`,
        startDateTime: dateTime,
        duration: 30, // Duración en minutos
        attendees: emails.map(email => ({ email })),
        timeZone: prospectState.timezone || 'America/Lima' // Usar la zona horaria del cliente
      };
      
      await createCalendarEvent(eventDetails);
      
      return {
        date,
        time,
        dateTime
      };
    } catch (error) {
      logger.error('Error al crear cita:', error);
      throw error;
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
    
    // Redondear a la siguiente hora completa
    const nextHour = now.clone().add(1, 'hour').startOf('hour');
    
    // Si es después de las 17:00, sugerir para el día siguiente a las 10:00
    if (nextHour.hour() >= 17) {
      return nextHour.clone().add(1, 'day').hour(10).format('YYYY-MM-DD HH:mm');
    }
    
    // Si es antes de las 9:00, sugerir para las 10:00 del mismo día
    if (nextHour.hour() < 9) {
      return nextHour.clone().hour(10).format('YYYY-MM-DD HH:mm');
    }
    
    // En horario laboral, sugerir la siguiente hora disponible
    return nextHour.format('YYYY-MM-DD HH:mm');
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