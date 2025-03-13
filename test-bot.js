require('dotenv').config();
const { generateOpenAIResponse } = require('./src/services/openaiService');
const { checkCalendarAvailability, createCalendarEvent, hasValidCredentials } = require('./src/services/calendarService');
const moment = require('moment');

// Simular un estado de prospecto
const mockProspect = {
  phoneNumber: '1234567890',
  name: 'Juan Pérez',
  conversationState: 'appointment_scheduling',
  qualificationStep: 4,
  qualificationAnswers: {
    '¿Cuál es tu nombre completo?': 'Juan Pérez',
    '¿En qué ciudad te encuentras?': 'Ciudad de México',
    '¿Qué te interesó de nuestra publicidad?': 'Vi que tienen buenos productos y quería saber más',
    '¿Has considerado adquirir nuestros productos/servicios anteriormente?': 'No, es la primera vez'
  },
  lastInteraction: new Date()
};

// Función para probar OpenAI
async function testOpenAI() {
  console.log('=== PRUEBA DE OPENAI ===\n');
  
  // Probar respuesta general
  console.log('1. Generando respuesta a una consulta general...\n');
  const response = await generateOpenAIResponse({
    role: 'user',
    content: 'Hola, me gustaría saber más sobre sus productos'
  });
  console.log('Respuesta:', response);
  
  // Probar análisis de interés
  console.log('\n2. Analizando interés del prospecto...\n');
  const answersText = Object.entries(mockProspect.qualificationAnswers)
    .map(([question, answer]) => `${question}: ${answer}`)
    .join('\n');
  
  const analysis = await generateOpenAIResponse({
    role: 'system',
    content: `Analiza las siguientes respuestas de un prospecto para determinar su nivel de interés en nuestros productos/servicios.
    
    Respuestas del prospecto:
    ${answersText}
    
    Proporciona un análisis en formato JSON con los siguientes campos:
    - highInterest: booleano que indica si el prospecto muestra un alto nivel de interés
    - interestScore: puntuación de 1 a 10 del nivel de interés
    - shouldOfferAppointment: booleano que indica si deberíamos ofrecer programar una cita
    - reasoning: breve explicación de tu análisis
    
    IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin ningún texto adicional, comillas de código o formato markdown.`
  });
  
  console.log('Análisis:', analysis);
  
  // Intentar parsear el análisis como JSON
  try {
    const parsedAnalysis = JSON.parse(analysis);
    console.log('\nAnálisis parseado:');
    console.log('- Alto interés:', parsedAnalysis.highInterest ? 'Sí' : 'No');
    console.log('- Puntuación:', parsedAnalysis.interestScore + '/10');
    console.log('- Ofrecer cita:', parsedAnalysis.shouldOfferAppointment ? 'Sí' : 'No');
    console.log('- Razonamiento:', parsedAnalysis.reasoning);
  } catch (error) {
    console.error('Error al parsear análisis:', error.message);
  }
  
  return true;
}

// Función para probar Google Calendar
async function testCalendar() {
  console.log('\n=== PRUEBA DE GOOGLE CALENDAR ===\n');
  
  // Verificar si tenemos credenciales válidas
  console.log('Estado de credenciales de Google Calendar:', hasValidCredentials ? 'Válidas' : 'No válidas (usando modo simulado)');
  
  // Probar disponibilidad
  console.log('\n1. Verificando disponibilidad...\n');
  const availableSlots = await checkCalendarAvailability();
  
  console.log(`Se encontraron ${availableSlots.length} slots disponibles:`);
  availableSlots.forEach((slot, index) => {
    console.log(`${index + 1}. ${slot.date} a las ${slot.time}`);
  });
  
  // Probar creación de evento
  console.log('\n2. Creando evento de prueba...\n');
  
  try {
    // Usar '1' como selección por defecto (el servicio manejará el caso de no tener slots)
    const appointmentDetails = await createCalendarEvent(mockProspect, '1');
    
    console.log('Detalles de la cita:');
    console.log('- Fecha:', appointmentDetails.date);
    console.log('- Hora:', appointmentDetails.time);
    console.log('- ID del evento:', appointmentDetails.calendarEventId);
    console.log('- Link de Meet:', appointmentDetails.meetLink);
  } catch (error) {
    console.error('Error al crear evento de prueba:', error.message);
  }
  
  return true;
}

