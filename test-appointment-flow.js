const campaignFlow = require('./src/flows/campaignFlow');
const { withHumanDelay } = require('./src/utils/humanDelay');
const logger = require('./src/utils/logger');
const moment = require('moment-timezone');
const calendarService = require('./src/services/calendarService');

// Configurar para modo de prueba
process.env.TEST_MODE = 'true';
process.env.USE_LOCAL_ANALYSIS = 'true';
process.env.VENDEDOR_NOMBRE = 'Roberto Calvo';
process.env.VENDEDOR_EMAIL = 'roberto.calvo@logifit.pe';

// Función para simular el envío de mensajes
async function simulateMessage(userMessage, prospectState) {
  console.log(`\n--- MENSAJE DEL USUARIO ---`);
  console.log(`USUARIO: "${userMessage}"`);
  
  // Procesar el mensaje con el flujo de campaña
  const result = await campaignFlow.processMessage(userMessage, prospectState);
  
  // Simular retraso humanizado para la respuesta
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log(`\nBOT: "${result.response}"`);
  
  console.log(`\nESTADO ACTUALIZADO:`);
  console.log(JSON.stringify(result.newState, null, 2));
  
  return result.newState;
}

// Función para simular la creación de una cita en Google Calendar
async function simulateCalendarAppointment(prospectState) {
  console.log('\n--- SIMULANDO CREACIÓN DE CITA EN GOOGLE CALENDAR ---');
  
  try {
    // Crear evento simulado
    const startDateTime = moment().add(1, 'day').hour(10).minute(0).second(0);
    const customEvent = {
      startTime: startDateTime.toISOString(),
      duration: 30,
      summary: `Demostración LogiFit para ${prospectState.name} de ${prospectState.company}`,
      description: `Demostración del sistema de control de fatiga y somnolencia de LogiFit para ${prospectState.company}.`,
      attendees: prospectState.emails ? prospectState.emails.map(email => ({ email })) : []
    };
    
    // Crear evento personalizado
    const appointmentDetails = await calendarService.createCustomEvent(prospectState, customEvent);
    
    console.log('✅ Cita simulada creada exitosamente:');
    console.log(JSON.stringify(appointmentDetails, null, 2));
    
    // Actualizar el estado del prospecto con los detalles de la cita
    return {
      ...prospectState,
      appointmentDetails,
      meetLink: appointmentDetails.meetLink,
      appointmentCreated: true
    };
  } catch (error) {
    console.error('❌ Error al crear cita:', error.message);
    return prospectState;
  }
}

