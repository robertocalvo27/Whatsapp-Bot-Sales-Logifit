const logger = require('./logger');

/**
 * Calcula el tiempo que tomaría a un humano escribir un mensaje
 * @param {string} message - Mensaje a analizar
 * @returns {number} - Tiempo en milisegundos
 */
function calculateTypingTime(message) {
  if (!message) return 0;
  
  // Velocidad promedio de escritura (caracteres por minuto)
  const AVG_TYPING_SPEED = 200;
  
  // Tiempo base para "leer y pensar" la respuesta (en ms)
  const BASE_THINKING_TIME = 2000;
  
  // Tiempo adicional por cada línea para simular lectura
  const TIME_PER_LINE = 500;
  
  // Contar líneas significativas (no vacías)
  const lines = message.split('\n').filter(line => line.trim().length > 0);
  
  // Calcular tiempo de escritura
  const messageLength = message.length;
  const typingTimeMs = (messageLength / AVG_TYPING_SPEED) * 60 * 1000;
  
  // Calcular tiempo de lectura/pensamiento
  const thinkingTime = BASE_THINKING_TIME + (lines.length * TIME_PER_LINE);
  
  // Añadir variación aleatoria (±20%)
  const variation = 0.2;
  const totalTime = typingTimeMs + thinkingTime;
  const randomFactor = 1 + (Math.random() * variation * 2 - variation);
  
  return Math.round(totalTime * randomFactor);
}

/**
 * Divide un mensaje largo en partes más naturales
 * @param {string} message - Mensaje completo
 * @returns {Array<string>} - Partes del mensaje
 */
function splitMessageIntoChunks(message) {
  if (!message) return [];
  
  // Dividir por párrafos
  const paragraphs = message.split('\n\n').filter(p => p.trim());
  
  // Si solo hay un párrafo y es corto, devolverlo como está
  if (paragraphs.length === 1 && message.length < 100) {
    return [message];
  }
  
  const chunks = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // Si el párrafo contiene una pregunta, es un buen punto para dividir
    if (paragraph.includes('?')) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      chunks.push(paragraph.trim());
    }
    // Si es un saludo o una frase corta inicial
    else if (paragraph.toLowerCase().includes('gracias') || 
             paragraph.toLowerCase().includes('hola') ||
             paragraph.length < 50) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    }
    // Para párrafos normales
    else {
      if (currentChunk) {
        currentChunk += '\n\n';
      }
      currentChunk += paragraph;
    }
  }
  
  // Añadir el último chunk si existe
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Simula el comportamiento de escritura humana
 * @param {string} message - Mensaje a humanizar
 * @returns {Promise<Array<{message: string, delay: number}>>} - Mensajes con sus delays
 */
async function humanizeResponse(message) {
  try {
    // Dividir el mensaje en partes más naturales
    const chunks = splitMessageIntoChunks(message);
    
    // Calcular delays para cada chunk
    const humanizedChunks = chunks.map(chunk => ({
      message: chunk,
      delay: calculateTypingTime(chunk)
    }));
    
    return humanizedChunks;
  } catch (error) {
    logger.error('Error al humanizar respuesta:', error);
    // En caso de error, devolver el mensaje original con un delay básico
    return [{
      message,
      delay: 2000
    }];
  }
}

module.exports = {
  humanizeResponse,
  calculateTypingTime,
  splitMessageIntoChunks
}; 