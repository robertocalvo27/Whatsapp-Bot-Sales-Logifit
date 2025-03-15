const { generateOpenAIResponse, analyzeProspect } = require('../services/openaiService');
const logger = require('../utils/logger');
const { withHumanDelayAsync } = require('../utils/humanDelay');

class QualificationFlow {
  constructor() {
    this.vendedorNombre = process.env.VENDEDOR_NOMBRE || 'Roberto Calvo';
  }

  /**
   * Analiza el mensaje del usuario para detectar su rol en la empresa
   * @param {string} message - Mensaje del usuario
   * @returns {Object} - Objeto con el rol detectado, si es tomador de decisiones y áreas de interés
   */
  analyzeRole(message) {
    const messageLower = message.toLowerCase();
    
    // Patrones para detectar roles
    const transportPatterns = [
      'gerente de transporte', 'director de transporte', 'jefe de transporte', 
      'encargado de transporte', 'responsable de transporte', 'coordinador de transporte',
      'gerente de flota', 'director de flota', 'jefe de flota', 'encargado de flota',
      'responsable de flota', 'coordinador de flota', 'supervisor de flota'
    ];
    
    const securityPatterns = [
      'gerente de seguridad', 'director de seguridad', 'jefe de seguridad',
      'encargado de seguridad', 'responsable de seguridad', 'coordinador de seguridad'
    ];
    
    const logisticsPatterns = [
      'gerente de logística', 'director de logística', 'jefe de logística',
      'encargado de logística', 'responsable de logística', 'coordinador de logística',
      'asistente de logística', 'asistente del área de logística'
    ];
    
    const highManagementPatterns = [
      'gerente general', 'director general', 'ceo', 'presidente', 'vicepresidente',
      'dueño', 'propietario', 'socio', 'fundador', 'director ejecutivo'
    ];
    
    // Patrones para detectar tomadores de decisiones
    const decisionMakerPatterns = [
      'yo decido', 'tomo las decisiones', 'soy quien decide', 'autorizo', 
      'tengo la última palabra', 'apruebo', 'mi decisión', 'decido yo'
    ];
    
    // Verificar roles específicos
    for (const pattern of transportPatterns) {
      if (messageLower.includes(pattern)) {
        return {
          role: 'Gerente de Transporte',
          isDecisionMaker: true,
          areas: ['transporte', 'logística']
        };
      }
    }
    
    for (const pattern of securityPatterns) {
      if (messageLower.includes(pattern)) {
        return {
          role: 'Director de Seguridad',
          isDecisionMaker: true,
          areas: ['seguridad', 'operaciones']
        };
      }
    }
    
    for (const pattern of logisticsPatterns) {
      if (messageLower.includes(pattern)) {
        return {
          role: 'Coordinador de Logística',
          isDecisionMaker: messageLower.includes('asistente') ? false : true,
          areas: ['logística', 'operaciones']
        };
      }
    }
    
    for (const pattern of highManagementPatterns) {
      if (messageLower.includes(pattern)) {
        return {
          role: 'Director General',
          isDecisionMaker: true,
          areas: ['dirección', 'estrategia']
        };
      }
    }
    
    // Detectar frases específicas sobre cargos
    if (messageLower.includes('mi cargo es') || messageLower.includes('mi puesto es')) {
      if (messageLower.includes('gerente de transporte')) {
        return {
          role: 'Gerente de Transporte',
          isDecisionMaker: true,
          areas: ['transporte', 'logística']
        };
      }
      
      if (messageLower.includes('director de seguridad')) {
        return {
          role: 'Director de Seguridad',
          isDecisionMaker: true,
          areas: ['seguridad', 'operaciones']
        };
      }
      
      if (messageLower.includes('coordinador de flota')) {
        return {
          role: 'Coordinador de Flota',
          isDecisionMaker: false,
          areas: ['transporte', 'operaciones']
        };
      }
    }
    
    // Detectar frases con "soy" o "trabajo como"
    if (messageLower.includes('soy el') || messageLower.includes('soy la') || 
        messageLower.includes('trabajo como') || messageLower.includes('trabajo de')) {
      
      if (messageLower.includes('gerente de transporte')) {
        return {
          role: 'Gerente de Transporte',
          isDecisionMaker: true,
          areas: ['transporte', 'logística']
        };
      }
      
      if (messageLower.includes('director de seguridad')) {
        return {
          role: 'Director de Seguridad',
          isDecisionMaker: true,
          areas: ['seguridad', 'operaciones']
        };
      }
      
      if (messageLower.includes('asistente')) {
        return {
          role: 'Asistente de Logística',
          isDecisionMaker: false,
          areas: ['logística', 'administración']
        };
      }
      
      if (messageLower.includes('dueño') || messageLower.includes('propietario')) {
        return {
          role: 'Dueño',
          isDecisionMaker: true,
          areas: ['dirección', 'estrategia']
        };
      }
      
      if (messageLower.includes('coordinador de flota')) {
        return {
          role: 'Coordinador de Flota',
          isDecisionMaker: false,
          areas: ['transporte', 'operaciones']
        };
      }
    }
    
    // Verificar si es tomador de decisiones aunque no se detecte un rol específico
    for (const pattern of decisionMakerPatterns) {
      if (messageLower.includes(pattern)) {
        return {
          role: 'Ejecutivo',
          isDecisionMaker: true,
          areas: ['dirección', 'estrategia']
        };
      }
    }
    
    // Si no se detecta ningún rol
    return {
      role: 'No especificado',
      isDecisionMaker: false,
      areas: []
    };
  }

