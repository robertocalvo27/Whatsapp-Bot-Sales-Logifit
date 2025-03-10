const { google } = require('googleapis');
const moment = require('moment');
const logger = require('../utils/logger');

// Variables globales
let calendar = null;
let hasValidCredentials = false;

// Inicializar cliente de Google Calendar
try {
  // Configurar cliente OAuth2
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  // Establecer credenciales
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    // Crear cliente de Calendar
    calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    hasValidCredentials = true;
    
    logger.info('Cliente de Google Calendar inicializado correctamente');
  } else {
    logger.warn('No se encontró GOOGLE_REFRESH_TOKEN en las variables de entorno');
  }
} catch (error) {
  if (logger) {
    logger.error('Error al inicializar Google Calendar:', error);
  } else {
    console.error('Error al inicializar Google Calendar:', error);
  }
}

/**
 * Genera slots disponibles simulados para pruebas
 * @returns {Array} - Array de slots disponibles simulados
 */
function generateMockAvailableSlots() {
  const availableSlots = [];
  const now = moment();
  
  // Generar 5 slots disponibles en los próximos 5 días laborables
  for (let i = 1; i <= 5; i++) {
    const date = moment(now).add(i, 'days');
    
    // Saltar fines de semana
    if (date.day() === 0 || date.day() === 6) {
      continue;
    }
    
    // Añadir un slot a las 10:00 AM
    availableSlots.push({
      date: date.format('DD/MM/YYYY'),
      time: '10:00',
      dateTime: date.hour(10).minute(0).second(0).toISOString()
    });
    
    // Si no tenemos 5 slots, añadir otro a las 3:00 PM
    if (availableSlots.length < 5) {
      availableSlots.push({
        date: date.format('DD/MM/YYYY'),
        time: '15:00',
        dateTime: date.hour(15).minute(0).second(0).toISOString()
      });
    }
    
    // Si ya tenemos 5 slots, salir del bucle
    if (availableSlots.length >= 5) {
      break;
    }
  }
  
  return availableSlots;
}

/**
 * Verifica la disponibilidad en el calendario y devuelve slots disponibles
 * @returns {Promise<Array>} - Array de slots disponibles
 */
async function checkCalendarAvailability() {
  try {
    // Si no tenemos credenciales válidas, devolver datos simulados
    if (!calendar) {
      logger.info('Usando slots disponibles simulados');
      return generateMockAvailableSlots();
    }
    
    // Obtener fecha actual y fecha límite (7 días después)
    const now = moment();
    const endDate = moment().add(7, 'days');
    
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
        // Horarios disponibles (9 AM - 5 PM, slots de 1 hora)
        for (let hour = 9; hour < 17; hour++) {
          const slotStart = moment(currentDate).hour(hour).minute(0);
          
          // Saltar slots en el pasado
          if (slotStart.isBefore(now)) continue;
          
          // Verificar si el slot está disponible
          const isAvailable = !events.some(event => {
            const eventStart = moment(event.start.dateTime || event.start.date);
            const eventEnd = moment(event.end.dateTime || event.end.date);
            return slotStart.isBetween(eventStart, eventEnd, null, '[)');
          });
          
          if (isAvailable) {
            availableSlots.push({
              date: slotStart.format('DD/MM/YYYY'),
              time: slotStart.format('HH:mm'),
              dateTime: slotStart.toISOString()
            });
          }
          
          // Limitar a 5 slots disponibles
          if (availableSlots.length >= 5) {
            return availableSlots;
          }
        }
      }
      
      // Avanzar al siguiente día
      currentDate.add(1, 'day');
    }
    
    return availableSlots;
  } catch (error) {
    logger.error('Error al verificar disponibilidad del calendario:', error);
    // En caso de error, devolver datos simulados
    return generateMockAvailableSlots();
  }
}

/**
 * Crea un evento en el calendario
 * @param {Object} prospectState - Estado del prospecto
 * @param {string|Object} slotSelection - Selección del usuario o evento personalizado
 * @returns {Promise<Object>} - Detalles de la cita
 */
