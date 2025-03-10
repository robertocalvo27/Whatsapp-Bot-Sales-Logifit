const { generateOpenAIResponse } = require('./openaiService');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

/**
 * Convierte un archivo de audio a texto usando OpenAI Whisper
 * @param {string} audioPath - Ruta del archivo de audio
 * @returns {Promise<string>} - Texto transcrito
 */
async function transcribeAudio(audioPath) {
  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(audioPath)) {
      throw new Error(`El archivo de audio no existe: ${audioPath}`);
    }
    
    // Crear FormData para enviar a OpenAI
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('model', 'whisper-1');
    formData.append('language', 'es');
    
    // Enviar a OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    
    return response.data.text;
  } catch (error) {
    logger.error('Error al transcribir audio:', error);
    throw new Error('No se pudo transcribir el audio');
  }
}

/**
 * Procesa un mensaje de audio
 * @param {string} audioPath - Ruta del archivo de audio
 * @param {Object} prospectState - Estado del prospecto
 * @returns {Promise<Object>} - Texto transcrito y contexto
 */
async function processAudioMessage(audioPath, prospectState) {
  try {
    // Transcribir audio
    const transcription = await transcribeAudio(audioPath);
    
    logger.info(`Audio transcrito: "${transcription}"`);
    
    // Eliminar archivo temporal
    try {
      fs.unlinkSync(audioPath);
    } catch (error) {
      logger.warn(`No se pudo eliminar el archivo temporal: ${audioPath}`);
    }
    
    // Analizar contexto del mensaje
    const contextPrompt = `
    El siguiente es un mensaje de audio transcrito de un prospecto interesado en nuestro sistema de control de fatiga y somnolencia:
    
    "${transcription}"
    
    Basado en este mensaje, proporciona un análisis en formato JSON con los siguientes campos:
    - intent: la intención principal del mensaje (greeting, question, confirmation, rejection, other)
    - sentiment: el sentimiento general (positive, neutral, negative)
    - keywords: palabras clave importantes en el mensaje
    - hasTimeReference: si menciona alguna hora o fecha
    - hasEmailReference: si menciona algún correo electrónico
    - hasCompanyReference: si menciona alguna empresa
    - hasQuantityReference: si menciona cantidades o números
    
    IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin ningún texto adicional.`;
    
    const contextAnalysis = await generateOpenAIResponse({
      role: 'system',
      content: contextPrompt
    });
    
    let context;
    try {
      context = JSON.parse(contextAnalysis);
    } catch (error) {
      logger.error('Error al parsear análisis de contexto:', error);
      context = {
        intent: 'other',
        sentiment: 'neutral',
        keywords: [],
        hasTimeReference: false,
        hasEmailReference: false,
        hasCompanyReference: false,
        hasQuantityReference: false
      };
    }
    
    return {
      transcription,
      context
    };
  } catch (error) {
    logger.error('Error al procesar mensaje de audio:', error);
    throw error;
  }
}

module.exports = {
  processAudioMessage
}; 