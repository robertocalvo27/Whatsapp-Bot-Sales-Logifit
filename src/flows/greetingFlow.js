const { generateOpenAIResponse } = require('../services/openaiService');
const { logger } = require('../utils/logger');

class GreetingFlow {
  constructor() {
    this.vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Roberto Calvo';
  }

  handleInitialGreeting = async (message, prospectState) => {
    try {
      // Usar OpenAI para analizar el mensaje y determinar el contexto
      const analysisPrompt = `Analiza este mensaje inicial de un prospecto y responde con un objeto JSON que tenga exactamente esta estructura:
      {
        "isMarketingCampaign": boolean,
        "campaignType": "FACEBOOK" | "WHATSAPP" | "GENERAL",
        "mentionsProduct": boolean,
        "name": string | null,
        "company": string | null,
        "interestLevel": "ALTO" | "MEDIO" | "BAJO"
      }

      Mensaje a analizar: "${message}"

      IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin texto adicional ni formato markdown.`;

      let messageAnalysis = {
        isMarketingCampaign: false,
        campaignType: 'GENERAL',
        mentionsProduct: false,
        name: null,
        company: null,
        interestLevel: 'MEDIO'
      };

      try {
        const analysis = await generateOpenAIResponse({
          role: 'system',
          content: analysisPrompt
        });

        logger.info('Respuesta de OpenAI (análisis):', analysis);

        // Intentar parsear la respuesta
        const parsedAnalysis = JSON.parse(analysis);
        
        // Validar que el objeto tiene la estructura esperada
        const requiredFields = ['isMarketingCampaign', 'campaignType', 'mentionsProduct', 'name', 'company', 'interestLevel'];
        const missingFields = requiredFields.filter(field => !(field in parsedAnalysis));
        
        if (missingFields.length === 0) {
          messageAnalysis = parsedAnalysis;
          logger.info('Análisis del mensaje:', messageAnalysis);
        } else {
          logger.warn(`Faltan campos en la respuesta de OpenAI: ${missingFields.join(', ')}`);
        }
      } catch (error) {
        logger.error('Error procesando análisis del mensaje:', error);
      }

      // Actualizar el estado con la información analizada
      const newState = {
        ...prospectState,
        conversationState: 'initial_qualification',
        name: messageAnalysis.name || prospectState.name,
        company: messageAnalysis.company || prospectState.company,
        campaign: {
          source: messageAnalysis.campaignType,
          type: messageAnalysis.isMarketingCampaign ? 'CAMPAIGN' : 'ORGANIC'
        },
        lastInteraction: new Date()
      };

      logger.info('Nuevo estado:', newState);

      // Generar saludo personalizado con OpenAI
      const greetingPrompt = `Genera un saludo inicial amigable y profesional para un prospecto.

      Contexto:
      - Nombre del vendedor: ${this.vendedorNombre}
      - Nombre del prospecto: ${newState.name || 'No proporcionado'}
      - Empresa: ${newState.company || 'No proporcionada'}
      - Tipo de campaña: ${messageAnalysis.campaignType}
      - Menciona producto: ${messageAnalysis.mentionsProduct ? 'Sí' : 'No'}
      - Nivel de interés: ${messageAnalysis.interestLevel}
      
      Requisitos:
      1. Máximo 3 líneas de texto
      2. Mencionar Smart Bands si viene de una campaña específica
      3. Si no proporcionó nombre y empresa, solicitarlos
      4. Usar máximo 2 emojis
      5. NO mencionar precios ni descuentos
      
      IMPORTANTE: Responde SOLO con el texto del saludo, sin comillas, markdown ni formato adicional.`;

      let greeting;
      try {
        greeting = await generateOpenAIResponse({
          role: 'system',
          content: greetingPrompt
        });

        logger.info('Respuesta de OpenAI (saludo):', greeting);

        // Asegurar que el saludo es una cadena de texto
        if (typeof greeting !== 'string') {
          greeting = JSON.stringify(greeting);
        }

        // Limpiar el saludo de cualquier formato
        greeting = greeting.replace(/^["'\`]+|["'\`]+$/g, '').trim();
      } catch (error) {
        logger.error('Error generando saludo:', error);
        greeting = `¡Hola! 👋 Soy ${this.vendedorNombre}, tu Asesor Comercial en LogiFit.

¿Me ayudas compartiendo tu nombre y si trabajas en alguna empresa o eres conductor independiente? 📦`;
      }

      return {
        response: greeting,
        newState
      };
    } catch (error) {
      logger.error('Error en handleInitialGreeting:', error);
      
      // Respuesta por defecto en caso de error
      const defaultResponse = `¡Hola! 👋 Soy ${this.vendedorNombre}, tu Asesor Comercial en LogiFit.

¿Me ayudas compartiendo tu nombre y si trabajas en alguna empresa o eres conductor independiente? 📦`;
      
      return {
        response: defaultResponse,
        newState: {
          ...prospectState,
          conversationState: 'greeting',
          lastInteraction: new Date()
        }
      };
    }
  }
}

module.exports = new GreetingFlow(); 