async function createCalendarEvent(prospectState, slotSelection) {
  try {
    // Verificar si es un evento personalizado
    if (typeof slotSelection === 'object' && slotSelection.startTime) {
      return createCustomEvent(prospectState, slotSelection);
    }
    
    // Obtener slots disponibles
    const availableSlots = await checkCalendarAvailability();
    
    // Interpretar la selección del usuario
    let selectedSlot;
    
    // Si no hay slots disponibles, crear uno para mañana a las 10:00 AM
    if (availableSlots.length === 0) {
      logger.info('No hay slots disponibles. Creando un slot para mañana a las 10:00 AM');
      const tomorrow = moment().add(1, 'day').hour(10).minute(0).second(0);
      selectedSlot = {
        date: tomorrow.format('DD/MM/YYYY'),
        time: '10:00',
        dateTime: tomorrow.toISOString()
      };
    }
    // Si es un número, seleccionar el slot correspondiente
    else if (/^\d+$/.test(slotSelection.trim())) {
      const index = parseInt(slotSelection.trim()) - 1;
      if (index >= 0 && index < availableSlots.length) {
        selectedSlot = availableSlots[index];
      }
    } 
    // Si no es un número, intentar interpretar la fecha y hora
    else {
      // Aquí iría lógica más compleja para interpretar fechas en lenguaje natural
      // Por simplicidad, usaremos el primer slot disponible
      selectedSlot = availableSlots[0];
    }
    
    if (!selectedSlot) {
      throw new Error('No se pudo interpretar la selección de horario');
    }
    
    // Si no tenemos credenciales válidas, simular la creación del evento
    if (!calendar) {
      logger.info('Simulando creación de evento en el calendario');
      return {
        date: selectedSlot.date,
        time: selectedSlot.time,
        calendarEventId: `mock-event-${Date.now()}`,
        meetLink: `https://meet.google.com/mock-link-${Math.random().toString(36).substring(2, 7)}`
      };
    }
    
    // Crear evento en el calendario
    const event = {
      summary: `Llamada con ${prospectState.name}`,
      description: `Llamada con prospecto de WhatsApp. Teléfono: ${prospectState.phoneNumber}`,
      start: {
        dateTime: selectedSlot.dateTime,
        timeZone: 'America/Lima' // Ajustar según tu zona horaria
      },
      end: {
        dateTime: moment(selectedSlot.dateTime).add(1, 'hour').toISOString(),
        timeZone: 'America/Lima' // Ajustar según tu zona horaria
      },
      attendees: [
        { email: process.env.VENDEDOR_EMAIL },
        // Si tienes el email del prospecto, podrías añadirlo aquí
      ],
      conferenceData: {
        createRequest: {
          requestId: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    };
    
    // Crear evento
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1
    });
    
    const createdEvent = response.data;
    
    // Extraer detalles
    return {
      date: selectedSlot.date,
      time: selectedSlot.time,
      calendarEventId: createdEvent.id,
      meetLink: createdEvent.hangoutLink || 'https://meet.google.com'
    };
  } catch (error) {
    logger.error('Error al crear evento en el calendario:', error);
    throw new Error('No se pudo crear el evento en el calendario');
  }
}

/**
 * Crea un evento personalizado en el calendario
 * @param {Object} prospectState - Estado del prospecto
 * @param {Object} customEvent - Detalles del evento personalizado
 * @returns {Promise<Object>} - Detalles de la cita
 */
async function createCustomEvent(prospectState, customEvent) {
  try {
    // Si no tenemos credenciales válidas, simular la creación del evento
    if (!calendar) {
      logger.info('Simulando creación de evento personalizado en el calendario');
      
      const startDateTime = moment(customEvent.startTime);
      
      return {
        date: startDateTime.format('DD/MM/YYYY'),
        time: startDateTime.format('HH:mm'),
        calendarEventId: `mock-event-${Date.now()}`,
        meetLink: `https://meet.google.com/mock-link-${Math.random().toString(36).substring(2, 7)}`
      };
    }
    
    // Preparar evento para Google Calendar
    const startDateTime = moment(customEvent.startTime);
    const endDateTime = moment(customEvent.startTime).add(customEvent.duration || 30, 'minutes');
    
    // Crear objeto de evento
    const event = {
      summary: customEvent.summary || `Llamada con ${prospectState.name}`,
      description: customEvent.description || `Llamada con prospecto de WhatsApp. Teléfono: ${prospectState.phoneNumber}`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Lima' // Ajustar según tu zona horaria
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Lima' // Ajustar según tu zona horaria
      },
      attendees: [
        { email: process.env.VENDEDOR_EMAIL },
        ...(customEvent.attendees || [])
      ],
      conferenceData: {
        createRequest: {
          requestId: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    };
    
    // Crear evento
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1
    });
    
    const createdEvent = response.data;
    
    // Extraer detalles
    return {
      date: startDateTime.format('DD/MM/YYYY'),
      time: startDateTime.format('HH:mm'),
      calendarEventId: createdEvent.id,
      meetLink: createdEvent.hangoutLink || 'https://meet.google.com'
    };
  } catch (error) {
    logger.error('Error al crear evento personalizado en el calendario:', error);
    throw new Error('No se pudo crear el evento personalizado en el calendario');
  }
}

module.exports = {
  checkCalendarAvailability,
  createCalendarEvent,
  hasValidCredentials
}; 