// Función para probar el flujo completo
async function testFullFlow() {
  console.log('\n=== PRUEBA DE FLUJO COMPLETO ===\n');
  
  // Simular saludo inicial
  console.log('1. Saludo inicial\n');
  const greeting = `¡Hola! 👋 Soy ${process.env.BOT_NAME}, el asistente virtual de nuestra empresa. 

Gracias por contactarnos a través de nuestra campaña. Estoy aquí para ayudarte a resolver cualquier duda sobre nuestros productos/servicios.

¿Podrías decirme tu nombre para poder atenderte mejor?`;
  
  console.log(greeting);
  
  // Simular respuesta del usuario
  const userName = 'Juan Pérez';
  console.log(`\nUsuario: ${userName}`);
  
  // Simular inicio de calificación
  console.log('\n2. Inicio de calificación\n');
  const qualificationStart = `Mucho gusto, ${userName}! 😊 

Para poder ayudarte mejor, me gustaría hacerte algunas preguntas rápidas.

¿En qué ciudad te encuentras?`;
  
  console.log(qualificationStart);
  
  // Simular respuestas a preguntas de calificación
  const userCity = 'Ciudad de México';
  console.log(`\nUsuario: ${userCity}`);
  
  // Simular siguiente pregunta
  console.log('\n3. Continuación de calificación\n');
  console.log('¿Qué te interesó de nuestra publicidad?');
  
  const userInterest = 'Vi que tienen buenos productos y quería saber más';
  console.log(`\nUsuario: ${userInterest}`);
  
  // Simular última pregunta
  console.log('\n4. Finalización de calificación\n');
  console.log('¿Has considerado adquirir nuestros productos/servicios anteriormente?');
  
  const userPreviousConsideration = 'No, es la primera vez';
  console.log(`\nUsuario: ${userPreviousConsideration}`);
  
  // Simular análisis de interés
  console.log('\n5. Análisis de interés\n');
  const interestAnalysis = await generateOpenAIResponse({
    role: 'system',
    content: `Analiza las siguientes respuestas de un prospecto para determinar su nivel de interés en nuestros productos/servicios.
    
    Respuestas del prospecto:
    ¿Cuál es tu nombre completo?: ${userName}
    ¿En qué ciudad te encuentras?: ${userCity}
    ¿Qué te interesó de nuestra publicidad?: ${userInterest}
    ¿Has considerado adquirir nuestros productos/servicios anteriormente?: ${userPreviousConsideration}
    
    Proporciona un análisis en formato JSON con los siguientes campos:
    - highInterest: booleano que indica si el prospecto muestra un alto nivel de interés
    - interestScore: puntuación de 1 a 10 del nivel de interés
    - shouldOfferAppointment: booleano que indica si deberíamos ofrecer programar una cita
    - reasoning: breve explicación de tu análisis
    
    IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin ningún texto adicional, comillas de código o formato markdown.`
  });
  
  let parsedAnalysis;
  try {
    parsedAnalysis = JSON.parse(interestAnalysis);
    console.log('Análisis de interés:');
    console.log('- Alto interés:', parsedAnalysis.highInterest ? 'Sí' : 'No');
    console.log('- Puntuación:', parsedAnalysis.interestScore + '/10');
    console.log('- Ofrecer cita:', parsedAnalysis.shouldOfferAppointment ? 'Sí' : 'No');
    console.log('- Razonamiento:', parsedAnalysis.reasoning);
  } catch (error) {
    console.error('Error al parsear análisis:', error.message);
    parsedAnalysis = { shouldOfferAppointment: true }; // Valor por defecto para continuar la prueba
  }
  
  // Simular oferta de cita si corresponde
  if (parsedAnalysis.shouldOfferAppointment) {
    console.log('\n6. Oferta de cita\n');
    
    const appointmentOffer = `Gracias por tus respuestas, ${userName}. 

Basado en lo que me has contado, creo que nuestros productos/servicios podrían ser una excelente opción para ti.

¿Te gustaría programar una llamada con uno de nuestros asesores para obtener más información personalizada?`;
    
    console.log(appointmentOffer);
    
    // Simular respuesta afirmativa
    const userAppointmentResponse = 'Sí, me gustaría programar una llamada';
    console.log(`\nUsuario: ${userAppointmentResponse}`);
    
    // Simular verificación de disponibilidad
    console.log('\n7. Verificación de disponibilidad\n');
    
    const availableSlots = await checkCalendarAvailability();
    const formattedSlots = availableSlots.map((slot, index) => 
      `${index + 1}. ${slot.date} a las ${slot.time}`
    ).join('\n');
    
    const availabilityResponse = `Excelente, ${userName}! 😊

Tenemos los siguientes horarios disponibles para una llamada con nuestro asesor:

${formattedSlots}

Por favor, responde con el número de la opción que prefieras.`;
    
    console.log(availabilityResponse);
    
    // Simular selección de horario
    const userSlotSelection = '1';
    console.log(`\nUsuario: ${userSlotSelection}`);
    
    // Simular creación de cita
    console.log('\n8. Creación de cita\n');
    
    const appointmentDetails = await createCalendarEvent(mockProspect, userSlotSelection);
    
    const appointmentConfirmation = `¡Perfecto! He programado tu cita para el ${appointmentDetails.date} a las ${appointmentDetails.time}.

Te hemos enviado una invitación por correo electrónico con los detalles y el enlace para la llamada.

¿Hay algo más en lo que pueda ayudarte?`;
    
    console.log(appointmentConfirmation);
    
    // Simular respuesta final
    const userFinalResponse = 'No, gracias por tu ayuda';
    console.log(`\nUsuario: ${userFinalResponse}`);
    
    // Simular cierre
    console.log('\n9. Cierre\n');
    
    const closing = `¡Perfecto, ${userName}! Ha sido un placer atenderte.

Te esperamos en nuestra cita programada. Si necesitas algo más antes de esa fecha, no dudes en escribirnos.

¡Que tengas un excelente día! 👋`;
    
    console.log(closing);
  } else {
    // Simular consulta general
    console.log('\n6. Consulta general\n');
    
    const generalInquiry = `Gracias por tus respuestas, ${userName}.

¿Hay algo específico sobre nuestros productos/servicios que te gustaría conocer?`;
    
    console.log(generalInquiry);
    
    // Simular pregunta específica
    const userQuestion = '¿Qué garantía ofrecen en sus productos?';
    console.log(`\nUsuario: ${userQuestion}`);
    
    // Simular respuesta a consulta
    console.log('\n7. Respuesta a consulta\n');
    
    const inquiryResponse = await generateOpenAIResponse({
      role: 'user',
      content: userQuestion
    });
    
    console.log(inquiryResponse);
  }
  
  return true;
}

// Ejecutar pruebas
async function runTests() {
  console.log('=== PRUEBAS DEL BOT DE WHATSAPP ===\n');
  
  try {
    // Probar OpenAI
    await testOpenAI();
    
    // Probar Google Calendar
    await testCalendar();
    
    // Probar flujo completo
    await testFullFlow();
    
    console.log('\n=== TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE ===');
  } catch (error) {
    console.error('Error durante las pruebas:', error);
  }
}

// Ejecutar pruebas
runTests(); 