const { logger } = require('../utils/logger');
const { getProspectState, updateProspectState } = require('../models/prospectModel');
const { generateOpenAIResponse } = require('../services/openaiService');
const { checkCalendarAvailability, createCalendarEvent } = require('../services/calendarService');
const { extractTextFromMessage, delay } = require('../utils/helpers');
const { CONVERSATION_STATES, QUALIFICATION_QUESTIONS, OPERATOR_TAKEOVER_COMMAND } = require('../utils/constants');
const { saveProspectToSheets } = require('../services/sheetsService');
const marketingService = require('../services/marketingService');
const { handleClosingFlow, handleForcedClosing } = require('../flows/closingFlow');

// Comando para devolver el control al bot
const BOT_RESUME_COMMAND = '!bot';

/**
 * Maneja los mensajes entrantes y dirige la conversación según el estado
 */
async function handleIncomingMessage(sock, message) {
  try {
    const text = extractTextFromMessage(message);
    if (!text) return; // Ignorar mensajes sin texto
    
    const remoteJid = message.key.remoteJid;
    const senderNumber = remoteJid.split('@')[0];
    
    logger.info(`Mensaje recibido de ${senderNumber}: ${text}`);
    
    // Obtener o crear el estado del prospecto
    const prospectState = await getProspectState(senderNumber);
    
    // Verificar si es un comando de toma de control por operador
    if (text.trim().toLowerCase() === OPERATOR_TAKEOVER_COMMAND) {
      logger.info(`Comando de toma de control detectado para ${senderNumber}`);
      
      // Manejar la toma de control
      const response = await handleOperatorTakeover(prospectState);
      await sendMessage(sock, remoteJid, response);
      return;
    }
    
    // Verificar si es un comando para devolver el control al bot
    if (text.trim().toLowerCase() === BOT_RESUME_COMMAND && 
        prospectState.conversationState === CONVERSATION_STATES.OPERATOR_TAKEOVER) {
      logger.info(`Comando para devolver control al bot detectado para ${senderNumber}`);
      
      // Manejar la devolución del control
      const response = await handleBotResume(prospectState);
      await sendMessage(sock, remoteJid, response);
      return;
    }
    
    // Si es el primer mensaje, detectar la fuente de marketing y campaña
    if (prospectState.conversationState === CONVERSATION_STATES.INITIAL) {
      const marketingInfo = marketingService.detectMarketingSource(text);
      
      // Actualizar el estado del prospecto con la información de marketing
      await updateProspectState(senderNumber, {
        source: marketingInfo.source,
        campaignName: marketingInfo.campaignName,
        lastInteraction: new Date()
      });
      
      logger.info(`Fuente de marketing detectada para ${senderNumber}: ${marketingInfo.source} - ${marketingInfo.campaignName}`);
    }
    
    // Si el operador ya tomó el control, no procesar el mensaje
    if (prospectState.conversationState === CONVERSATION_STATES.OPERATOR_TAKEOVER) {
      logger.info(`Mensaje no procesado para ${senderNumber} - Operador tiene el control`);
      return;
    }
    
    // Determinar la siguiente acción basada en el estado actual
    let response;
    
    switch (prospectState.conversationState) {
      case CONVERSATION_STATES.INITIAL:
        response = await handleInitialGreeting(sock, remoteJid, prospectState);
        break;
        
      case CONVERSATION_STATES.GREETING:
        response = await handleQualificationStart(sock, remoteJid, prospectState, text);
        break;
        
      case CONVERSATION_STATES.QUALIFICATION:
        response = await handleQualificationProcess(sock, remoteJid, prospectState, text);
        break;
        
      case CONVERSATION_STATES.INTEREST_VALIDATION:
        response = await handleInterestValidation(sock, remoteJid, prospectState, text);
        break;
        
      case CONVERSATION_STATES.APPOINTMENT_SCHEDULING:
        response = await handleAppointmentScheduling(sock, remoteJid, prospectState, text);
        break;
        
      case CONVERSATION_STATES.CLOSING:
        // Usar el flujo de cierre modular
        const closingResult = await handleClosingFlow(prospectState, text);
        response = closingResult.message;
        break;
        
      case CONVERSATION_STATES.GENERAL_INQUIRY:
        response = await handleGeneralInquiry(sock, remoteJid, prospectState, text);
        break;
        
      case CONVERSATION_STATES.CLOSED:
        // Si la conversación ya estaba cerrada, reiniciarla
        await updateProspectState(senderNumber, {
          conversationState: CONVERSATION_STATES.INITIAL,
          lastInteraction: new Date()
        });
        response = await handleInitialGreeting(sock, remoteJid, prospectState);
        break;
        
      default:
        // Si no hay un estado válido, iniciar desde el saludo
        response = await handleInitialGreeting(sock, remoteJid, prospectState);
    }
    
    // Enviar respuesta al usuario
    if (response) {
      await sendMessage(sock, remoteJid, response);
    }
    
  } catch (error) {
    logger.error('Error al procesar mensaje:', error);
    // Intentar enviar un mensaje de error genérico
    try {
      await sendMessage(
        sock, 
        message.key.remoteJid, 
        'Lo siento, estamos experimentando problemas técnicos. Por favor, intenta más tarde.'
      );
    } catch (e) {
      logger.error('Error al enviar mensaje de error:', e);
    }
  }
}

