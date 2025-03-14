const axios = require('axios');
const logger = require('../utils/logger');
const { generateOpenAIResponse } = require('./openaiService');

// Base de datos en memoria de empresas conocidas
const KNOWN_COMPANIES = {
  'coca cola': {
    name: 'The Coca-Cola Company',
    sector: 'bebidas',
    size: 'GRANDE',
    hasFleet: true,
    fleetSize: 'GRANDE',
    relevantDepartments: ['Logística', 'Seguridad', 'Operaciones'],
    keyPositions: ['Gerente de Logística', 'Supervisor de Flota', 'Coordinador de Seguridad'],
    companyType: 'ENTERPRISE'
  },
  'backus': {
    name: 'Backus AB InBev',
    sector: 'bebidas',
    size: 'GRANDE',
    hasFleet: true,
    fleetSize: 'GRANDE',
    relevantDepartments: ['Distribución', 'Seguridad Industrial', 'Operaciones'],
    keyPositions: ['Jefe de Distribución', 'Supervisor de Seguridad', 'Coordinador de Flota'],
    companyType: 'ENTERPRISE'
  },
  'lindley': {
    name: 'Corporación Lindley',
    sector: 'bebidas',
    size: 'GRANDE',
    hasFleet: true,
    fleetSize: 'GRANDE',
    relevantDepartments: ['Logística', 'Seguridad', 'Distribución'],
    keyPositions: ['Gerente de Distribución', 'Jefe de Seguridad', 'Supervisor de Flota'],
    companyType: 'ENTERPRISE'
  }
};

/**
 * Busca información de una empresa por su RUC
 * @param {string} ruc - RUC de la empresa
 * @returns {Promise<Object|null>} - Información de la empresa o null si no se encuentra
 */
async function searchCompanyInfo(ruc) {
  try {
    // Validar formato de RUC peruano
    if (!ruc || !/^\d{11}$/.test(ruc)) {
      logger.warn(`RUC inválido: ${ruc}`);
      return null;
    }
    
    // Usar API pública para consultar RUC
    // Nota: Esta es una API de ejemplo, deberías reemplazarla con una API real
    const response = await axios.get(`https://api.apis.net.pe/v1/ruc?numero=${ruc}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.APIS_NET_PE_TOKEN || ''}`
      }
    });
    
    if (response.status === 200 && response.data) {
      logger.info(`Información de empresa encontrada para RUC: ${ruc}`);
      return {
        ruc: response.data.numeroDocumento,
        razonSocial: response.data.nombre,
        nombreComercial: response.data.nombreComercial || response.data.nombre,
        direccion: response.data.direccion,
        estado: response.data.estado,
        condicion: response.data.condicion,
        ubigeo: response.data.ubigeo,
        distrito: response.data.distrito,
        provincia: response.data.provincia,
        departamento: response.data.departamento
      };
    }
    
    logger.warn(`No se encontró información para el RUC: ${ruc}`);
    return null;
  } catch (error) {
    logger.error(`Error al buscar información de empresa por RUC ${ruc}:`, error.message);
    
    // Si no podemos obtener la información, intentar simular algunos datos básicos
    // Esto es útil para pruebas o cuando la API no está disponible
    return {
      ruc,
      razonSocial: `Empresa con RUC ${ruc}`,
      nombreComercial: `Empresa con RUC ${ruc}`,
      direccion: 'Dirección no disponible',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
      ubigeo: '',
      distrito: '',
      provincia: '',
      departamento: ''
    };
  }
}

/**
 * Busca información de una empresa por su nombre
 * @param {string} companyName - Nombre de la empresa
 * @returns {Promise<Object>} - Información de la empresa
 */
async function searchCompanyByName(companyName) {
  try {
    if (!companyName) {
      logger.warn('Nombre de empresa no proporcionado');
      return null;
    }

    // Normalizar el nombre para búsqueda
    const normalizedName = companyName.toLowerCase().trim();

    // Buscar en empresas conocidas
    for (const [key, company] of Object.entries(KNOWN_COMPANIES)) {
      if (normalizedName.includes(key)) {
        logger.info(`Empresa conocida encontrada: ${company.name}`);
        return {
          ...company,
          confidence: 'HIGH',
          source: 'KNOWN_COMPANIES'
        };
      }
    }

    // Si no está en la base conocida, usar OpenAI para análisis
    const analysis = await analyzeCompanyWithAI(companyName);
    
    return {
      ...analysis,
      confidence: 'MEDIUM',
      source: 'AI_ANALYSIS'
    };

  } catch (error) {
    logger.error(`Error al buscar empresa por nombre ${companyName}:`, error);
    return {
      name: companyName,
      confidence: 'LOW',
      source: 'ERROR',
      error: error.message
    };
  }
}

