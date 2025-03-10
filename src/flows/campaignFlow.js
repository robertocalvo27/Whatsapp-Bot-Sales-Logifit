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
      const suggestedTime = this.suggestNearestTime();
      
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
      const suggestedTime = this.suggestNearestTime();
      
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

¿Hay algo más en lo que pueda ayudarte?`;
        
        // Actualizar estado
        const newState = {
          ...prospectState,
          conversationState: this.states.COMPLETED,
          emails,
          appointmentDetails,
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
   * @param {Array<string>} emails - Correos electrónicos para la invitación
   * @returns {Promise<Object>} - Detalles de la cita
   */
  async createAppointment(prospectState, emails) {
    // Convertir el tiempo seleccionado a un formato que entienda el servicio de calendario
    const selectedDateTime = this.parseSelectedTime(prospectState.selectedTime);
    
    // Crear evento personalizado
    const customEvent = {
      summary: `LOGIFIT - Demo de Control de Fatiga y Somnolencia con ${prospectState.name}`,
      description: `🚀 ¡Únete a nuestra sesión de Logifit! ✨ Logifit es una moderna herramienta tecnológica inteligente adecuada para la gestión del descanso y salud de los colaboradores. Brindamos servicios de monitoreo preventivo como apoyo a la mejora de la salud y prevención de accidentes, con la finalidad de salvaguardar la vida de los trabajadores y ayudarles a alcanzar el máximo de su productividad en el proyecto.
      ✨🌟🌞 ¡Tu bienestar es nuestra prioridad! ⚒️👍`,
      attendees: emails.map(email => ({ email })),
      startTime: selectedDateTime,
      duration: 30 // duración en minutos
    };
    
    // Llamar al servicio de calendario
    return createCalendarEvent(prospectState, customEvent);
  }

  /**
   * Identifica la campaña por palabras clave
   * @param {string} message - Mensaje recibido
   * @returns {string} - Tipo de campaña
   */
  identifyCampaign(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('facebook') || lowerMessage.includes('fb')) {
      return 'facebook';
    } else if (lowerMessage.includes('google') || lowerMessage.includes('ads')) {
      return 'google_ads';
    } else if (lowerMessage.includes('web') || lowerMessage.includes('sitio')) {
      return 'website';
    } else {
      return 'unknown';
    }
  }

  /**
   * Extrae el nombre del mensaje
   * @param {string} message - Mensaje recibido
   * @returns {string} - Nombre extraído
   */
  extractName(message) {
    // Implementación simple, se puede mejorar con NLP
    const words = message.split(' ');
    if (words.length >= 2) {
      return words.slice(0, 2).join(' ');
    }
    return message;
  }

  /**
   * Extrae el RUC del mensaje
   * @param {string} message - Mensaje recibido
   * @returns {string|null} - RUC extraído o null
   */
  extractRUC(message) {
    // Buscar patrón de RUC peruano (11 dígitos)
    const rucMatch = message.match(/\b\d{11}\b/);
    return rucMatch ? rucMatch[0] : null;
  }

  /**
   * Extrae correos electrónicos del mensaje
   * @param {string} message - Mensaje recibido
   * @returns {Array<string>} - Correos electrónicos extraídos
   */
  extractEmails(message) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return message.match(emailRegex) || [];
  }

  /**
   * Determina si una respuesta es positiva
   * @param {string} message - Mensaje recibido
   * @returns {boolean} - True si es positiva
   */
  isPositiveResponse(message) {
    const positivePatterns = [
      'si', 'sí', 'claro', 'ok', 'okay', 'vale', 'bueno', 'perfecto', 
      'genial', 'excelente', 'me parece', 'está bien', 'de acuerdo'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    return positivePatterns.some(pattern => lowerMessage.includes(pattern));
  }

  /**
   * Sugiere el tiempo más cercano en múltiplos de 30 minutos
   * @returns {string} - Tiempo sugerido (formato HH:MM)
   */
  suggestNearestTime() {
    const now = moment();
    const minutes = now.minutes();
    
    // Redondear a la próxima media hora
    if (minutes < 30) {
      now.minutes(30);
    } else {
      now.add(1, 'hour').minutes(0);
    }
    
    return now.format('HH:mm');
  }

  /**
   * Extrae tiempo de un mensaje
   * @param {string} message - Mensaje recibido
   * @returns {string|null} - Tiempo extraído o null
   */
  extractTimeFromMessage(message) {
    // Buscar patrones de tiempo (HH:MM o H:MM)
    const timeMatch = message.match(/\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/);
    
    if (timeMatch) {
      return timeMatch[0];
    }
    
    // Buscar menciones de horas
    const hourMatch = message.match(/\b([0-1]?[0-9]|2[0-3])(?:\s*(?:hrs|horas|h|:00))\b/);
    
    if (hourMatch) {
      const hour = parseInt(hourMatch[1]);
      return `${hour}:00`;
    }
    
    return null;
  }

  /**
   * Parsea el tiempo seleccionado a un formato que entienda el servicio de calendario
   * @param {string} selectedTime - Tiempo seleccionado (formato HH:MM)
   * @returns {string} - Fecha y hora en formato ISO
   */
  parseSelectedTime(selectedTime) {
    if (!selectedTime) {
      // Si no hay tiempo seleccionado, usar el tiempo actual + 1 hora
      return moment().add(1, 'hour').startOf('hour').toISOString();
    }
    
    // Parsear el tiempo seleccionado
    const [hours, minutes] = selectedTime.split(':').map(Number);
    
    // Crear fecha para hoy con el tiempo seleccionado
    const dateTime = moment().hours(hours).minutes(minutes).seconds(0);
    
    // Si el tiempo ya pasó, programar para mañana
    if (dateTime.isBefore(moment())) {
      dateTime.add(1, 'day');
    }
    
    return dateTime.toISOString();
  }
}

module.exports = new CampaignFlow(); 