/**
 * Maneja la toma de control por parte de un operador
 */
async function handleOperatorTakeover(prospectState) {
  try {
    // Actualizar el estado a OPERATOR_TAKEOVER
    await updateProspectState(prospectState.phoneNumber, {
      conversationState: CONVERSATION_STATES.OPERATOR_TAKEOVER,
      lastInteraction: new Date(),
      operatorTakeover: {
        timestamp: new Date(),
        previousState: prospectState.conversationState
      }
    });
    
    logger.info(`Operador tomó el control de la conversación con ${prospectState.phoneNumber}`);
    
    // Mensaje invisible para el operador (no se envía al cliente)
    return "✅ *Control tomado por operador humano*\n\nAhora puedes continuar la conversación directamente. El bot no responderá hasta que escribas '!bot' para devolverle el control.";
  } catch (error) {
    logger.error('Error al tomar control de la conversación:', error);
    return "❌ *Error al tomar el control*\n\nHubo un problema al intentar tomar el control de la conversación. Por favor, intenta nuevamente.";
  }
}

/**
 * Maneja la devolución del control al bot
 */
async function handleBotResume(prospectState) {
  try {
    // Recuperar el estado anterior o establecer uno por defecto
    const previousState = prospectState.operatorTakeover?.previousState || CONVERSATION_STATES.GREETING;
    
    // Actualizar el estado al anterior
    await updateProspectState(prospectState.phoneNumber, {
      conversationState: previousState,
      lastInteraction: new Date(),
      operatorTakeover: null
    });
    
    logger.info(`Control devuelto al bot para la conversación con ${prospectState.phoneNumber}`);
    
    // Mensaje invisible para el operador (no se envía al cliente)
    return "✅ *Control devuelto al bot*\n\nEl bot ahora continuará la conversación desde donde se quedó.";
  } catch (error) {
    logger.error('Error al devolver control al bot:', error);
    return "❌ *Error al devolver el control*\n\nHubo un problema al intentar devolver el control al bot. Por favor, intenta nuevamente.";
  }
}

/**
 * Maneja el saludo inicial
 */