  /**
   * Analiza el tamaño de la empresa basado en la información disponible
   * @param {string} companyName - Nombre de la empresa
   * @param {string} message - Mensaje del usuario
   * @returns {Object} - Información sobre el tamaño de la empresa
   */
  analyzeCompanySize(companyName, message) {
    const lowerMessage = message.toLowerCase();
    
    // Detectar indicadores de tamaño grande
    if (lowerMessage.includes('grande') || 
        lowerMessage.includes('nacional') || 
        lowerMessage.includes('internacional') ||
        lowerMessage.includes('muchos vehículos') ||
        lowerMessage.includes('flota grande')) {
      return {
        size: 'grande',
        fleetEstimate: '50+',
        potential: 'alto'
      };
    }
    
    // Detectar indicadores de tamaño mediano
    if (lowerMessage.includes('mediana') || 
        lowerMessage.includes('regional') || 
        lowerMessage.includes('varios vehículos') ||
        lowerMessage.includes('flota mediana')) {
      return {
        size: 'mediana',
        fleetEstimate: '10-50',
        potential: 'medio'
      };
    }
    
    // Detectar indicadores de tamaño pequeño
    if (lowerMessage.includes('pequeña') || 
        lowerMessage.includes('local') || 
        lowerMessage.includes('pocos vehículos') ||
        lowerMessage.includes('flota pequeña') ||
        lowerMessage.includes('independiente')) {
      return {
        size: 'pequeña',
        fleetEstimate: '1-10',
        potential: 'bajo'
      };
    }
    
    // Si no hay indicadores claros, devolver desconocido
    return {
      size: 'desconocido',
      fleetEstimate: 'desconocido',
      potential: 'por determinar'
    };
  }

