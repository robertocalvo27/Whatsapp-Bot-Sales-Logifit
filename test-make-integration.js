require('dotenv').config();
const CampaignFlow = require('./src/flows/campaignFlow');
const { formatAppointmentData, sendAppointmentToMake } = require('./src/services/webhookService');
const logger = require('./src/utils/logger');

// Configurar nivel de log para ver toda la información
logger.level = 'debug';

// Función para simular una conversación
async function simulateConversation() {
  console.log('\n===== SIMULACIÓN DE CONVERSACIÓN CON MAKE.COM =====\n');
  
  // Crear instancia del flujo de campaña
  const campaignFlow = new CampaignFlow();
  
  // Estado inicial del prospecto
  let prospectState = {
    phoneNumber: '+51987654321',
    name: null,
    company: null,
    emails: [],
    conversationState: 'GREETING',
    lastInteraction: new Date(),
    timezone: 'America/Lima',
    country: 'PE',
    campaignType: 'GENERAL',
    qualificationAnswers: {},
    interestAnalysis: null,
    selectedTime: null,
    appointmentCreated: false
  };
  
  // Simular mensajes y respuestas
  const conversation = [
    // Mensaje inicial del bot (no necesita respuesta)
    {
      role: 'bot',
      message: '👋 ¡Hola! Soy el asistente virtual de Logifit, especialistas en soluciones de control de fatiga y somnolencia para conductores y operarios. ¿Con quién tengo el gusto de hablar?'
    },
    // Respuesta del usuario con su nombre y empresa
    {
      role: 'user',
      message: 'Hola, soy Roberto Calvo de la empresa Minera Las Bambas'
    },
    // Respuesta a pregunta 1
    {
      role: 'user',
      message: 'Tenemos aproximadamente 200 conductores en nuestra flota de transporte'
    },
    // Respuesta a pregunta 2
    {
      role: 'user',
      message: 'Sí, hemos tenido algunos incidentes por fatiga en los últimos meses, es un tema que nos preocupa bastante'
    },
    // Respuesta a pregunta 3
    {
      role: 'user',
      message: 'Actualmente no tenemos ningún sistema implementado, solo controles manuales'
    },
    // Aceptación de reunión
    {
      role: 'user',
      message: 'Sí, me interesa agendar una reunión para conocer más sobre su solución'
    },
    // Propuesta de horario
    {
      role: 'user',
      message: 'Mañana a las 10am estaría bien'
    },
    // Envío de email
    {
      role: 'user',
      message: 'Mi correo es rcalvo.retana@gmail.com'
    }
  ];
  
  // Mostrar el mensaje inicial del bot
  console.log(`\n🤖 BOT: ${conversation[0].message}`);
  
  // Procesar la conversación
  for (let i = 1; i < conversation.length; i++) {
    const currentMessage = conversation[i];
    
    // Mostrar el mensaje del usuario
    console.log(`\n👤 USUARIO: ${currentMessage.message}`);
    
    // Procesar el mensaje con el flujo de campaña
    const result = await campaignFlow.processMessage(prospectState, currentMessage.message);
    
    // Actualizar el estado del prospecto
    prospectState = result.newState;
    
    // Mostrar la respuesta del bot
    console.log(`\n🤖 BOT: ${result.response}`);
    
    // Esperar un poco para simular tiempo de respuesta
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Si estamos en el paso de recolección de email y se proporcionó un email
    if (prospectState.conversationState === 'FOLLOW_UP' && prospectState.appointmentCreated) {
      console.log('\n===== DATOS ENVIADOS A MAKE.COM =====\n');
      
      // Mostrar los datos que se enviaron a Make.com
      const appointmentDetails = prospectState.appointmentDetails;
      console.log('Detalles de la cita:', JSON.stringify(appointmentDetails, null, 2));
      
      console.log('\nEstado del prospecto:', JSON.stringify({
        name: prospectState.name,
        company: prospectState.company,
        emails: prospectState.emails,
        phoneNumber: prospectState.phoneNumber,
        timezone: prospectState.timezone
      }, null, 2));
      
      // Mostrar el webhook completo que se envió
      const webhookData = formatAppointmentData(prospectState, appointmentDetails);
      console.log('\nDatos enviados al webhook:', JSON.stringify(webhookData, null, 2));
      
      // Intentar enviar los datos reales al webhook
      console.log('\n===== ENVIANDO DATOS AL WEBHOOK DE MAKE.COM =====\n');
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
    }
  }
  
  console.log('\n===== FIN DE LA SIMULACIÓN =====\n');
}

// Ejecutar la simulación
simulateConversation()
  .then(() => {
    console.log('Simulación completada.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error en la simulación:', error);
    process.exit(1);
  }); 