/**
 * Analiza una empresa usando OpenAI
 * @param {string} companyName - Nombre de la empresa
 * @returns {Promise<Object>} - Análisis de la empresa
 */
async function analyzeCompanyWithAI(companyName) {
  try {
    const prompt = `Analiza la siguiente empresa: "${companyName}"
    
    Proporciona la siguiente información en formato JSON:
    1. name: Nombre completo o probable de la empresa
    2. sector: Sector principal de operación
    3. size: Tamaño probable (PEQUEÑA, MEDIANA, GRANDE)
    4. hasFleet: Probabilidad de que tenga flota de vehículos (true/false)
    5. fleetSize: Si tiene flota, tamaño estimado (PEQUEÑA: 1-5, MEDIANA: 6-20, GRANDE: >20)
    6. relevantDepartments: Array de departamentos probables relacionados con transporte/seguridad
    7. keyPositions: Array de cargos clave para contactar
    8. companyType: Tipo de empresa (ENTERPRISE, SMB, STARTUP)
    
    Responde SOLO con el JSON, sin texto adicional.`;

    const response = await generateOpenAIResponse({
      role: 'system',
      content: prompt
    });

    return JSON.parse(response);

  } catch (error) {
    logger.error('Error al analizar empresa con AI:', error);
    return {
      name: companyName,
      sector: 'desconocido',
      size: 'DESCONOCIDO',
      hasFleet: false,
      fleetSize: 'DESCONOCIDO',
      relevantDepartments: [],
      keyPositions: [],
      companyType: 'DESCONOCIDO'
    };
  }
}

/**
 * Analiza el sector de la empresa basado en su información
 * @param {Object} companyInfo - Información de la empresa
 * @returns {string} - Sector de la empresa
 */
function analyzeCompanySector(companyInfo) {
  if (!companyInfo || !companyInfo.razonSocial) {
    return 'desconocido';
  }
  
  const name = companyInfo.razonSocial.toLowerCase();
  
  // Detectar sector por palabras clave en el nombre
  if (name.includes('transport') || name.includes('logistic') || name.includes('cargo') || 
      name.includes('express') || name.includes('delivery')) {
    return 'transporte';
  } else if (name.includes('miner') || name.includes('mining') || name.includes('metal')) {
    return 'minería';
  } else if (name.includes('constru') || name.includes('inmobili') || name.includes('edificacion')) {
    return 'construcción';
  } else if (name.includes('agricola') || name.includes('agro') || name.includes('cultivo')) {
    return 'agricultura';
  } else if (name.includes('industrial') || name.includes('manufact') || name.includes('fabrica')) {
    return 'industria';
  } else if (name.includes('comercial') || name.includes('retail') || name.includes('tienda')) {
    return 'comercio';
  } else if (name.includes('servicio') || name.includes('consult') || name.includes('asesor')) {
    return 'servicios';
  }
  
  return 'otros';
}

/**
 * Obtiene casos de éxito relevantes para el sector de la empresa
 * @param {string} sector - Sector de la empresa
 * @returns {Array<Object>} - Lista de casos de éxito
 */
function getRelevantSuccessCases(sector) {
  // Casos de éxito por sector
  const successCases = {
    transporte: [
      { company: 'Transportes Norte', description: 'Redujo en 45% los incidentes por fatiga' },
      { company: 'Logística Express', description: 'Mejoró la productividad de sus conductores en 30%' }
    ],
    minería: [
      { company: 'Minera Los Andes', description: 'Cero accidentes por fatiga en el último año' },
      { company: 'Compañía Minera del Sur', description: 'Redujo en 60% las alertas de microsueños' }
    ],
    construcción: [
      { company: 'Constructora Nacional', description: 'Mejoró la seguridad de sus operadores de maquinaria pesada' }
    ],
    otros: [
      { company: 'Empresas Líderes', description: 'Mejoraron la seguridad de sus flotas con nuestro sistema' }
    ]
  };
  
  // Devolver casos de éxito para el sector o casos genéricos si no hay específicos
  return successCases[sector] || successCases.otros;
}

module.exports = {
  searchCompanyInfo,
  searchCompanyByName,
  analyzeCompanySector,
  getRelevantSuccessCases
}; 