  /**
   * Inicia el proceso de calificación del prospecto
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async startQualification(message, prospectState) {
    try {
      logger.info(`Iniciando calificación con mensaje: "${message}" en estado: ${prospectState.qualificationStep || 'inicial'}`);
      
      let result;
      
      // Si no estamos en estado de calificación inicial o no hay paso definido, iniciar el proceso
      if (prospectState.conversationState !== 'initial_qualification' || !prospectState.qualificationStep) {
        logger.info('Iniciando primer paso de calificación: fleet_size');
        result = {
          response: `Hola ${prospectState.name || 'allí'}, me gustaría entender mejor las necesidades de ${prospectState.company || 'tu empresa'}. ¿Cuántas unidades de transporte manejan actualmente?`,
          newState: {
            ...prospectState,
            conversationState: 'initial_qualification',
            qualificationStep: 'fleet_size',
            lastInteraction: new Date()
          }
        };
      } else {
        // Procesar según el paso actual de calificación
        logger.info(`Procesando paso de calificación: ${prospectState.qualificationStep}`);
        switch (prospectState.qualificationStep) {
          case 'fleet_size':
            result = await this.handleFleetSizeResponse(message, prospectState);
            break;
          case 'current_solution':
            result = await this.handleCurrentSolutionResponse(message, prospectState);
            break;
          case 'decision_timeline':
            result = await this.handleDecisionTimelineResponse(message, prospectState);
            break;
          case 'role_confirmation':
            result = await this.handleRoleConfirmationResponse(message, prospectState);
            break;
          case 'complete':
            result = await this.handleQualificationComplete(message, prospectState);
            break;
          default:
            // Si no hay un paso definido, comenzar con el tamaño de flota
            logger.info('Paso no reconocido, reiniciando con fleet_size');
            result = {
              response: `¿Cuántas unidades de transporte maneja ${prospectState.company || 'tu empresa'} actualmente?`,
              newState: {
                ...prospectState,
                conversationState: 'initial_qualification',
                qualificationStep: 'fleet_size',
                lastInteraction: new Date()
              }
            };
        }
      }
      
      // Aplicar retraso humanizado antes de devolver la respuesta
      return withHumanDelayAsync(Promise.resolve(result), result.response);
    } catch (error) {
      logger.error('Error en startQualification:', error.message);
      
      // Respuesta por defecto en caso de error
      const errorResponse = {
        response: `Disculpa, tuve un problema procesando tu respuesta. ¿Podrías decirme cuántas unidades de transporte manejan en ${prospectState.company || 'tu empresa'}?`,
        newState: {
          ...prospectState,
          conversationState: 'initial_qualification',
          qualificationStep: 'fleet_size',
          lastInteraction: new Date(),
          lastError: error.message
        }
      };
      
      // Aplicar retraso humanizado incluso para mensajes de error
      return withHumanDelayAsync(Promise.resolve(errorResponse), errorResponse.response);
    }
  }

  /**
   * Maneja la respuesta sobre el tamaño de la flota
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleFleetSizeResponse(message, prospectState) {
    try {
      // Analizar la respuesta para extraer el tamaño de la flota
      let fleetSize = 'desconocido';
      let fleetSizeCategory = 'desconocido';
      
      // Intentar extraer números del mensaje
      const numbers = message.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        fleetSize = numbers[0];
        
        // Categorizar el tamaño de la flota
        if (parseInt(fleetSize) < 5) {
          fleetSizeCategory = 'pequeña';
        } else if (parseInt(fleetSize) < 20) {
          fleetSizeCategory = 'mediana';
        } else {
          fleetSizeCategory = 'grande';
        }
      } else if (message.toLowerCase().includes('pequeña') || message.toLowerCase().includes('pocas')) {
        fleetSizeCategory = 'pequeña';
        fleetSize = '1-5';
      } else if (message.toLowerCase().includes('mediana')) {
        fleetSizeCategory = 'mediana';
        fleetSize = '5-20';
      } else if (message.toLowerCase().includes('grande') || message.toLowerCase().includes('muchas')) {
        fleetSizeCategory = 'grande';
        fleetSize = '20+';
      }
      
      logger.info(`Flota detectada: ${fleetSize} (${fleetSizeCategory})`);
      
      // Actualizar el estado con la información de la flota
      const newState = {
        ...prospectState,
        fleetSize,
        fleetSizeCategory,
        qualificationStep: 'current_solution',
        lastInteraction: new Date()
      };
      
      // Preparar la siguiente pregunta basada en el tamaño de la flota
      let response;
      if (fleetSizeCategory === 'pequeña') {
        response = `Entiendo que manejan una flota pequeña de aproximadamente ${fleetSize} unidades. ¿Actualmente utilizan algún sistema de monitoreo de fatiga o es la primera vez que consideran esta solución?`;
      } else if (fleetSizeCategory === 'mediana') {
        response = `Gracias por compartir que tienen una flota mediana de aproximadamente ${fleetSize} unidades. ¿Ya cuentan con algún sistema de monitoreo de fatiga o están buscando implementar uno por primera vez?`;
      } else if (fleetSizeCategory === 'grande') {
        response = `Excelente, veo que manejan una flota considerable de aproximadamente ${fleetSize} unidades. En empresas de este tamaño, el monitoreo de fatiga es crucial. ¿Actualmente utilizan alguna solución para esto o están evaluando opciones?`;
      } else {
        response = `Gracias por la información. ¿Actualmente utilizan algún sistema de monitoreo de fatiga para sus conductores o están considerando implementar uno por primera vez?`;
      }
      
      return {
        response,
        newState
      };
    } catch (error) {
      logger.error('Error en handleFleetSizeResponse:', error.message);
      
      return {
        response: `Disculpa, no pude procesar bien esa información. ¿Podrías decirme aproximadamente cuántas unidades de transporte tienen en su flota?`,
        newState: {
          ...prospectState,
          qualificationStep: 'fleet_size',
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Maneja la respuesta sobre la solución actual
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleCurrentSolutionResponse(message, prospectState) {
    try {
      // Analizar si ya tienen una solución
      const lowerMessage = message.toLowerCase();
      let hasSolution = false;
      let competitorSolution = null;
      
      if (lowerMessage.includes('sí') || 
          lowerMessage.includes('si') || 
          lowerMessage.includes('tenemos') ||
          lowerMessage.includes('usamos') ||
          lowerMessage.includes('utilizamos')) {
        hasSolution = true;
        
        // Intentar identificar el competidor
        const competitors = ['guardvant', 'caterpillar', 'hexagon', 'seeing machines', 'mobileye', 'nauto'];
        for (const competitor of competitors) {
          if (lowerMessage.includes(competitor)) {
            competitorSolution = competitor;
            break;
          }
        }
      }
      
      logger.info(`Solución actual: ${hasSolution ? (competitorSolution || 'Sí') : 'No'}`);
      
      // Actualizar el estado con la información de la solución actual
      const newState = {
        ...prospectState,
        hasSolution,
        competitorSolution,
        qualificationStep: 'decision_timeline',
        lastInteraction: new Date()
      };
      
      // Preparar la siguiente pregunta basada en si tienen solución actual
      let response;
      if (hasSolution) {
        if (competitorSolution) {
          response = `Entiendo que actualmente utilizan ${competitorSolution}. ¿Están buscando reemplazar esta solución o complementarla? ¿En qué plazo estarían considerando tomar una decisión?`;
        } else {
          response = `Gracias por compartir que ya cuentan con una solución. ¿Están buscando reemplazarla o complementarla? ¿En qué plazo estarían considerando tomar una decisión?`;
        }
      } else {
        response = `Entiendo que sería la primera vez que implementan un sistema de monitoreo de fatiga. ¿En qué plazo estarían considerando tomar una decisión sobre este tema?`;
      }
      
      return {
        response,
        newState
      };
    } catch (error) {
      logger.error('Error en handleCurrentSolutionResponse:', error.message);
      
      return {
        response: `Disculpa, no pude procesar bien esa información. ¿Podrías decirme si actualmente utilizan algún sistema de monitoreo de fatiga?`,
        newState: {
          ...prospectState,
          qualificationStep: 'current_solution',
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Maneja la respuesta sobre el plazo de decisión
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleDecisionTimelineResponse(message, prospectState) {
    try {
      // Analizar el plazo de decisión
      const lowerMessage = message.toLowerCase();
      let decisionTimeline = 'desconocido';
      let urgency = 'media';
      
      if (lowerMessage.includes('inmediato') || 
          lowerMessage.includes('urgente') || 
          lowerMessage.includes('pronto') ||
          lowerMessage.includes('ya') ||
          lowerMessage.includes('esta semana') ||
          lowerMessage.includes('este mes')) {
        decisionTimeline = 'inmediato';
        urgency = 'alta';
      } else if (lowerMessage.includes('próximo mes') || 
                lowerMessage.includes('proximo mes') || 
                lowerMessage.includes('30 días') ||
                lowerMessage.includes('30 dias') ||
                lowerMessage.includes('un mes') ||
                lowerMessage.includes('1 mes')) {
        decisionTimeline = 'corto plazo';
        urgency = 'media';
      } else if (lowerMessage.includes('trimestre') || 
                lowerMessage.includes('3 meses') ||
                lowerMessage.includes('tres meses') ||
                lowerMessage.includes('90 días') ||
                lowerMessage.includes('90 dias')) {
        decisionTimeline = 'mediano plazo';
        urgency = 'media';
      } else if (lowerMessage.includes('año') || 
                lowerMessage.includes('anio') || 
                lowerMessage.includes('largo plazo') ||
                lowerMessage.includes('futuro') ||
                lowerMessage.includes('después') ||
                lowerMessage.includes('despues')) {
        decisionTimeline = 'largo plazo';
        urgency = 'baja';
      }
      
      logger.info(`Plazo de decisión: ${decisionTimeline}, Urgencia: ${urgency}`);
      
      // Si el nombre es desconocido, no preguntar por el rol y pasar directamente a la calificación final
      if (prospectState.name === 'Desconocido') {
        logger.info('Nombre desconocido, saltando confirmación de rol');
        
        // Preparar respuesta para pasar directamente a la oferta de información
        const response = `Gracias por compartir esta información. Tenemos material informativo sobre nuestra solución LogiFit que podría ser de interés para ${prospectState.company || 'tu empresa'}. ¿Te gustaría que te compartiera más detalles sobre cómo funciona nuestro sistema y los beneficios que ofrece?`;
        
        // Actualizar el estado con la información del plazo y completar la calificación
        return {
          response,
          newState: {
            ...prospectState,
            decisionTimeline,
            urgency,
            role: 'No especificado',
            isDecisionMaker: false,
            qualificationStep: 'complete',
            qualificationComplete: true,
            prospectType: 'CURIOSO',
            prospectPotential: 'BAJO',
            lastInteraction: new Date()
          }
        };
      } else {
        // Si tenemos el nombre, continuar con el flujo normal y preguntar por el rol
        // Preparar la siguiente pregunta sobre el rol
        const response = `Gracias por esa información. Para poder entender mejor cómo podemos ayudarles, ¿podrías confirmarme cuál es tu rol o posición en ${prospectState.company || 'la empresa'}?`;
        
        // Actualizar el estado con la información del plazo
        return {
          response,
          newState: {
            ...prospectState,
            decisionTimeline,
            urgency,
            qualificationStep: 'role_confirmation',
            lastInteraction: new Date()
          }
        };
      }
    } catch (error) {
      logger.error('Error en handleDecisionTimelineResponse:', error.message);
      
      return {
        response: `Disculpa, no pude procesar bien esa información. ¿Podrías decirme en qué plazo aproximado estarían considerando tomar una decisión sobre este tema?`,
        newState: {
          ...prospectState,
          qualificationStep: 'decision_timeline',
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Maneja la respuesta del usuario a la confirmación de su rol
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Nuevo estado y respuesta
   */
  async handleRoleConfirmationResponse(message, prospectState) {
    logger.info(`Procesando paso de calificación: role_confirmation`);
    
    // Si ya está calificado, pasar al siguiente paso
    if (prospectState.qualificationComplete) {
      return this.handleFinalResponse(message, prospectState);
    }
    
    let roleInfo;
    
    try {
      // Si estamos en modo de prueba o no hay API key, usar análisis local
      if (process.env.NODE_ENV === 'test' || !process.env.OPENAI_API_KEY) {
        roleInfo = this.analyzeRole(message);
        logger.info('Análisis local de rol:', roleInfo);
      } else {
        // Usar OpenAI para analizar el rol
        const analysisPrompt = `Analiza este mensaje de un prospecto y determina su rol en la empresa y si es un tomador de decisiones.
        
        Mensaje: "${message}"
        
        Responde ÚNICAMENTE con un objeto JSON con esta estructura exacta:
        {
          "role": string,
          "isDecisionMaker": boolean,
          "areas": string[]
        }`;
        
        try {
          const analysis = await generateOpenAIResponse({
            role: 'system',
            content: analysisPrompt
          });
          
          logger.info('Análisis de OpenAI para rol:', analysis);
          
          // Intentar parsear la respuesta
          const parsedAnalysis = JSON.parse(analysis);
          
          // Verificar que tiene la estructura esperada
          if (typeof parsedAnalysis === 'object' && 
              'role' in parsedAnalysis &&
              'isDecisionMaker' in parsedAnalysis) {
            roleInfo = parsedAnalysis;
          } else {
            // Si la estructura no es la esperada, usar análisis local
            roleInfo = this.analyzeRole(message);
            logger.info('Usando análisis local como fallback para rol:', roleInfo);
          }
        } catch (error) {
          logger.error('Error al analizar rol con OpenAI:', error.message);
          // En caso de error, usar análisis local
          roleInfo = this.analyzeRole(message);
          logger.info('Usando análisis local como fallback para rol:', roleInfo);
        }
      }
    } catch (error) {
      logger.error('Error general en análisis de rol:', error.message);
      // En caso de error general, usar un valor por defecto
      roleInfo = {
        role: 'No especificado',
        isDecisionMaker: false,
        areas: []
      };
    }
    
    logger.info(`Rol detectado: ${roleInfo.role}, Tomador de decisiones: ${roleInfo.isDecisionMaker}`);
    
    // Si el nombre es desconocido, no insistir en el rol y pasar directamente a la calificación final
    const skipRoleConfirmation = prospectState.name === 'Desconocido';
    
    // Analizar el tamaño de la empresa si no se ha hecho antes
    let companySizeInfo = {};
    if (!prospectState.companySizeAnalyzed) {
      companySizeInfo = this.analyzeCompanySize(prospectState.company, prospectState.fleetSizeCategory);
      logger.info(`Tamaño de empresa detectado: ${companySizeInfo.size}, Potencial: ${companySizeInfo.potential}`);
    }
    
    // Determinar el tipo de prospecto y su potencial
    let prospectType = 'CURIOSO';
    let prospectPotential = 'BAJO';
    
    // Lógica para determinar el tipo de prospecto
    if (roleInfo.isDecisionMaker && 
        (prospectState.fleetSizeCategory === 'grande' || prospectState.fleetSizeCategory === 'mediana')) {
      prospectType = 'ENCARGADO';
      prospectPotential = 'ALTO';
    } else if (roleInfo.isDecisionMaker && prospectState.fleetSizeCategory === 'pequeña') {
      prospectType = 'ENCARGADO';
      prospectPotential = 'MEDIO';
    } else if (!roleInfo.isDecisionMaker && 
              (prospectState.fleetSizeCategory === 'grande' || prospectState.fleetSizeCategory === 'mediana')) {
      prospectType = 'INFLUENCER';
      prospectPotential = 'MEDIO';
    } else {
      prospectType = 'CURIOSO';
      prospectPotential = 'BAJO';
    }
    
    logger.info(`Tipo de prospecto: ${prospectType}, Potencial: ${prospectPotential}`);
    
    // Preparar la respuesta según el tipo de prospecto
    let response = '';
    
    if (prospectType === 'ENCARGADO' && prospectPotential === 'ALTO') {
      response = `Gracias por compartir esta información. Basado en lo que me comentas, creo que nuestra solución LogiFit podría ser muy adecuada para las necesidades de ${prospectState.company}. ¿Te gustaría agendar una llamada con uno de nuestros especialistas para una demostración personalizada?`;
    } else if (prospectType === 'ENCARGADO' && prospectPotential === 'MEDIO') {
      response = `Gracias por compartir esta información. Nuestra solución LogiFit podría adaptarse bien a las necesidades de ${prospectState.company}. ¿Preferirías agendar una llamada con uno de nuestros especialistas o recibir más información por este medio?`;
    } else if (prospectType === 'INFLUENCER') {
      response = `Gracias por compartir esta información. Tenemos material informativo sobre nuestra solución LogiFit que podría ser de interés para ${prospectState.company}. ¿Te gustaría que te compartiera más detalles sobre cómo funciona nuestro sistema y los beneficios que ofrece?`;
    } else {
      response = `Gracias por compartir esta información. Tenemos material informativo sobre nuestra solución LogiFit que podría ser de interés para ${prospectState.company}. ¿Te gustaría que te compartiera más detalles sobre cómo funciona nuestro sistema y los beneficios que ofrece?`;
    }
    
    // Actualizar el estado del prospecto
    const newState = {
      ...prospectState,
      role: roleInfo.role,
      isDecisionMaker: roleInfo.isDecisionMaker,
      interestAreas: roleInfo.areas,
      companySizeInfo,
      prospectType,
      prospectPotential,
      qualificationComplete: true,
      qualificationStep: 'complete'
    };
    
    return {
      newState,
      response
    };
  }

