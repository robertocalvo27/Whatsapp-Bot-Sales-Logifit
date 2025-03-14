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
# Tipos de Prospectos
1. CURIOSO (Individual):
   - Busca información para uso personal
   - Preguntas directas sobre precio
   - Suele ser conductor directo
   - Interesado en compra individual
   - Prioridad: BAJA (no es target empresarial)

2. INFLUENCER (Interno):
   - Trabajador o empleado que quiere proponer la solución
   - No conoce bien el servicio de monitoreo
   - Puede ser supervisor o asistente
   - No es tomador final de decisiones
   - Prioridad: MEDIA (puede influir en decisión)

3. ENCARGADO (Decisor):
   - Poder de decisión o influencia directa
   - Profesional con conocimiento del problema
   - Cercano al dolor de monitoreo/impacto
   - Puede aprobar compras
   - Prioridad: ALTA (decisor clave)

# Criterios de Calificación
- Tamaño de flota (objetivo: mínimo 5 unidades)
- Nivel de decisión del contacto
- Conocimiento del problema de fatiga
- Urgencia de la necesidad
- Presupuesto disponible

# Estrategias por Tipo
CURIOSO:
- Educar sobre beneficios empresariales
- Identificar si tiene conexión con flotas
- No invertir mucho tiempo si es puramente individual

INFLUENCER:
- Proporcionar material educativo
- Ayudar a construir caso de negocio
- Identificar tomador de decisiones real
- Ofrecer demo si puede influir en decisión

ENCARGADO:
- Enfoque consultivo
- Demostración personalizada
- ROI y casos de éxito relevantes
- Agendar reunión prioritaria

# Señales de Calificación
ALTA:
- Menciona flota de vehículos
- Cargo directivo o gerencial
- Conoce problemática de fatiga
- Menciona presupuesto o proyecto
- Empresa reconocida o grande

MEDIA:
- Cargo supervisorio
- Muestra interés genuino
- Puede influir en decisiones
- Conoce operaciones

BAJA:
- Interés individual
- Sin poder de decisión
- Solo consulta precios
- No menciona empresa

# Instrucciones de Calificación
1. Identificar tipo de prospecto
2. Evaluar tamaño y relevancia de empresa
3. Determinar nivel de decisión
4. Calificar urgencia y necesidad
5. Recomendar siguiente acción:
   - REUNIÓN: Para prospectos calificados
   - EDUCAR: Para influencers con potencial
   - NUTRIR: Para curiosos con conexiones
   - DESCARTAR: Para individuales sin potencial`;

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
 * Limpia una respuesta de OpenAI para asegurar que es un JSON válido
 * @param {string} response - Respuesta de OpenAI
 * @returns {string} - JSON limpio
 */
function cleanJsonResponse(response) {
  try {
    // Remover cualquier markdown o texto antes/después del JSON
    let cleaned = response.trim();
    
    // Si la respuesta está envuelta en backticks, removerlos
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    // Limpiar espacios y saltos de línea
    cleaned = cleaned.trim();
    
    // Validar que es un JSON válido
    JSON.parse(cleaned);
    
    return cleaned;
  } catch (error) {
    logger.error('Error al limpiar respuesta JSON:', error);
    throw new Error('No se pudo limpiar la respuesta JSON');
  }
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

    // Determinar si la respuesta debe ser JSON
    const shouldReturnJson = message.content.includes('JSON') || 
                           message.content.includes('json') ||
                           message.content.toLowerCase().includes('formato json');
    
    // Llamar a la API de OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages,
      temperature: shouldReturnJson ? 0.1 : 0.7,
      max_tokens: 500,
      response_format: shouldReturnJson ? { type: "json_object" } : undefined
    });
    
    // Extraer la respuesta
    let response = completion.choices[0].message.content;

    // Si se espera JSON, limpiar y validar el formato
    if (shouldReturnJson) {
      try {
        response = cleanJsonResponse(response);
      } catch (error) {
        logger.error('Error al procesar respuesta JSON de OpenAI:', error);
        // En caso de error de formato, devolver un JSON por defecto
        return JSON.stringify({
          error: 'Error al procesar respuesta',
          fallback: true,
          originalResponse: response
        });
      }
    }

    return response;
  } catch (error) {
    logger.error('Error al generar respuesta con OpenAI:', error);
    
    if (error.response?.status === 429) {
      logger.error('Error de límite de tasa en OpenAI');
      throw new Error('Límite de tasa excedido en OpenAI');
    }
    
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
      model: 'gpt-4',
      messages: messages,
      temperature: 0.1,
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

/**
 * Analiza el tipo de prospecto y su potencial
 * @param {Object} prospectData - Datos del prospecto
 * @returns {Promise<Object>} - Análisis del prospecto
 */
async function analyzeProspect(prospectData) {
  try {
    if (!openai) {
      return generateMockProspectAnalysis();
    }

    const messages = [
      {
        role: 'system',
        content: `${KNOWLEDGE_BASE}\n\nEres un experto en calificación de prospectos B2B para una solución empresarial de control de fatiga. Analiza la información proporcionada y determina el tipo de prospecto, su potencial y la siguiente acción recomendada.`
      },
      {
        role: 'user',
        content: `Analiza este prospecto:
        Nombre: ${prospectData.name}
        Empresa: ${prospectData.company}
        Cargo: ${prospectData.position || 'No especificado'}
        Campaña: ${prospectData.campaignType}
        Mensaje inicial: ${prospectData.initialMessage}
        Información adicional: ${prospectData.companyInfo ? JSON.stringify(prospectData.companyInfo) : 'No disponible'}
        
        Determina:
        1. Tipo de prospecto (CURIOSO, INFLUENCER, ENCARGADO)
        2. Potencial (ALTO, MEDIO, BAJO)
        3. Siguiente acción recomendada
        4. Razones del análisis
        
        Responde en formato JSON.`
      }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    logger.error('Error al analizar prospecto:', error);
    return generateMockProspectAnalysis();
  }
}

function generateMockProspectAnalysis() {
  return {
    prospectType: ['CURIOSO', 'INFLUENCER', 'ENCARGADO'][Math.floor(Math.random() * 3)],
    potential: ['ALTO', 'MEDIO', 'BAJO'][Math.floor(Math.random() * 3)],
    nextAction: ['REUNIÓN', 'EDUCAR', 'NUTRIR', 'DESCARTAR'][Math.floor(Math.random() * 4)],
    reasoning: 'Análisis simulado para modo de prueba'
  };
}

module.exports = {
  generateOpenAIResponse,
  analyzeResponseRelevance,
  analyzeProspect
}; 