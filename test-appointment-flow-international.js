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
    // Obtener zona horaria del prospecto o usar la predeterminada
    const timezone = prospectState.timezone || 'America/Lima';
    console.log(`Usando zona horaria: ${timezone}`);
    
    // Crear evento simulado
    const startDateTime = moment().tz(timezone).add(1, 'day').hour(10).minute(0).second(0);
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
async function simulateInternationalAppointmentFlow() {
  // Definir diferentes perfiles de prospectos internacionales
  const internationalProspects = [
    {
      name: "Carlos Ramírez",
      company: "Transportes del Norte",
      country: "Perú",
      timezone: "America/Lima",
      language: "es",
      fleetSize: 45
    },
    {
      name: "Miguel Rodríguez",
      company: "Transportes Mexicanos",
      country: "México",
      timezone: "America/Mexico_City",
      language: "es",
      fleetSize: 60
    },
    {
      name: "Juan González",
      company: "Transportes Colombianos",
      country: "Colombia",
      timezone: "America/Bogota",
      language: "es",
      fleetSize: 35
    },
    {
      name: "Pedro Silva",
      company: "Transportes Chilenos",
      country: "Chile",
      timezone: "America/Santiago",
      language: "es",
      fleetSize: 50
    }
  ];
  
  // Simular el flujo para cada prospecto internacional
  for (const prospectProfile of internationalProspects) {
    console.log(`\n\n=== INICIANDO SIMULACIÓN PARA PROSPECTO DE ${prospectProfile.country.toUpperCase()} ===\n`);
    console.log(`Prospecto: ${prospectProfile.name} (${prospectProfile.company})`);
    console.log(`País: ${prospectProfile.country}`);
    console.log(`Zona horaria: ${prospectProfile.timezone}`);
    console.log(`Tamaño de flota: ${prospectProfile.fleetSize} unidades`);
    
    // Estado inicial del prospecto
    let prospectState = {
      conversationState: 'new',
      lastInteraction: new Date(),
      timezone: prospectProfile.timezone
    };
    
    // 1. Saludo inicial
    prospectState = await simulateMessage(
      `Hola, me interesa su solución de monitoreo de fatiga para conductores`,
      prospectState
    );
    
    // 2. Proporcionar nombre y empresa
    prospectState = await simulateMessage(
      `Soy ${prospectProfile.name}, Gerente de Operaciones en ${prospectProfile.company}`,
      prospectState
    );
    
    // 3. Responder sobre tamaño de flota
    prospectState = await simulateMessage(
      `Tenemos una flota de ${prospectProfile.fleetSize} camiones que operan a nivel nacional`,
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
      "Soy el Gerente de Operaciones y formo parte del comité que tomará la decisión final",
      prospectState
    );
    
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
    const emailDomain = prospectProfile.company.toLowerCase().replace(/\s+/g, '') + '.com';
    const email = prospectProfile.name.toLowerCase().split(' ')[0] + '@' + emailDomain;
    
    prospectState = await simulateMessage(
      `Mi correo es ${email}. También me gustaría incluir a nuestro Jefe de Seguridad, su correo es seguridad@${emailDomain}`,
      prospectState
    );
    
    // Simular la creación de la cita en Google Calendar
    if (prospectState.emails && prospectState.emails.length > 0) {
      prospectState = await simulateCalendarAppointment({
        ...prospectState,
        timezone: prospectProfile.timezone
      });
    }
    
    // 10. Confirmar recepción de invitación
    prospectState = await simulateMessage(
      "Confirmado, ya recibí la invitación. Gracias.",
      prospectState
    );
    
    // Mostrar resumen de la cita programada
    if (prospectState.appointmentDetails) {
      console.log('\n=== RESUMEN DE LA CITA PROGRAMADA ===');
      console.log(`Prospecto: ${prospectState.name} (${prospectState.company})`);
      console.log(`País: ${prospectProfile.country}`);
      console.log(`Fecha: ${prospectState.appointmentDetails.date}`);
      console.log(`Hora: ${prospectState.appointmentDetails.time} (${prospectProfile.timezone})`);
      console.log(`Hora equivalente en Lima: ${moment.tz(prospectState.appointmentDetails.dateTime, prospectProfile.timezone).tz('America/Lima').format('HH:mm')}`);
      console.log(`Correos: ${prospectState.emails ? prospectState.emails.join(', ') : 'No disponible'}`);
      
      if (prospectState.meetLink) {
        console.log(`Enlace de reunión: ${prospectState.meetLink}`);
      }
    } else {
      console.log('\n⚠️ No se completó la programación de la cita');
    }
    
    console.log('\n=== FIN DE LA SIMULACIÓN PARA ESTE PROSPECTO ===');
  }
  
  console.log('\n\n=== SIMULACIÓN INTERNACIONAL COMPLETADA ===');
}

// Ejecutar la simulación
simulateInternationalAppointmentFlow().catch(error => {
  console.error('Error en la simulación internacional:', error);
}); 