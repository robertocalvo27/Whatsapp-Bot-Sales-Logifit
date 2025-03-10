require('dotenv').config();
const { google } = require('googleapis');
const moment = require('moment');

// Configurar cliente OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Establecer credenciales
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// Crear cliente de Calendar
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function listEvents() {
  try {
    console.log('Listando próximos eventos en Google Calendar...\n');
    
    // Obtener eventos para los próximos 7 días
    const now = moment();
    const oneWeekLater = moment().add(7, 'days');
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: oneWeekLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items;
    
    if (events.length === 0) {
      console.log('No se encontraron eventos para los próximos 7 días.');
      return;
    }
    
    console.log(`Se encontraron ${events.length} eventos:\n`);
    
    events.forEach((event, i) => {
      const start = event.start.dateTime || event.start.date;
      const startTime = moment(start).format('DD/MM/YYYY HH:mm');
      
      console.log(`${i + 1}. ${event.summary} - ${startTime}`);
      console.log(`   ID: ${event.id}`);
      
      if (event.hangoutLink) {
        console.log(`   Meet: ${event.hangoutLink}`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('Error al listar eventos:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
  }
}

// Ejecutar la función
listEvents(); 