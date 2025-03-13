require('dotenv').config();
const OpenAI = require('openai');

// Verificar si tenemos una API key válida
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('tu_')) {
  console.error('No se ha configurado una API key válida para OpenAI.');
  console.error('Por favor, configura la variable OPENAI_API_KEY en el archivo .env');
  process.exit(1);
}

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Base de conocimiento para el asistente (ejemplo)
const KNOWLEDGE_BASE = `
# Información de la Empresa
Somos una empresa dedicada a la venta de productos tecnológicos de alta calidad.
Nuestros principales productos son:
- Laptops: Equipos de última generación con procesadores Intel y AMD
- Smartphones: Dispositivos de gama alta y media con las mejores características
- Accesorios: Periféricos, audífonos, cargadores y más

# Información de Campañas
Actualmente tenemos las siguientes campañas activas:
- Campaña Back to School: 15% de descuento en laptops para estudiantes
- Campaña Renovación Tecnológica: Descuentos por entregar tu equipo antiguo

# Precios y Promociones
- Laptops: Desde $12,000 MXN con 12 meses sin intereses
- Smartphones: Desde $5,000 MXN con 6 meses sin intereses
- Accesorios: Descuentos del 20% al comprar un equipo principal

# Proceso de Venta
1. Consulta inicial y evaluación de necesidades
2. Demostración de equipos y características
3. Propuesta personalizada
4. Cierre de venta y configuración inicial

# Preguntas Frecuentes
P: ¿Ofrecen garantía extendida?
R: Sí, ofrecemos garantía extendida de hasta 3 años en todos nuestros productos.

P: ¿Realizan envíos a todo el país?
R: Sí, realizamos envíos a todo México con costos variables según la ubicación.
`;

// Función para generar una respuesta usando OpenAI
async function generateResponse(userMessage) {
  try {
    console.log(`Generando respuesta para: "${userMessage}"`);
    
    // Preparar mensajes para la API
    const messages = [
      {
        role: 'system',
        content: `${KNOWLEDGE_BASE}\n\nEres un asistente virtual de ventas amable y profesional. Tu objetivo es ayudar a los clientes potenciales, responder sus preguntas y, cuando sea apropiado, programar citas con asesores humanos.`
      },
      {
        role: 'user',
        content: userMessage
      }
    ];
    
    // Llamar a la API de OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',  // Puedes cambiar a un modelo más económico como 'gpt-3.5-turbo'
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });
    
    // Extraer y devolver la respuesta
    const response = completion.choices[0].message.content;
    console.log('\nRespuesta generada:');
    console.log('-------------------');
    console.log(response);
    console.log('-------------------');
    
    return response;
  } catch (error) {
    console.error('Error al generar respuesta con OpenAI:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    return null;
  }
}

// Función para analizar el interés de un prospecto
async function analyzeProspectInterest(answers) {
  try {
    console.log('Analizando interés del prospecto...');
    
    // Convertir las respuestas a formato de texto
    const answersText = Object.entries(answers)
      .map(([question, answer]) => `${question}: ${answer}`)
      .join('\n');
    
    console.log('\nRespuestas del prospecto:');
    console.log('------------------------');
    console.log(answersText);
    console.log('------------------------');
    
    // Consultar a OpenAI para analizar el interés
    const messages = [
      {
        role: 'system',
        content: `Analiza las siguientes respuestas de un prospecto para determinar su nivel de interés en nuestros productos/servicios.
        
        Respuestas del prospecto:
        ${answersText}
        
        Proporciona un análisis en formato JSON con los siguientes campos:
        - highInterest: booleano que indica si el prospecto muestra un alto nivel de interés
        - interestScore: puntuación de 1 a 10 del nivel de interés
        - shouldOfferAppointment: booleano que indica si deberíamos ofrecer programar una cita
        - reasoning: breve explicación de tu análisis
        
        IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin ningún texto adicional, comillas de código o formato markdown.`
      }
    ];
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });
    
    const analysisText = completion.choices[0].message.content;
    console.log('\nAnálisis generado:');
    console.log('------------------');
    console.log(analysisText);
    console.log('------------------');
    
    // Intentar parsear la respuesta como JSON
    try {
      const analysis = JSON.parse(analysisText);
      console.log('\nAnálisis parseado:');
      console.log(`- Alto interés: ${analysis.highInterest ? 'Sí' : 'No'}`);
      console.log(`- Puntuación de interés: ${analysis.interestScore}/10`);
      console.log(`- Ofrecer cita: ${analysis.shouldOfferAppointment ? 'Sí' : 'No'}`);
      console.log(`- Razonamiento: ${analysis.reasoning}`);
      
      return analysis;
    } catch (e) {
      console.error('Error al parsear análisis de interés:', e.message);
      console.error('Respuesta no es un JSON válido');
      return null;
    }
  } catch (error) {
    console.error('Error al analizar interés del prospecto:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    return null;
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('=== PRUEBA DE CONEXIÓN CON OPENAI ===\n');
  
  // Prueba 1: Generar respuesta a una pregunta simple
  console.log('1. Generando respuesta a una pregunta simple...\n');
  await generateResponse('Hola, me interesa comprar una laptop para mi hijo que va a la universidad. ¿Qué me recomiendan?');
  
  // Prueba 2: Analizar interés de un prospecto con alto interés
  console.log('\n2. Analizando interés de un prospecto con alto interés...\n');
  await analyzeProspectInterest({
    '¿Cuál es tu nombre completo?': 'Juan Pérez González',
    '¿En qué ciudad te encuentras?': 'Ciudad de México',
    '¿Qué te interesó de nuestra publicidad?': 'Vi que tienen laptops con buenos descuentos para estudiantes y mi hijo necesita una para la universidad',
    '¿Has considerado adquirir nuestros productos/servicios anteriormente?': 'Sí, compré un smartphone con ustedes hace un año y quedé muy satisfecho con el servicio'
  });
  
  // Prueba 3: Analizar interés de un prospecto con bajo interés
  console.log('\n3. Analizando interés de un prospecto con bajo interés...\n');
  await analyzeProspectInterest({
    '¿Cuál es tu nombre completo?': 'María Rodríguez',
    '¿En qué ciudad te encuentras?': 'Guadalajara',
    '¿Qué te interesó de nuestra publicidad?': 'Solo estaba viendo opciones, no tengo intención de comprar pronto',
    '¿Has considerado adquirir nuestros productos/servicios anteriormente?': 'No, es la primera vez que conozco su empresa'
  });
  
  console.log('\n=== PRUEBAS COMPLETADAS ===');
}

// Ejecutar pruebas
runTests(); 