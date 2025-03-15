const { google } = require('googleapis');
const moment = require('moment-timezone');
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
 * Verifica la disponibilidad en el calendario
 * @param {Date} startDate - Fecha de inicio
 * @param {Date} endDate - Fecha de fin
 * @returns {Promise<Array>} - Slots disponibles
 */
async function checkCalendarAvailability(startDate, endDate) {
  try {
    // Convertir fechas a formato ISO
    const timeMin = new Date(startDate).toISOString();
    const timeMax = new Date(endDate).toISOString();
    
    // Obtener eventos del calendario
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items;
    
    // Crear slots disponibles (horario laboral: 9:00 - 17:00)
    const availableSlots = [];
    const currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    
    while (currentDate < endDateTime) {
      // Solo considerar días laborables (lunes a viernes)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        // Horario laboral: 9:00 - 17:00
        for (let hour = 9; hour < 17; hour++) {
          const slotStart = new Date(currentDate);
          slotStart.setHours(hour, 0, 0, 0);
          
          const slotEnd = new Date(slotStart);
          slotEnd.setHours(slotStart.getHours() + 1);
          
          // Verificar si el slot ya pasó
          if (slotStart > new Date()) {
            // Verificar si el slot está disponible
            const isAvailable = !events.some(event => {
              const eventStart = new Date(event.start.dateTime || event.start.date);
              const eventEnd = new Date(event.end.dateTime || event.end.date);
              
              return (
                (slotStart >= eventStart && slotStart < eventEnd) ||
                (slotEnd > eventStart && slotEnd <= eventEnd) ||
                (slotStart <= eventStart && slotEnd >= eventEnd)
              );
            });
            
            if (isAvailable) {
              availableSlots.push({
                start: slotStart.toISOString(),
                end: slotEnd.toISOString()
              });
            }
          }
        }
      }
      
      // Avanzar al siguiente día
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }
    
    return availableSlots;
  } catch (error) {
    logger.error('Error al verificar disponibilidad del calendario:', error);
    throw error;
  }
}

/**
 * Crea un evento en el calendario
 * @param {Object} eventDetails - Detalles del evento
 * @returns {Promise<Object>} - Evento creado
 */