// Función principal para simular el flujo completo
async function simulateAppointmentFlow() {
  console.log('=== INICIANDO SIMULACIÓN DE FLUJO DE PROGRAMACIÓN DE CITA ===\n');
  
  // Estado inicial del prospecto
  let prospectState = {
    conversationState: 'new',
    lastInteraction: new Date()
  };
  
  // Simular conversación completa
  
  // 1. Saludo inicial
  prospectState = await simulateMessage(
    "Hola, me interesa su solución de monitoreo de fatiga para conductores",
    prospectState
  );
  
  // 2. Proporcionar nombre y empresa
  prospectState = await simulateMessage(
    "Soy Carlos Ramírez, Gerente de Operaciones en Transportes del Norte",
    prospectState
  );
  
  // 3. Responder sobre tamaño de flota
  prospectState = await simulateMessage(
    "Tenemos una flota de 45 camiones que operan a nivel nacional",
    prospectState
  );
  
  // 4. Responder sobre solución actual
  prospectState = await simulateMessage(
    "No tenemos ningún sistema implementado, pero hemos tenido algunos incidentes relacionados con fatiga",
    prospectState
  );
  
  // 5. Responder sobre plazo de decisión
  prospectState = await simulateMessage(
    "Estamos evaluando opciones para implementar en los próximos 30 días",
    prospectState
  );
  
  // 6. Responder sobre rol y poder de decisión
  prospectState = await simulateMessage(
    "Soy el Gerente de Operaciones y formo parte del comité que tomará la decisión final sobre qué sistema implementar",
    prospectState
  );
  
  // Verificar si el prospecto está calificado
  if (prospectState.conversationState === 'initial_qualification' && prospectState.qualificationComplete) {
    // Forzar la transición a estado calificado
    prospectState.conversationState = 'qualified';
    console.log("\n--- FORZANDO TRANSICIÓN A ESTADO CALIFICADO ---");
  }
  
  // 7. Aceptar invitación a demostración
  prospectState = await simulateMessage(
    "Sí, me interesa conocer más detalles sobre cómo funciona su sistema",
    prospectState
  );
  
  // 8. Aceptar horario propuesto
  prospectState = await simulateMessage(
    "Mañana a las 10:00 AM me parece bien",
    prospectState
  );
  
  // 9. Proporcionar correo electrónico
  prospectState = await simulateMessage(
    "Mi correo es carlos.ramirez@transportesdelnorte.com. También me gustaría incluir a nuestro Jefe de Seguridad, su correo es seguridad@transportesdelnorte.com",
    prospectState
  );
  
  // Extraer correos electrónicos del mensaje
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = prospectState.emails || [];
  const messageEmails = "Mi correo es carlos.ramirez@transportesdelnorte.com. También me gustaría incluir a nuestro Jefe de Seguridad, su correo es seguridad@transportesdelnorte.com".match(emailRegex) || [];
  
  if (messageEmails.length > 0 && emails.length === 0) {
    prospectState.emails = messageEmails;
    console.log(`\n--- CORREOS EXTRAÍDOS MANUALMENTE: ${messageEmails.join(', ')} ---`);
  }
  
  // Simular la creación de la cita en Google Calendar
  prospectState = await simulateCalendarAppointment(prospectState);
  
  // Simular respuesta del sistema después de crear la cita
  const appointmentResponse = `¡Listo! He programado la reunión para mañana a las 10:00 AM.

🚀 ¡Únete a nuestra sesión de Logifit! ✨ Logifit es una moderna herramienta tecnológica inteligente adecuada para la gestión del descanso y salud de los colaboradores. Brindamos servicios de monitoreo preventivo como apoyo a la mejora de la salud y prevención de accidentes, con la finalidad de salvaguardar la vida de los trabajadores y ayudarles a alcanzar el máximo de su productividad en el proyecto.
✨🌞 ¡Tu bienestar es nuestra prioridad! ⚒️👍

Te he enviado una invitación por correo electrónico con los detalles y el enlace para la llamada.

Por favor, confirma que has recibido la invitación respondiendo "Confirmado" o "Recibido".`;

  console.log(`\nBOT: "${appointmentResponse}"`);
  
  // Actualizar estado después de crear la cita
  prospectState = {
    ...prospectState,
    conversationState: 'follow_up',
    appointmentScheduled: true,
    lastInteraction: new Date()
  };
  
  console.log(`\nESTADO ACTUALIZADO DESPUÉS DE CREAR CITA:`);
  console.log(JSON.stringify(prospectState, null, 2));
  
  // 10. Confirmar recepción de invitación
  prospectState = await simulateMessage(
    "Confirmado, ya recibí la invitación. Gracias.",
    prospectState
  );
  
  // 11. Preguntar sobre expectativas para la reunión
  prospectState = await simulateMessage(
    "¿Hay algo específico que debamos preparar para la reunión?",
    prospectState
  );
  
  console.log('\n=== FIN DE LA SIMULACIÓN ===');
  
  // Mostrar resumen de la cita programada
  if (prospectState.appointmentDetails) {
    console.log('\n=== RESUMEN DE LA CITA PROGRAMADA ===');
    console.log(`Prospecto: ${prospectState.name} (${prospectState.company})`);
    console.log(`Fecha: ${prospectState.appointmentDetails.date}`);
    console.log(`Hora: ${prospectState.appointmentDetails.time}`);
    console.log(`Correos: ${prospectState.emails ? prospectState.emails.join(', ') : 'No disponible'}`);
    console.log(`Estado final: ${prospectState.conversationState}`);
    
    if (prospectState.meetLink) {
      console.log(`Enlace de reunión: ${prospectState.meetLink}`);
    }
    
    console.log('\n=== DETALLES TÉCNICOS ===');
    console.log(`ID del evento: ${prospectState.appointmentDetails.calendarEventId || 'Simulado'}`);
    console.log(`Zona horaria: ${moment.tz.guess()}`);
    console.log(`Creado en: ${new Date().toISOString()}`);
  } else {
    console.log('\n⚠️ No se completó la programación de la cita');
  }
}

// Ejecutar la simulación
simulateAppointmentFlow().catch(error => {
  console.error('Error en la simulación:', error);
}); 