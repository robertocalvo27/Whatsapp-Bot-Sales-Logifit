require('dotenv').config();
const { google } = require('googleapis');
const moment = require('moment');

// Configurar cliente de OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Verificar si tenemos un token de actualización
if (!process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN.includes('tu_')) {
  console.log('No se ha configurado un token de actualización válido para Google Calendar.');
  console.log('Necesitas generar un token de actualización. Sigue estos pasos:');
  
  // Generar URL de autorización
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'  // Forzar a que siempre pida consentimiento para obtener refresh_token
  });
  
  console.log('1. Visita la siguiente URL en tu navegador:');
  console.log(authUrl);
  console.log('2. Inicia sesión con tu cuenta de Google y autoriza la aplicación');
  console.log('3. Serás redirigido a una URL. Copia el código de la URL (parámetro "code")');
  console.log('4. Ejecuta el siguiente comando en otra terminal, reemplazando CODE por el código que obtuviste:');
  console.log(`node -e "require('dotenv').config(); const {google} = require('googleapis'); const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI); oauth2Client.getToken('CODE', (err, tokens) => { if (err) return console.error('Error al obtener tokens:', err); console.log('Refresh Token:', tokens.refresh_token); });"`)
  
  process.exit(0);
}

// Establecer token de actualización
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// Crear cliente de Calendar
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Función para obtener eventos del calendario
async function getCalendarEvents() {
  try {
    // Obtener fecha actual y fecha límite (7 días después)
    const now = moment();
    const endDate = moment().add(7, 'days');
    
    console.log(`Buscando eventos desde ${now.format('DD/MM/YYYY')} hasta ${endDate.format('DD/MM/YYYY')}...`);
    
    // Obtener eventos del calendario
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const events = response.data.items;
    
    if (events.length === 0) {
      console.log('No se encontraron eventos para los próximos 7 días.');
    } else {
      console.log(`Se encontraron ${events.length} eventos:`);
      events.forEach((event, i) => {
        const start = event.start.dateTime || event.start.date;
        const end = event.end.dateTime || event.end.date;
        console.log(`${i + 1}. ${event.summary} (${moment(start).format('DD/MM/YYYY HH:mm')} - ${moment(end).format('DD/MM/YYYY HH:mm')})`);
      });
    }
    
    return events;
  } catch (error) {
    console.error('Error al obtener eventos del calendario:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    return [];
  }
}

// Función para crear un evento de prueba
async function createTestEvent() {
  try {
    // Crear evento para mañana a las 10:00 AM
    const tomorrow = moment().add(1, 'day').hour(10).minute(0).second(0);
    
    console.log(`Creando evento de prueba para mañana (${tomorrow.format('DD/MM/YYYY HH:mm')})...`);
    
    const event = {
      summary: 'Evento de prueba',
      description: 'Este es un evento de prueba creado por el bot de WhatsApp',
      start: {
        dateTime: tomorrow.toISOString(),
        timeZone: 'America/Mexico_City' // Ajustar según tu zona horaria
      },
      end: {
        dateTime: tomorrow.add(1, 'hour').toISOString(),
        timeZone: 'America/Mexico_City' // Ajustar según tu zona horaria
      },
      attendees: [
        { email: process.env.VENDEDOR_EMAIL }
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all'
    });
    
    console.log('Evento creado exitosamente:');
    console.log(`- ID: ${response.data.id}`);
    console.log(`- Enlace: ${response.data.htmlLink}`);
    
    return response.data;
  } catch (error) {
    console.error('Error al crear evento de prueba:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    return null;
  }
}

// Función para verificar disponibilidad
async function checkAvailability() {
  try {
    // Obtener fecha actual y fecha límite (7 días después)
    const now = moment();
    const endDate = moment().add(7, 'days');
    
    console.log(`Verificando disponibilidad desde ${now.format('DD/MM/YYYY')} hasta ${endDate.format('DD/MM/YYYY')}...`);
    
    // Obtener eventos del calendario
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const events = response.data.items;
    
    // Generar slots disponibles (horario laboral: 9 AM - 5 PM)
    const availableSlots = [];
    const currentDate = moment(now).startOf('day');
    
    // Iterar por los próximos 7 días
    while (currentDate.isSameOrBefore(endDate, 'day')) {
      // Saltar fines de semana
      if (currentDate.day() !== 0 && currentDate.day() !== 6) {
        console.log(`\nVerificando disponibilidad para ${currentDate.format('DD/MM/YYYY')} (${currentDate.format('dddd')}):`);
        
        // Horarios disponibles (9 AM - 5 PM, slots de 1 hora)
        for (let hour = 9; hour < 17; hour++) {
          const slotStart = moment(currentDate).hour(hour).minute(0);
          
          // Saltar slots en el pasado
          if (slotStart.isBefore(now)) {
            console.log(`  ${slotStart.format('HH:mm')} - En el pasado`);
            continue;
          }
          
          // Verificar si el slot está disponible
          const isAvailable = !events.some(event => {
            const eventStart = moment(event.start.dateTime || event.start.date);
            const eventEnd = moment(event.end.dateTime || event.end.date);
            return slotStart.isBetween(eventStart, eventEnd, null, '[)');
          });
          
          if (isAvailable) {
            console.log(`  ${slotStart.format('HH:mm')} - Disponible ✓`);
            availableSlots.push({
              date: slotStart.format('DD/MM/YYYY'),
              time: slotStart.format('HH:mm'),
              dateTime: slotStart.toISOString()
            });
          } else {
            console.log(`  ${slotStart.format('HH:mm')} - Ocupado ✗`);
          }
        }
      } else {
        console.log(`\nSaltando ${currentDate.format('DD/MM/YYYY')} (${currentDate.format('dddd')}) - Fin de semana`);
      }
      
      // Avanzar al siguiente día
      currentDate.add(1, 'day');
    }
    
    console.log(`\nSe encontraron ${availableSlots.length} slots disponibles.`);
    
    return availableSlots;
  } catch (error) {
    console.error('Error al verificar disponibilidad:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    return [];
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('=== PRUEBA DE CONEXIÓN CON GOOGLE CALENDAR ===\n');
  
  // Obtener eventos
  console.log('1. Obteniendo eventos del calendario...\n');
  await getCalendarEvents();
  
  console.log('\n2. Verificando disponibilidad...\n');
  await checkAvailability();
  
  console.log('\n3. Creando evento de prueba...\n');
  await createTestEvent();
  
  console.log('\n=== PRUEBAS COMPLETADAS ===');
}

// Ejecutar pruebas
runTests(); 