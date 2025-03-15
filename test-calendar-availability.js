require('dotenv').config();
const moment = require('moment-timezone');
const { getNearestAvailableSlot } = require('./src/services/calendarService');

/**
 * Prueba la funcionalidad de obtener el slot disponible más cercano
 */
async function testNearestAvailableSlot() {
  console.log('=== PRUEBA DE OBTENCIÓN DE SLOT DISPONIBLE MÁS CERCANO ===\n');
  
  try {
    // Obtener slot disponible más cercano para hoy
    console.log('1. Obteniendo slot disponible más cercano para hoy...\n');
    const nearestSlot = await getNearestAvailableSlot('America/Lima', 1);
    
    console.log('Slot disponible más cercano:');
    console.log(`- Fecha: ${nearestSlot.date}`);
    console.log(`- Hora: ${nearestSlot.time}`);
    console.log(`- Es hoy: ${nearestSlot.isToday ? 'Sí' : 'No'}`);
    console.log(`- Es mañana: ${nearestSlot.isTomorrow ? 'Sí' : 'No'}`);
    console.log(`- Es simulado: ${nearestSlot.isSimulated ? 'Sí' : 'No'}`);
    
    // Obtener slots disponibles para los próximos 3 días
    console.log('\n2. Obteniendo slots disponibles para los próximos 3 días...\n');
    const futureSlotsPromises = [];
    
    // Obtener 3 slots diferentes
    for (let i = 1; i <= 3; i++) {
      futureSlotsPromises.push(getNearestAvailableSlot('America/Lima', i));
    }
    
    const futureSlots = await Promise.all(futureSlotsPromises);
    
    // Mostrar slots obtenidos
    futureSlots.forEach((slot, index) => {
      console.log(`Slot #${index + 1}:`);
      console.log(`- Fecha: ${slot.date}`);
      console.log(`- Hora: ${slot.time}`);
      console.log(`- Es hoy: ${slot.isToday ? 'Sí' : 'No'}`);
      console.log(`- Es mañana: ${slot.isTomorrow ? 'Sí' : 'No'}`);
      console.log(`- Es simulado: ${slot.isSimulated ? 'Sí' : 'No'}`);
      console.log('');
    });
    
    // Simular el flujo de conversación
    console.log('\n3. Simulando flujo de conversación...\n');
    
    // Simular respuesta positiva del cliente
    console.log('Cliente: "Sí, me interesa una demostración"');
    console.log(`Bot: "¡Excelente! ¿Te parece bien ${nearestSlot.isToday ? 'hoy' : nearestSlot.isTomorrow ? 'mañana' : 'el ' + nearestSlot.date} a las ${nearestSlot.time}? Te enviaré el link de Google Meet para conectarnos."`);
    
    // Simular respuesta negativa del cliente
    console.log('\nCliente: "No puedo a esa hora"');
    
    // Mostrar alternativas
    if (futureSlots.length >= 2) {
      const slot1 = futureSlots[0];
      const slot2 = futureSlots[1];
      
      const slot1Desc = slot1.isToday ? 'hoy' : slot1.isTomorrow ? 'mañana' : 'el ' + slot1.date;
      const slot2Desc = slot2.isToday ? 'hoy' : slot2.isTomorrow ? 'mañana' : 'el ' + slot2.date;
      
      console.log(`Bot: "Entiendo que ese horario no te funciona. Te propongo estas alternativas:

1. ${slot1Desc} a las ${slot1.time}
2. ${slot2Desc} a las ${slot2.time}

¿Cuál de estas opciones te funciona mejor?"`);
    }
    
    // Simular propuesta del cliente
    console.log('\nCliente: "Prefiero el viernes a las 10:00"');
    
    // Verificar si la propuesta es válida
    const proposedDate = moment().day(5).hour(10).minute(0); // Viernes a las 10:00
    const isValidTime = isValidProposedTime(proposedDate);
    
    if (isValidTime) {
      console.log(`Bot: "Perfecto, agendaré la reunión para el ${proposedDate.format('DD/MM/YYYY')} a las ${proposedDate.format('HH:mm')}. 

¿Me podrías proporcionar tu correo electrónico corporativo para enviarte la invitación?"`);
    } else {
      console.log(`Bot: "Lo siento, pero el horario que propones no está dentro de nuestro horario laboral o ya ha pasado. Nuestro horario de atención es de lunes a viernes de 9:00 a 18:00 hrs.

¿Podrías proponerme otro horario que te funcione dentro de ese rango?"`);
    }
    
    console.log('\n=== PRUEBAS COMPLETADAS ===');
  } catch (error) {
    console.error('Error en las pruebas:', error);
  }
}

/**
 * Verifica si una fecha y hora propuesta es válida (horario laboral y no en el pasado)
 * @param {Object} proposedDate - Fecha propuesta (objeto moment)
 * @returns {boolean} - True si la fecha es válida
 */
function isValidProposedTime(proposedDate) {
  // Verificar que no sea en el pasado
  if (proposedDate.isBefore(moment())) {
    return false;
  }
  
  // Verificar que sea día laboral (lunes a viernes)
  const day = proposedDate.day();
  if (day === 0 || day === 6) { // 0 = domingo, 6 = sábado
    return false;
  }
  
  // Verificar que sea horario laboral (9:00 - 18:00)
  const hour = proposedDate.hour();
  if (hour < 9 || hour >= 18) {
    return false;
  }
  
  // Verificar que no sea hora de almuerzo (13:00 - 14:00)
  if (hour === 13) {
    return false;
  }
  
  return true;
}

// Ejecutar pruebas
testNearestAvailableSlot(); 