  /**
   * Maneja la respuesta final después de la calificación
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleFinalResponse(message, prospectState) {
    try {
      // Analizar si el mensaje indica interés en una cita
      const lowerMessage = message.toLowerCase();
      const wantsAppointment = lowerMessage.includes('cita') || 
                              lowerMessage.includes('reunión') || 
                              lowerMessage.includes('reunir') ||
                              lowerMessage.includes('llamada') ||
                              lowerMessage.includes('hablar') ||
                              lowerMessage.includes('sí') ||
                              lowerMessage.includes('si') ||
                              lowerMessage.includes('agenda');
      
      // Verificar si el mensaje indica interés en más información
      const wantsMoreInfo = lowerMessage.includes('información') || 
                           lowerMessage.includes('info') || 
                           lowerMessage.includes('detalles') ||
                           lowerMessage.includes('más') ||
                           lowerMessage.includes('envía') ||
                           lowerMessage.includes('manda');
      
      // Actualizar el estado según la respuesta
      const newState = {
        ...prospectState,
        conversationState: 'qualified',
        wantsAppointment,
        wantsMoreInfo,
        lastInteraction: new Date()
      };
      
      // Preparar respuesta basada en la preferencia del usuario
      let response;
      
      if (wantsAppointment) {
        response = `¡Excelente! Me encantaría coordinar una llamada con nuestro especialista. ¿Qué día y horario te resultaría más conveniente para esta reunión? Tenemos disponibilidad de lunes a viernes de 9:00 a 18:00 hrs.`;
        newState.conversationState = 'appointment_scheduling';
      } else if (wantsMoreInfo) {
        response = `Con gusto te enviaré más información sobre nuestra solución LogiFit. En breve recibirás un documento con los detalles técnicos, beneficios y casos de éxito. Si tienes alguna pregunta específica después de revisarlo, no dudes en consultarme.`;
        newState.conversationState = 'nurturing';
        newState.infoSent = true;
      } else {
        response = `Gracias por tu interés. Para poder ayudarte mejor, ¿prefieres que agendemos una llamada con nuestro especialista o te gustaría recibir más información por este medio?`;
      }
      
      return {
        response,
        newState
      };
    } catch (error) {
      logger.error('Error en handleFinalResponse:', error.message);
      
      return {
        response: `Gracias por tu interés en nuestra solución. ¿Hay algo más en lo que pueda ayudarte?`,
        newState: {
          ...prospectState,
          conversationState: 'qualified',
          lastInteraction: new Date()
        }
      };
    }
  }

  /**
   * Califica a un prospecto utilizando OpenAI
   * @param {Object} prospectState - Estado actual del prospecto
   * @returns {Promise<Object>} - Resultado de la calificación
   */
  async qualifyProspectWithAI(prospectState) {
    try {
      // Preparar los datos para el análisis
      const prospectData = {
        name: prospectState.name || 'Desconocido',
        company: prospectState.company || 'Desconocida',
        position: prospectState.role || 'No especificado',
        campaignType: prospectState.campaignType || 'WhatsApp',
        initialMessage: prospectState.messageHistory && prospectState.messageHistory.length > 0 
                      ? prospectState.messageHistory[0].message 
                      : 'No disponible',
        companyInfo: {
          fleetSize: prospectState.fleetSize || 'Desconocido',
          hasSolution: prospectState.hasSolution || false,
          decisionTimeline: prospectState.decisionTimeline || 'Desconocido',
          isDecisionMaker: prospectState.isDecisionMaker || false
        }
      };
      
      // Analizar el prospecto con OpenAI
      const analysis = await analyzeProspect(prospectData);
      
      // Actualizar el estado con el análisis
      return {
        ...prospectState,
        prospectType: analysis.prospectType,
        prospectPotential: analysis.potential,
        nextAction: analysis.nextAction,
        analysisReasoning: analysis.reasoning,
        qualificationComplete: true,
        lastInteraction: new Date()
      };
    } catch (error) {
      logger.error('Error al calificar prospecto con IA:', error.message);
      
      // En caso de error, hacer una calificación básica
      return {
        ...prospectState,
        prospectType: prospectState.isDecisionMaker ? 'ENCARGADO' : 'INFLUENCER',
        prospectPotential: prospectState.fleetSizeCategory === 'grande' ? 'ALTO' : 'MEDIO',
        nextAction: 'EDUCAR',
        analysisReasoning: 'Calificación básica por error en análisis IA',
        qualificationComplete: true,
        lastInteraction: new Date()
      };
    }
  }