async function handleInitialGreeting(sock, remoteJid, prospectState) {
  // Actualizar el estado a GREETING
  await updateProspectState(prospectState.phoneNumber, {
    conversationState: CONVERSATION_STATES.GREETING,
    lastInteraction: new Date()
  });
  
  // Personalizar el mensaje según la fuente de marketing
  let campaignMessage = '';
  if (prospectState.source && prospectState.source !== 'WhatsApp') {
    campaignMessage = `Gracias por contactarnos a través de nuestra campaña en ${prospectState.source}.`;
  } else {
    campaignMessage = 'Gracias por contactarnos.';
  }
  
  return `¡Hola! 👋 Soy ${process.env.BOT_NAME || 'el asistente virtual'} de Logifit. 

${campaignMessage} Estoy aquí para ayudarte a resolver cualquier duda sobre nuestras soluciones de monitoreo de fatiga y somnolencia para conductores.

¿Podrías decirme tu nombre para poder atenderte mejor?`;
}

/**
 * Inicia el proceso de calificación
 */
async function handleQualificationStart(sock, remoteJid, prospectState, text) {
  // Guardar el nombre del prospecto
  await updateProspectState(prospectState.phoneNumber, {
    name: text,
    conversationState: CONVERSATION_STATES.QUALIFICATION,
    qualificationStep: 0,
    qualificationAnswers: {},
    lastInteraction: new Date()
  });
  
  return `Mucho gusto, ${text}! 😊 

Para poder ayudarte mejor, me gustaría hacerte algunas preguntas rápidas.

${QUALIFICATION_QUESTIONS[0]}`;
}

/**
 * Procesa las respuestas de calificación
 */
async function handleQualificationProcess(sock, remoteJid, prospectState, text) {
  const currentStep = prospectState.qualificationStep;
  const answers = prospectState.qualificationAnswers || {};
  
  // Guardar la respuesta actual
  answers[QUALIFICATION_QUESTIONS[currentStep]] = text;
  
  // Verificar si hemos terminado con las preguntas
  if (currentStep >= QUALIFICATION_QUESTIONS.length - 1) {
    // Pasar al siguiente estado
    await updateProspectState(prospectState.phoneNumber, {
      qualificationAnswers: answers,
      conversationState: CONVERSATION_STATES.INTEREST_VALIDATION,
      lastInteraction: new Date()
    });
    
    // Analizar las respuestas con OpenAI para determinar el nivel de interés
    const interestAnalysis = await analyzeProspectInterest(prospectState.phoneNumber, answers);
    
    if (interestAnalysis.highInterest) {
      // Notificar al vendedor sobre un prospecto de alta calidad
      notifyHighQualityProspect(prospectState.phoneNumber, prospectState.name, answers);
      
      return `Gracias por tus respuestas, ${prospectState.name}. 

Basado en lo que me has contado, creo que nuestros productos/servicios podrían ser una excelente opción para ti.

¿Te gustaría programar una llamada con uno de nuestros asesores para obtener más información personalizada?`;
    } else {
      return `Gracias por tus respuestas, ${prospectState.name}.

¿Hay algo específico sobre nuestros productos/servicios que te gustaría conocer?`;
    }
  } else {
    // Pasar a la siguiente pregunta
    await updateProspectState(prospectState.phoneNumber, {
      qualificationAnswers: answers,
      qualificationStep: currentStep + 1,
      lastInteraction: new Date()
    });
    
    return QUALIFICATION_QUESTIONS[currentStep + 1];
  }
}

/**
 * Valida el interés del prospecto usando OpenAI
 */
