const { generateOpenAIResponse } = require('../services/openaiService');
const logger = require('../utils/logger');
const qualificationFlow = require('./qualificationFlow');
const { withHumanDelayAsync } = require('../utils/humanDelay');

class GreetingFlow {
  constructor() {
    this.vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Roberto Calvo';
    this.welcomeMessage = `¡Hola! 👋😊 Soy ${this.vendedorNombre}, tu Asesor Comercial en LogiFit. ¡Será un placer acompañarte en este recorrido! ¿Me ayudas compartiendo tu nombre y el de tu empresa, por favor? 📦🚀`;
  }

  /**
   * Analiza un mensaje para extraer nombre y empresa
   * @param {string} message - Mensaje a analizar
   * @returns {Object} - Resultado del análisis
   */
  analyzeMessage(message) {
    // Convertir a minúsculas para facilitar la búsqueda
    const lowerMessage = message.toLowerCase();
    
    // MEJORA: Detectar formato "Nombre de Empresa" directamente
    // Este patrón captura formatos como "René Medrano de Minera Uyama" o "Carlos Vargas de Aceros Arequipa"
    const fullPattern = /([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+) de ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+)/i;
    const fullMatch = message.match(fullPattern);
    if (fullMatch && fullMatch[1] && fullMatch[2]) {
      const name = fullMatch[1].trim();
      const company = fullMatch[2].trim();
      
      return {
        containsNameOrCompany: true,
        name,
        company,
        isIndependent: false,
        needsMoreInfo: false
      };
    }
    
    // Verificar primero si el mensaje comienza con "vengo de" para evitar que "vengo" se tome como nombre
    if (lowerMessage.startsWith('vengo de')) {
      // Caso especial para "Vengo de Empresa X"
      if (lowerMessage.includes('vengo de empresa')) {
        const match = message.match(/vengo de empresa\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+?)(?:\.|\s|$)/i);
        if (match && match[1]) {
          return {
            containsNameOrCompany: true,
            name: null,
            company: match[1].trim(),
            isIndependent: false,
            needsMoreInfo: false
          };
        }
      } else {
        // Caso general "Vengo de X"
        const match = message.match(/vengo de ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+?)(?:\.|\s|$)/i);
        if (match && match[1]) {
          // Verificar si la empresa contiene la palabra "empresa"
          const companyName = match[1].trim();
          if (companyName.toLowerCase().includes('empresa')) {
            // Extraer el nombre real de la empresa después de "empresa"
            const empresaMatch = companyName.match(/empresa\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+)/i);
            if (empresaMatch && empresaMatch[1]) {
              return {
                containsNameOrCompany: true,
                name: null,
                company: empresaMatch[1].trim(),
                isIndependent: false,
                needsMoreInfo: false
              };
            }
          }
          
          return {
            containsNameOrCompany: true,
            name: null,
            company: companyName,
            isIndependent: false,
            needsMoreInfo: false
          };
        }
      }
    }
    
    // Patrones para detectar nombres y empresas
    const namePatterns = [
      /(?:me llamo|soy|mi nombre es) ([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?:,| de| y| del| trabajo| mi| empresa| negocio|$)/i,
      /([A-Za-zÁÉÍÓÚáéíóúÑñ]+) (?:de la empresa|del negocio|de|from)/i,
      /hola,?\s+(?:soy|me llamo) ([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?:,|\.|\s|$)/i
    ];
    
    const companyPatterns = [
      /(?:empresa|compañía|negocio|trabajo en|trabajo para|de la empresa) ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+?)(?:\.|\s|$)/i,
      /(?:de|from|en|at) ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+?)(?:\.|\s|$)/i,
      /(?:soy de|vengo de) ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+?)(?:\.|\s|$)/i
    ];
    
    // Buscar nombre
    let name = null;
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        name = match[1].trim();
        // Limitar a 2 palabras para evitar incluir texto adicional
        const nameParts = name.split(' ').filter(part => part.length > 1);
        if (nameParts.length > 2) {
          name = nameParts.slice(0, 2).join(' ');
        }
        break;
      }
    }
    
    // Buscar empresa
    let company = null;
    let isIndependent = false;
    
    // Verificar si es independiente
    if (lowerMessage.includes('independiente') || 
        lowerMessage.includes('autónomo') || 
        lowerMessage.includes('freelance') ||
        lowerMessage.includes('por mi cuenta') ||
        lowerMessage.includes('conductor independiente')) {
      company = 'Independiente';
      isIndependent = true;
    } else {
      // Buscar nombre de empresa
      for (const pattern of companyPatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          company = match[1].trim();
          // Limitar a 3 palabras para evitar incluir texto adicional
          const companyParts = company.split(' ').filter(part => part.length > 1);
          if (companyParts.length > 3) {
            company = companyParts.slice(0, 3).join(' ');
          }
          break;
        }
      }
    }
    
    // Casos especiales
    if (lowerMessage.includes('soy') && lowerMessage.includes('de')) {
      const match = message.match(/soy ([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+) de ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+)/i);
      if (match && match[1] && match[2]) {
        name = match[1].trim();
        company = match[2].trim();
      }
    }
    
    // Caso especial para "trabajo en X"
    if (lowerMessage.includes('trabajo en') || lowerMessage.includes('trabajo para')) {
      const match = message.match(/trabajo (?:en|para) ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+?)(?:\.|\s|$)/i);
      if (match && match[1]) {
        company = match[1].trim();
      }
    }
    
    // Caso especial para "soy de X" o "vengo de X"
    if (lowerMessage.includes('soy de ') || lowerMessage.includes('vengo de ')) {
      const match = message.match(/(?:soy|vengo) de ([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+?)(?:\.|\s|$)/i);
      if (match && match[1]) {
        company = match[1].trim();
        
        // Si el mensaje comienza con "vengo de", probablemente no es un nombre
        if (lowerMessage.startsWith('vengo de')) {
          name = null;
        }
      }
    }
    
    // Limpiar palabras comunes que no son parte del nombre de la empresa
    if (company) {
      const commonWords = ['la', 'el', 'los', 'las', 'empresa', 'compañía', 'negocio'];
      for (const word of commonWords) {
        if (company.toLowerCase() === word) {
          company = null;
          break;
        }
      }
      
      // Si la empresa comienza con "Empresa", extraer lo que sigue
      if (company && company.toLowerCase().startsWith('empresa')) {
        const empresaMatch = company.match(/empresa\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s&.,]+)/i);
        if (empresaMatch && empresaMatch[1]) {
          company = empresaMatch[1].trim();
        }
      }
    }
    
    // Caso especial para "Hola, soy X"
    if (lowerMessage.includes('hola') && lowerMessage.includes('soy')) {
      const match = message.match(/hola,?\s+soy\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?:,|\.|\s|$)/i);
      if (match && match[1]) {
        name = match[1].trim();
      }
    }
    
    // MEJORA: Si no se ha detectado nombre o empresa, intentar extraer directamente del mensaje
    // Esto es útil para mensajes simples como "René Medrano de Minera Uyama"
    if (!name && !company) {
      // Dividir el mensaje por espacios
      const parts = message.split(' ');
      
      // Si hay al menos 3 palabras, intentar extraer nombre y empresa
      if (parts.length >= 3) {
        // Buscar la palabra "de" que podría separar nombre y empresa
        const deIndex = parts.findIndex(part => part.toLowerCase() === 'de');
        
        if (deIndex > 0 && deIndex < parts.length - 1) {
          // Extraer nombre (todo antes de "de")
          name = parts.slice(0, deIndex).join(' ');
          
          // Extraer empresa (todo después de "de")
          company = parts.slice(deIndex + 1).join(' ');
        }
      }
    }
    
    // Determinar si contiene nombre o empresa
    const containsNameOrCompany = name !== null || company !== null;
    
    return {
      containsNameOrCompany,
      name,
      company,
      isIndependent,
      needsMoreInfo: !containsNameOrCompany
    };
  }

  /**
   * Maneja el saludo inicial y extrae nombre y empresa
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  handleInitialGreeting = async (message, prospectState) => {
    try {
      let result;
      
      // Si es el primer mensaje o no hay estado de conversación, enviar mensaje de bienvenida
      if (!prospectState.conversationState) {
        result = {
          response: this.welcomeMessage,
          newState: {
            ...prospectState,
            conversationState: 'greeting',
            greetingAttempts: 1,
            lastInteraction: new Date()
          }
        };
      } else if (prospectState.conversationState === 'greeting') {
        // Si ya estamos en estado de greeting, analizar la respuesta para extraer nombre y empresa
        let messageAnalysis;
        
        try {
          // Primero intentar con el análisis local para respuestas rápidas
          messageAnalysis = this.analyzeMessage(message);
          logger.info('Análisis local de respuesta:', messageAnalysis);
          
          // Si el análisis local no detectó nombre o empresa y tenemos OpenAI, intentar con IA
          if ((!messageAnalysis.containsNameOrCompany || !messageAnalysis.name || !messageAnalysis.company) && 
              process.env.NODE_ENV !== 'test' && process.env.OPENAI_API_KEY) {
            
            // Usar OpenAI para analizar si el mensaje contiene nombre y empresa
            const analysisPrompt = `Analiza este mensaje de un prospecto y extrae su nombre y empresa (si la menciona).
            Si menciona que es independiente o autónomo, considera "Independiente" como su empresa.
            Si no menciona empresa pero da su nombre, extrae solo el nombre.
            Si no proporciona ni nombre ni empresa, indica que falta esta información.

            Mensaje: "${message}"

            Responde ÚNICAMENTE con un objeto JSON con esta estructura exacta:
            {
              "containsNameOrCompany": boolean,
              "name": string | null,
              "company": string | null,
              "isIndependent": boolean,
              "needsMoreInfo": boolean
            }`;

            const analysis = await generateOpenAIResponse({
              role: 'system',
              content: analysisPrompt
            });

            logger.info('Análisis de OpenAI:', analysis);

            // Intentar parsear la respuesta
            const parsedAnalysis = JSON.parse(analysis);
            
            // Verificar que tiene la estructura esperada
            if (typeof parsedAnalysis === 'object' && 
                'containsNameOrCompany' in parsedAnalysis &&
                'name' in parsedAnalysis &&
                'company' in parsedAnalysis) {
              
              // Si OpenAI encontró más información, usarla
              if (parsedAnalysis.containsNameOrCompany && 
                  (parsedAnalysis.name || parsedAnalysis.company)) {
                messageAnalysis = parsedAnalysis;
              }
            }
          }
        } catch (error) {
          logger.error('Error al analizar mensaje:', error.message);
          // Si hay error, mantener el análisis local original
        }

        // Si el mensaje contiene nombre o empresa, actualizar el estado y pasar a calificación
        if (messageAnalysis.containsNameOrCompany) {
          const newState = {
            ...prospectState,
            conversationState: 'initial_qualification',
            name: messageAnalysis.name || prospectState.name || 'Desconocido',
            company: messageAnalysis.company || prospectState.company || (messageAnalysis.isIndependent ? 'Independiente' : 'Desconocida'),
            isIndependent: messageAnalysis.isIndependent,
            lastInteraction: new Date()
          };

          // Mensaje de transición a la fase de calificación
          let response;
          if (newState.name !== 'Desconocido' && newState.company !== 'Desconocida') {
            // Pasar a QualificationFlow si tenemos nombre y empresa
            logger.info(`Nombre y empresa detectados: ${newState.name} de ${newState.company}. Pasando a calificación.`);
            result = await qualificationFlow.startQualification(message, newState);
          } else if (newState.name !== 'Desconocido') {
            response = `Gracias ${newState.name}. ¿Me podrías confirmar en qué empresa trabajas o si eres independiente?`;
            result = {
              response,
              newState
            };
          } else if (newState.company !== 'Desconocida') {
            response = `Gracias. Me gustaría entender mejor las necesidades de ${newState.company}. ¿Me podrías confirmar tu nombre?`;
            result = {
              response,
              newState
            };
          } else {
            response = `Gracias por tu mensaje. Para poder ayudarte mejor, ¿me podrías confirmar tu nombre y empresa?`;
            result = {
              response,
              newState
            };
          }
        } else {
          // Si no contiene nombre ni empresa, solicitar nuevamente
          const greetingAttempts = (prospectState.greetingAttempts || 1) + 1;
          
          let response;
          if (greetingAttempts <= 2) {
            response = `Disculpa, necesito tu nombre y empresa para poder ayudarte mejor. ¿Me los podrías proporcionar, por favor?`;
            result = {
              response,
              newState: {
                ...prospectState,
                greetingAttempts,
                lastInteraction: new Date()
              }
            };
          } else {
            // Después de 2 intentos, pasar a calificación con datos desconocidos
            const newState = {
              ...prospectState,
              conversationState: 'initial_qualification',
              name: prospectState.name || 'Desconocido',
              company: prospectState.company || 'Desconocida',
              lastInteraction: new Date()
            };
            
            // Pasar a QualificationFlow después de varios intentos
            result = await qualificationFlow.startQualification(message, newState);
          }
        }
      } else if (prospectState.conversationState === 'initial_qualification') {
        // Si ya estamos en calificación inicial, pasar el control a QualificationFlow
        result = await qualificationFlow.startQualification(message, prospectState);
      }
      
      // Aplicar retraso humanizado antes de devolver la respuesta
      return withHumanDelayAsync(Promise.resolve(result), result.response);
    } catch (error) {
      logger.error('Error en handleInitialGreeting:', error.message);
      
      // En caso de error, proporcionar una respuesta genérica
      const errorResponse = {
        response: `Disculpa, tuve un problema procesando tu mensaje. ¿Podrías intentar de nuevo? Estoy interesado en conocer tu nombre y empresa para poder ayudarte mejor.`,
        newState: {
          ...prospectState,
          conversationState: 'greeting',
          lastInteraction: new Date(),
          lastError: error.message
        }
      };
      
      // Aplicar retraso humanizado incluso para mensajes de error
      return withHumanDelayAsync(Promise.resolve(errorResponse), errorResponse.response);
    }
  }
}

module.exports = new GreetingFlow(); 