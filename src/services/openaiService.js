const OpenAI = require('openai');
const { logger } = require('../utils/logger');

// Inicializar cliente de OpenAI si hay una API key válida
let openai;
try {
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('tu_')) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  } else {
    logger.warn('No se ha configurado una API key válida para OpenAI. Usando respuestas simuladas.');
  }
} catch (error) {
  logger.error('Error al inicializar OpenAI:', error);
}

// Base de conocimiento para el asistente
const KNOWLEDGE_BASE = `
# Información de la Empresa
Somos una empresa dedicada a [descripción de la empresa y sus productos/servicios].
Nuestros principales productos/servicios son:
- [Producto/Servicio 1]: [Descripción breve]
- [Producto/Servicio 2]: [Descripción breve]
- [Producto/Servicio 3]: [Descripción breve]

# Información de Campañas
Actualmente tenemos las siguientes campañas activas:
- [Campaña 1]: [Descripción y beneficios]
- [Campaña 2]: [Descripción y beneficios]

# Precios y Promociones
- [Producto/Servicio 1]: [Precio] con [Promoción actual si existe]
- [Producto/Servicio 2]: [Precio] con [Promoción actual si existe]

# Proceso de Venta
1. Consulta inicial
2. Demostración/Presentación personalizada
3. Propuesta formal
4. Cierre de venta

# Preguntas Frecuentes
P: [Pregunta frecuente 1]
R: [Respuesta 1]

P: [Pregunta frecuente 2]
R: [Respuesta 2]

# Instrucciones para el Asistente
- Sé amable y profesional en todo momento.
- Si detectas un alto interés, ofrece programar una cita con un asesor.
- Si no conoces la respuesta a una pregunta específica, ofrece consultar con un especialista.
- Nunca inventes información sobre precios o características de productos.
- Si el cliente muestra frustración o enojo, ofrece conectarlo con un asesor humano.
- Identifica prospectos de alta calidad basándote en su interés específico, preguntas detalladas y disposición para avanzar en el proceso de venta.
`;

/**
 * Genera respuestas simuladas para modo de prueba
 * @param {Object} message - Mensaje a procesar
 * @returns {string} - Respuesta simulada
 */
function generateMockResponse(message) {
  const content = message?.content || '';
  
  // Respuestas simuladas para análisis de interés
  if (content.includes('Analiza las siguientes respuestas de un prospecto')) {
    return JSON.stringify({
      highInterest: Math.random() > 0.7, // 30% de probabilidad de alto interés
      interestScore: Math.floor(Math.random() * 10) + 1,
      shouldOfferAppointment: Math.random() > 0.5,
      reasoning: 'Análisis simulado para modo de prueba'
    });
  }
  
  // Respuesta para validación de interés en cita
  if (content.includes('Determina si está interesado en programar una cita')) {
    return Math.random() > 0.5 ? 'CITA' : 'INFO';
  }
  
  // Respuesta para consultas adicionales después de cita
  if (content.includes('Determina si tiene alguna consulta adicional')) {
    return Math.random() > 0.7 ? 'CONSULTA' : 'FINALIZAR';
  }
  
  // Respuesta simulada para análisis de relevancia
  if (content.includes('Analiza si la siguiente respuesta es relevante')) {
    return JSON.stringify({
      isRelevant: Math.random() > 0.3, // 70% de probabilidad de ser relevante
      shouldContinue: Math.random() > 0.2, // 80% de probabilidad de continuar
      suggestedResponse: 'Respuesta sugerida simulada para modo de prueba',
      reasoning: 'Análisis simulado para modo de prueba'
    });
  }
  
  // Respuesta genérica para consultas
  return `Esta es una respuesta simulada para modo de prueba. En un entorno real, aquí se generaría una respuesta personalizada usando OpenAI basada en la consulta: "${content.substring(0, 50)}..."`;
}

/**
 * Genera una respuesta usando OpenAI
 * @param {Object} message - Mensaje a enviar a OpenAI
 * @returns {Promise<string>} - Respuesta generada
 */
async function generateOpenAIResponse(message) {
  try {
    // Verificar si estamos en modo de prueba
    if (!openai) {
      return generateMockResponse(message);
    }
    
    // Preparar mensajes para la API
    const messages = [
      {
        role: 'system',
        content: `${KNOWLEDGE_BASE}\n\nEres un asistente virtual de ventas amable y profesional. Tu objetivo es ayudar a los clientes potenciales, responder sus preguntas y, cuando sea apropiado, programar citas con asesores humanos.`
      }
    ];
    
    // Añadir el mensaje del usuario
    if (message) {
      messages.push(message);
    }
    
    // Llamar a la API de OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',  // Puedes cambiar a un modelo más económico como 'gpt-3.5-turbo'
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });
    
    // Extraer y devolver la respuesta
    return completion.choices[0].message.content;
  } catch (error) {
    logger.error('Error al generar respuesta con OpenAI:', error);
    
    // En caso de error, usar respuesta simulada
    return generateMockResponse(message);
  }
}

/**
 * Analiza si la respuesta del usuario es relevante a la pregunta actual
 * @param {string} question - Pregunta realizada al usuario
 * @param {string} answer - Respuesta del usuario
 * @returns {Promise<Object>} - Resultado del análisis
 */
async function analyzeResponseRelevance(question, answer) {
  try {
    // Verificar si estamos en modo de prueba
    if (!openai) {
      return JSON.parse(generateMockResponse({
        content: `Analiza si la siguiente respuesta es relevante a la pregunta: "${question}". Respuesta: "${answer}"`
      }));
    }
    
    // Preparar mensajes para la API
    const messages = [
      {
        role: 'system',
        content: `Eres un asistente analítico que evalúa si las respuestas de los usuarios son relevantes a las preguntas que se les hacen. 
        
        Debes determinar:
        1. Si la respuesta es relevante a la pregunta (isRelevant: true/false)
        2. Si se debe continuar con la siguiente pregunta o abordar lo que el usuario está diciendo (shouldContinue: true/false)
        3. Una respuesta sugerida basada en el análisis (suggestedResponse: string)
        4. El razonamiento detrás de tu análisis (reasoning: string)
        
        Responde en formato JSON con estos campos.`
      },
      {
        role: 'user',
        content: `Analiza si la siguiente respuesta es relevante a la pregunta.
        
        Pregunta: "${question}"
        Respuesta: "${answer}"
        
        Proporciona tu análisis en formato JSON.`
      }
    ];
    
    // Llamar a la API de OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    // Extraer y parsear la respuesta JSON
    const responseText = completion.choices[0].message.content;
    return JSON.parse(responseText);
  } catch (error) {
    logger.error('Error al analizar relevancia de respuesta con OpenAI:', error);
    
    // En caso de error, devolver un resultado por defecto
    return {
      isRelevant: true, // Asumir que es relevante por defecto
      shouldContinue: true, // Asumir que se debe continuar por defecto
      suggestedResponse: "Gracias por tu respuesta. Continuemos con la siguiente pregunta.",
      reasoning: "Error al analizar la respuesta, continuando con el flujo normal."
    };
  }
}

module.exports = {
  generateOpenAIResponse,
  analyzeResponseRelevance
}; 