async function handleInterestValidation(sock, remoteJid, prospectState, text) {
  // Analizar la respuesta con OpenAI
  const analysis = await generateOpenAIResponse({
    role: 'system',
    content: `Analiza la siguiente respuesta de un prospecto a la pregunta sobre si quiere programar una llamada o conocer más información. 
    Determina si está interesado en programar una cita (respuesta afirmativa) o si solo quiere más información general.
    Respuesta del prospecto: "${text}"
    Responde únicamente con "CITA" si quiere programar una cita o "INFO" si solo quiere información.`
  });
  
  if (analysis.includes('CITA')) {
    // Actualizar estado para programar cita
    await updateProspectState(prospectState.phoneNumber, {
      conversationState: CONVERSATION_STATES.APPOINTMENT_SCHEDULING,
      lastInteraction: new Date()
    });
    
    // Obtener disponibilidad del calendario
    const availableSlots = await checkCalendarAvailability();
    
    if (availableSlots && availableSlots.length > 0) {
      const formattedSlots = availableSlots.map((slot, index) => 
        `${index + 1}. ${slot.date} a las ${slot.time}`
      ).join('\n');
      
      return `Excelente, ${prospectState.name}! 😊

Tenemos los siguientes horarios disponibles para una llamada con nuestro asesor:

${formattedSlots}

Por favor, responde con el número de la opción que prefieras.`;
    } else {
      return `Me encantaría programar una llamada contigo, ${prospectState.name}, pero parece que tenemos problemas para acceder a la agenda en este momento.

¿Podrías indicarme qué días y horarios te vendrían mejor? Así podré verificar la disponibilidad manualmente.`;
    }
  } else {
    // Actualizar estado para consultas generales
    await updateProspectState(prospectState.phoneNumber, {
      conversationState: CONVERSATION_STATES.GENERAL_INQUIRY,
      lastInteraction: new Date()
    });
    
    return `Entiendo, ${prospectState.name}. Estoy aquí para responder cualquier pregunta que tengas sobre nuestros productos/servicios.

¿Qué te gustaría saber específicamente?`;
  }
}

/**
 * Maneja la programación de citas
 */
async function handleAppointmentScheduling(sock, remoteJid, prospectState, text) {
  // Intentar programar la cita
  try {
    // Aquí iría la lógica para interpretar la selección del usuario y crear el evento
    const appointmentDetails = await createCalendarEvent(prospectState, text);
    
    // Actualizar estado a cierre
    await updateProspectState(prospectState.phoneNumber, {
      conversationState: CONVERSATION_STATES.CLOSING,
      appointmentDetails,
      lastInteraction: new Date()
    });
    
    return `¡Perfecto! He programado tu cita para el ${appointmentDetails.date} a las ${appointmentDetails.time}.

Te hemos enviado una invitación por correo electrónico con los detalles y el enlace para la llamada.

¿Hay algo más en lo que pueda ayudarte?`;
  } catch (error) {
    logger.error('Error al programar cita:', error);
    
    return `Lo siento, ${prospectState.name}, parece que hubo un problema al programar la cita.

¿Podrías proporcionarme otra fecha y hora que te convenga? Intentaré programarla nuevamente.`;
  }
}

/**
 * Maneja consultas generales usando OpenAI
 */
async function handleGeneralInquiry(sock, remoteJid, prospectState, text) {
  // Usar OpenAI para generar una respuesta basada en la base de conocimiento
  const response = await generateOpenAIResponse({
    role: 'system',
    content: `Eres un asistente virtual de ventas para una empresa. Responde a la siguiente consulta del cliente de manera amable, profesional y concisa.
    Utiliza la información de la base de conocimiento para proporcionar detalles precisos.
    Si no conoces la respuesta, ofrece poner al cliente en contacto con un asesor humano.
    
    Nombre del cliente: ${prospectState.name}
    Consulta: "${text}"`
  });
  
  // Analizar si el prospecto muestra alto interés después de la consulta
  const interestAnalysis = await analyzeProspectInterest(prospectState.phoneNumber, {
    ...prospectState.qualificationAnswers,
    'Consulta adicional': text
  });
  
  if (interestAnalysis.highInterest && !prospectState.highInterestNotified) {
    // Notificar al vendedor sobre un prospecto de alta calidad
    notifyHighQualityProspect(prospectState.phoneNumber, prospectState.name, {
      ...prospectState.qualificationAnswers,
      'Consulta adicional': text
    });
    
    // Marcar que ya se ha notificado
    await updateProspectState(prospectState.phoneNumber, {
      highInterestNotified: true,
      lastInteraction: new Date()
    });
  }
  
  // Verificar si debemos ofrecer programar una cita
  if (interestAnalysis.shouldOfferAppointment) {
    await updateProspectState(prospectState.phoneNumber, {
      lastInteraction: new Date()
    });
    
    return `${response}

Por cierto, ${prospectState.name}, basado en tu interés, creo que sería muy beneficioso para ti tener una conversación directa con uno de nuestros asesores.

¿Te gustaría que programemos una llamada para resolver todas tus dudas de manera más personalizada?`;
  }
  
  await updateProspectState(prospectState.phoneNumber, {
    lastInteraction: new Date()
  });
  
  return response;
}

