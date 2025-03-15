/**
 * Utilidad para simular retrasos humanizados en las respuestas
 * 
 * Esta utilidad calcula y aplica retrasos basados en la longitud del mensaje
 * para simular el tiempo que le tomaría a un humano escribir una respuesta.
 */

/**
 * Calcula el tiempo de escritura basado en la longitud del mensaje
 * @param {string} message - El mensaje a enviar
 * @param {number} wpm - Palabras por minuto (velocidad de escritura)
 * @returns {number} - Tiempo en milisegundos
 */
function calculateTypingTime(message, wpm = 40) {
  if (!message) return 0;
  
  // Estimar el número de palabras (aproximadamente 5 caracteres por palabra)
  const words = message.length / 5;
  
  // Calcular tiempo en minutos y convertir a milisegundos
  const minutes = words / wpm;
  const milliseconds = minutes * 60 * 1000;
  
  // Añadir un poco de variabilidad (±20%)
  const variability = 0.2;
  const randomFactor = 1 + (Math.random() * variability * 2 - variability);
  
  // Establecer límites más razonables:
  // - Mínimo 1 segundo para mensajes muy cortos
  // - Máximo 5 segundos para mensajes largos
  // - Mensajes muy largos (más de 200 caracteres) pueden tomar hasta 7 segundos
  let maxTime = 5000;
  if (message.length > 200) {
    maxTime = 7000;
  }
  
  return Math.min(Math.max(milliseconds * randomFactor, 1000), maxTime);
}

/**
 * Aplica un retraso humanizado antes de ejecutar una función
 * @param {Function} fn - Función a ejecutar después del retraso
 * @param {string} message - Mensaje que determina el tiempo de retraso
 * @returns {Promise} - Promesa que se resuelve después del retraso
 */
function withHumanDelay(fn, message) {
  const delay = calculateTypingTime(message);
  
  return new Promise(resolve => {
    setTimeout(() => {
      const result = fn();
      resolve(result);
    }, delay);
  });
}

/**
 * Aplica un retraso humanizado antes de resolver una promesa
 * @param {Promise} promise - Promesa a resolver después del retraso
 * @param {string} message - Mensaje que determina el tiempo de retraso
 * @returns {Promise} - Promesa que se resuelve después del retraso
 */
async function withHumanDelayAsync(promise, message) {
  const delay = calculateTypingTime(message);
  
  // Esperar el retraso
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Resolver la promesa original
  return promise;
}

module.exports = {
  calculateTypingTime,
  withHumanDelay,
  withHumanDelayAsync
}; 