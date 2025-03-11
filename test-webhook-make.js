require('dotenv').config();
const { formatAppointmentData, sendAppointmentToMake } = require('./src/services/webhookService');
const moment = require('moment-timezone');

// Función para simular el envío de datos al webhook
async function testWebhook() {
  console.log('\n===== PRUEBA DE INTEGRACIÓN CON MAKE.COM =====\n');
  
  // Crear un estado de prospecto de prueba
  const prospectState = {
    phoneNumber: '+51987654321',
    name: 'Roberto Calvo',
    company: 'Minera Las Bambas',
    emails: ['rcalvo.retana@gmail.com'],
    conversationState: 'FOLLOW_UP',
    lastInteraction: new Date(),
    timezone: 'America/Lima',
    country: 'PE',
    campaignType: 'GENERAL',
    qualificationAnswers: {
      '¿Cuántos conductores tienen en su flota?': 'Aproximadamente 200 conductores',
      '¿Han tenido incidentes por fatiga?': 'Sí, hemos tenido algunos incidentes en los últimos meses',
      '¿Utilizan algún sistema de control de fatiga actualmente?': 'No, solo controles manuales'
    },
    interestAnalysis: {
      interestScore: 8,
      highInterest: true,
      shouldOfferAppointment: true,
      reasoning: 'El prospecto muestra alto interés y tiene una necesidad clara.'
    }
  };
  
  // Crear detalles de la cita
  const tomorrow = moment().add(1, 'day').set({ hour: 10, minute: 0, second: 0 });
  const appointmentDetails = {
    date: tomorrow.format('DD/MM/YYYY'),
    time: tomorrow.format('HH:mm'),
    dateTime: tomorrow.toDate()
  };
  
  console.log('Datos del prospecto:', JSON.stringify({
    name: prospectState.name,
    company: prospectState.company,
    emails: prospectState.emails,
    phoneNumber: prospectState.phoneNumber
  }, null, 2));
  
  console.log('\nDetalles de la cita:', JSON.stringify(appointmentDetails, null, 2));
  
  // Formatear los datos para el webhook
  const webhookData = formatAppointmentData(prospectState, appointmentDetails);
  
  console.log('\nDatos formateados para Make.com:', JSON.stringify(webhookData, null, 2));
  
  // Enviar los datos al webhook
  console.log('\n===== ENVIANDO DATOS AL WEBHOOK =====\n');
  
  try {
    const webhookResult = await sendAppointmentToMake(webhookData);
    
    console.log('Respuesta del webhook:', JSON.stringify(webhookResult, null, 2));
    
    if (webhookResult.success) {
      console.log('\n✅ INTEGRACIÓN EXITOSA: Los datos se enviaron correctamente a Make.com');
      console.log('Verifica tu correo rcalvo.retana@gmail.com para confirmar la recepción de la invitación.');
    } else {
      console.log('\n❌ ERROR EN LA INTEGRACIÓN: No se pudieron enviar los datos a Make.com');
      console.log('Error:', webhookResult.error);
    }
  } catch (error) {
    console.error('\n❌ ERROR AL ENVIAR DATOS:', error);
  }
  
  console.log('\n===== FIN DE LA PRUEBA =====\n');
}

// Ejecutar la prueba
testWebhook()
  .then(() => {
    console.log('Prueba completada.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error en la prueba:', error);
    process.exit(1);
  }); 