  /**
   * Maneja el paso final de la calificación
   * @param {string} message - Mensaje del usuario
   * @param {Object} prospectState - Estado del prospecto
   * @returns {Promise<Object>} - Respuesta y nuevo estado
   */
  async handleQualificationComplete(message, prospectState) {
    try {
      logger.info('Procesando paso de calificación: complete');
      
      // Si el mensaje contiene una solicitud específica, procesarla
      const lowerMessage = message.toLowerCase();
      
      // Verificar si el mensaje contiene una solicitud de cita
      const wantsAppointment = lowerMessage.includes('cita') || 
                              lowerMessage.includes('reunión') || 
                              lowerMessage.includes('reunir') ||
                              lowerMessage.includes('llamada') ||
                              lowerMessage.includes('hablar') ||
                              lowerMessage.includes('agendar');
      
      // Verificar si el mensaje contiene una solicitud de información
      const wantsInfo = lowerMessage.includes('información') || 
                       lowerMessage.includes('info') || 
                       lowerMessage.includes('detalles') ||
                       lowerMessage.includes('más') ||
                       lowerMessage.includes('precios') ||
                       lowerMessage.includes('costos');
      
      // Determinar el tipo de respuesta según el tipo de prospecto y su solicitud
      let response;
      
      if (prospectState.prospectType === 'ENCARGADO' || prospectState.prospectPotential === 'ALTO') {
        // Para prospectos de alto valor, ofrecer una llamada
        response = `Gracias por compartir esta información. Basado en lo que me comentas, creo que nuestra solución LogiFit podría ser muy adecuada para las necesidades de ${prospectState.company || 'tu empresa'}. ¿Te gustaría agendar una llamada con uno de nuestros especialistas para una demostración personalizada?`;
      } else if (prospectState.prospectType === 'INFLUENCER' || prospectState.prospectPotential === 'MEDIO') {
        // Para prospectos de valor medio, ofrecer información y posibilidad de llamada
        response = `Gracias por compartir esta información. Tenemos material informativo sobre nuestra solución LogiFit que podría ser de interés para ${prospectState.company || 'tu empresa'}. ¿Te gustaría que te compartiera más detalles sobre cómo funciona nuestro sistema y los beneficios que ofrece?`;
      } else {
        // Para prospectos de bajo valor, ofrecer información básica
        response = `Gracias por compartir esta información. Tenemos material informativo sobre nuestra solución LogiFit que podría ser de interés para ${prospectState.company || 'tu empresa'}. ¿Te gustaría que te compartiera más detalles sobre cómo funciona nuestro sistema y los beneficios que ofrece?`;
      }
      
      // Actualizar el estado del prospecto
      return {
        response,
        newState: {
          ...prospectState,
          conversationState: 'qualified',
          qualificationStep: 'complete',
          qualificationComplete: true,
          lastInteraction: new Date()
        }
      };
    } catch (error) {
      logger.error(`Error en handleQualificationComplete: ${error.message}`);
      return {
        response: `Gracias por toda la información proporcionada. ¿Hay algo específico sobre nuestra solución LogiFit que te gustaría conocer?`,
        newState: {
          ...prospectState,
          conversationState: 'qualified',
          qualificationStep: 'complete',
          qualificationComplete: true,
          lastInteraction: new Date(),
          lastError: error.message
        }
      };
    }
  }
}

module.exports = new QualificationFlow(); 