/**
 * Analiza el nivel de interés del prospecto usando OpenAI
 */
async function analyzeProspectInterest(phoneNumber, answers) {
  try {
    // Convertir las respuestas a formato de texto
    const answersText = Object.entries(answers)
      .map(([question, answer]) => `${question}: ${answer}`)
      .join('\n');
    
    // Consultar a OpenAI para analizar el interés
    const analysis = await generateOpenAIResponse({
      role: 'system',
      content: `Analiza las siguientes respuestas de un prospecto para determinar su nivel de interés en nuestros productos/servicios.
      
      Respuestas del prospecto:
      ${answersText}
      
      Proporciona un análisis en formato JSON con los siguientes campos:
      - highInterest: booleano que indica si el prospecto muestra un alto nivel de interés
      - interestScore: puntuación de 1 a 10 del nivel de interés
      - shouldOfferAppointment: booleano que indica si deberíamos ofrecer programar una cita
      - reasoning: breve explicación de tu análisis`
    });
    
    // Intentar parsear la respuesta como JSON
    try {
      return JSON.parse(analysis);
    } catch (e) {
      logger.error('Error al parsear análisis de interés:', e);
      // Valor por defecto si no se puede parsear
      return {
        highInterest: false,
        interestScore: 5,
        shouldOfferAppointment: false,
        reasoning: 'No se pudo analizar correctamente'
      };
    }
  } catch (error) {
    logger.error('Error al analizar interés del prospecto:', error);
    return {
      highInterest: false,
      interestScore: 5,
      shouldOfferAppointment: false,
      reasoning: 'Error en el análisis'
    };
  }
}

/**
 * Notifica al vendedor sobre un prospecto de alta calidad
 */
function notifyHighQualityProspect(phoneNumber, name, answers) {
  // Aquí iría la lógica para notificar al vendedor (por ejemplo, enviar un email o SMS)
  logger.info(`¡ALERTA DE PROSPECTO DE ALTA CALIDAD! Teléfono: ${phoneNumber}, Nombre: ${name}`);
  
  // Convertir las respuestas a formato de texto para el log
  const answersText = Object.entries(answers)
    .map(([question, answer]) => `${question}: ${answer}`)
    .join('\n');
  
  logger.info(`Respuestas del prospecto:\n${answersText}`);
}

/**
 * Envía un mensaje a través de WhatsApp
 */
async function sendMessage(sock, remoteJid, text) {
  try {
    // Simular escritura para hacer más natural la conversación
    await sock.sendPresenceUpdate('composing', remoteJid);
    
    // Calcular tiempo de espera basado en la longitud del mensaje
    const waitTime = Math.min(Math.max(text.length * 30, 1000), 3000);
    await delay(waitTime);
    
    // Enviar el mensaje
    await sock.sendMessage(remoteJid, { text });
    
    // Marcar como leído después de enviar
    await sock.readMessages([{ remoteJid, id: 'status@broadcast' }]);
    
    logger.info(`Mensaje enviado a ${remoteJid.split('@')[0]}: ${text.substring(0, 50)}...`);
    
    return true;
  } catch (error) {
    logger.error(`Error al enviar mensaje a ${remoteJid}:`, error);
    throw error;
  }
}

module.exports = {
  handleIncomingMessage,
  CONVERSATION_STATES,
  OPERATOR_TAKEOVER_COMMAND,
  BOT_RESUME_COMMAND
}; 