async function createCalendarEvent(eventDetails) {
  try {
    // Extraer detalles del evento
    const {
      summary,
      description,
      startDateTime,
      duration,
      attendees,
      timeZone = 'America/Lima'
    } = eventDetails;
    
    // Crear fecha de inicio
    const start = {
      dateTime: startDateTime,
      timeZone: timeZone
    };
    
    // Crear fecha de fin (añadir duración)
    const endDateTime = moment(startDateTime).add(duration, 'minutes').format();
    const end = {
      dateTime: endDateTime,
      timeZone: timeZone
    };
    
    // Crear evento
    const event = {
      summary: summary || 'Reunión con Logifit',
      description: description || 'Demostración del sistema de control de fatiga y somnolencia de Logifit.',
      start,
      end,
      attendees: attendees || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 día antes
          { method: 'popup', minutes: 30 } // 30 minutos antes
        ]
      },
      conferenceData: {
        createRequest: {
          requestId: `logifit-meeting-${Date.now()}`
        }
      }
    };
    
    // Insertar evento en el calendario
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all', // Enviar notificaciones a los asistentes
      conferenceDataVersion: 1 // Crear enlace de Google Meet
    });
    
    logger.info('Evento creado en el calendario:', response.data.htmlLink);
    
    return response.data;
  } catch (error) {
    logger.error('Error al crear evento en el calendario:', error);
    throw error;
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

/**
 * Obtiene el slot disponible más cercano en el calendario
 * @param {string} timezone - Zona horaria del usuario (por defecto: America/Lima)
 * @param {number} daysAhead - Número de días hacia adelante para buscar (por defecto: 0)
 * @returns {Promise<Object>} - Información del slot disponible
 */
async function getNearestAvailableSlot(timezone = 'America/Lima', daysAhead = 0) {
  try {
    // Obtener fecha actual en la zona horaria del usuario
    const now = moment().tz(timezone || 'America/Lima');
    
    // Ajustar fecha según daysAhead
    const targetDate = now.clone().add(daysAhead, 'days');
    
    // Si es fin de semana, ajustar al próximo día laboral
    const dayOfWeek = targetDate.day(); // 0 = domingo, 6 = sábado
    if (dayOfWeek === 0) { // Domingo
      targetDate.add(1, 'day');
    } else if (dayOfWeek === 6) { // Sábado
      targetDate.add(2, 'days');
    }
    
    // Hora de inicio para buscar slots (9:00 AM si es un día futuro, hora actual + 2 horas si es hoy)
    let startHour;
    if (daysAhead === 0 && targetDate.isSame(now, 'day')) {
      // Si es hoy, empezar 2 horas después de la hora actual
      startHour = now.clone().add(2, 'hours');
      
      // Redondear a la siguiente hora completa
      if (startHour.minute() > 0) {
        startHour.add(1, 'hour').minute(0);
      }
      
      // Si ya pasó el horario laboral, mover al siguiente día
      if (startHour.hour() >= 18) {
        targetDate.add(1, 'day');
        startHour = targetDate.clone().hour(9).minute(0);
        
        // Verificar si el nuevo día es fin de semana
        const newDayOfWeek = targetDate.day();
        if (newDayOfWeek === 0) { // Domingo
          targetDate.add(1, 'day');
          startHour = targetDate.clone().hour(9).minute(0);
        } else if (newDayOfWeek === 6) { // Sábado
          targetDate.add(2, 'days');
          startHour = targetDate.clone().hour(9).minute(0);
        }
      }
    } else {
      // Si es un día futuro, empezar a las 9:00 AM
      startHour = targetDate.clone().hour(9).minute(0);
    }
    
    // Ajustar si la hora de inicio es antes de las 9:00 AM
    if (startHour.hour() < 9) {
      startHour.hour(9).minute(0);
    }
    
    // Hora de fin del día laboral (18:00)
    const endHour = targetDate.clone().hour(18).minute(0);
    
    // Duración de cada slot en minutos
    const slotDuration = 60;
    
    // Obtener eventos del calendario para el día objetivo
    // Aquí deberíamos integrar con la API de Google Calendar
    // Por ahora, simularemos algunos eventos ocupados
    const busySlots = await getBusySlots(targetDate.format('YYYY-MM-DD'));
    
    // Generar todos los slots posibles para el día
    const allSlots = [];
    let currentSlot = startHour.clone();
    
    while (currentSlot.isBefore(endHour)) {
      // Saltar la hora de almuerzo (13:00 - 14:00)
      if (currentSlot.hour() === 13) {
        currentSlot.add(1, 'hour');
        continue;
      }
      
      // Verificar si el slot está ocupado
      const isSlotBusy = busySlots.some(busySlot => {
        const slotStart = currentSlot.clone();
        const slotEnd = currentSlot.clone().add(slotDuration, 'minutes');
        
        return (
          (moment(busySlot.start).isBefore(slotEnd) && moment(busySlot.end).isAfter(slotStart)) ||
          moment(busySlot.start).isSame(slotStart)
        );
      });
      
      if (!isSlotBusy) {
        allSlots.push({
          date: currentSlot.format('DD/MM/YYYY'),
          time: currentSlot.format('HH:mm'),
          dateTime: currentSlot.toISOString(),
          isToday: currentSlot.isSame(now, 'day'),
          isTomorrow: currentSlot.isSame(now.clone().add(1, 'day'), 'day')
        });
      }
      
      // Avanzar al siguiente slot
      currentSlot.add(slotDuration, 'minutes');
    }
    
    // Si no hay slots disponibles, buscar en el siguiente día
    if (allSlots.length === 0) {
      return getNearestAvailableSlot(timezone, daysAhead + 1);
    }
    
    // Devolver el primer slot disponible
    return allSlots[0];
  } catch (error) {
    logger.error('Error al obtener slot disponible:', error);
    throw error;
  }
}

/**
 * Obtiene los slots ocupados para una fecha específica
 * @param {string} date - Fecha en formato YYYY-MM-DD
 * @returns {Promise<Array>} - Lista de slots ocupados
 */
async function getBusySlots(date) {
  try {
    // Aquí deberíamos integrar con la API de Google Calendar
    // Por ahora, simularemos algunos eventos ocupados
    
    // Convertir la fecha a objeto Date
    const targetDate = moment(date, 'YYYY-MM-DD').toDate();
    const dateString = moment(targetDate).format('YYYY-MM-DD');
    
    // Simular eventos ocupados (en un entorno real, esto vendría de Google Calendar)
    const simulatedBusySlots = [
      // Simular una reunión de 10:00 a 11:00
      {
        start: `${dateString}T10:00:00`,
        end: `${dateString}T11:00:00`
      },
      // Simular una reunión de 15:00 a 16:30
      {
        start: `${dateString}T15:00:00`,
        end: `${dateString}T16:30:00`
      }
    ];
    
    return simulatedBusySlots;
  } catch (error) {
    logger.error('Error al obtener slots ocupados:', error);
    return []; // Devolver array vacío en caso de error
  }
}

module.exports = {
  checkCalendarAvailability,
  createCalendarEvent,
  hasValidCredentials,
  getNearestAvailableSlot,
  createCustomEvent
}; 