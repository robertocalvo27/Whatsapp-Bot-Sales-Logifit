/**
 * Servicio para la detección y gestión de campañas de marketing
 * Este servicio permite identificar la fuente y nombre de campaña a partir de mensajes iniciales
 */

const logger = require('../utils/logger');

/**
 * Detecta la fuente de marketing y nombre de campaña a partir del mensaje inicial
 * @param {string} initialMessage - Mensaje inicial del usuario
 * @returns {Object} - Información de la campaña detectada
 */
function detectMarketingSource(initialMessage) {
  try {
    if (!initialMessage) {
      return { source: 'WhatsApp', campaignName: 'Orgánico' };
    }

    // Convertir a minúsculas para facilitar la detección
    const message = initialMessage.toLowerCase();
    
    // Objeto para almacenar el resultado
    const result = {
      source: 'WhatsApp',
      campaignName: 'Orgánico'
    };

    // Detectar fuente por palabras clave en el mensaje
    if (message.includes('facebook') || message.includes('fb.me') || message.includes('anuncio de facebook')) {
      result.source = 'Facebook Ads';
      
      // Intentar detectar la campaña específica
      if (message.includes('smart band') || message.includes('xiaomi')) {
        result.campaignName = 'Campaña Smart Band Xiaomi';
      } else if (message.includes('fatiga') || message.includes('somnolencia')) {
        result.campaignName = 'Campaña Fatiga Conductores';
      } else if (message.includes('oferta')) {
        result.campaignName = 'Campaña Ofertas Facebook';
      }
    } else if (message.includes('instagram') || message.includes('ig.me')) {
      result.source = 'Instagram';
      result.campaignName = 'Campaña Instagram';
    } else if (message.includes('google') || message.includes('búsqueda')) {
      result.source = 'Google Ads';
      result.campaignName = 'Campaña Google Search';
    } else if (message.includes('linkedin')) {
      result.source = 'LinkedIn';
      result.campaignName = 'Campaña LinkedIn';
    } else if (message.includes('tiktok')) {
      result.source = 'TikTok';
      result.campaignName = 'Campaña TikTok';
    } else if (message.includes('youtube') || message.includes('video')) {
      result.source = 'YouTube';
      result.campaignName = 'Campaña YouTube';
    } else if (message.includes('correo') || message.includes('email') || message.includes('newsletter')) {
      result.source = 'Email Marketing';
      result.campaignName = 'Newsletter';
    } else if (message.includes('webinar') || message.includes('seminario')) {
      result.source = 'Webinar';
      result.campaignName = 'Webinar Seguridad Vial';
    } else if (message.includes('feria') || message.includes('evento') || message.includes('stand')) {
      result.source = 'Feria Transporte';
      result.campaignName = 'Evento Presencial';
    } else if (message.includes('recomend') || message.includes('referid')) {
      result.source = 'Referido';
      result.campaignName = 'Programa de Referidos';
    }

    // Buscar UTM parameters o códigos de campaña en URLs
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const url = urlMatch[0];
      
      // Extraer UTM parameters si existen
      if (url.includes('utm_source=')) {
        const utmSourceMatch = url.match(/utm_source=([^&]+)/);
        if (utmSourceMatch && utmSourceMatch[1]) {
          result.source = decodeURIComponent(utmSourceMatch[1]);
        }
      }
      
      if (url.includes('utm_campaign=')) {
        const utmCampaignMatch = url.match(/utm_campaign=([^&]+)/);
        if (utmCampaignMatch && utmCampaignMatch[1]) {
          result.campaignName = decodeURIComponent(utmCampaignMatch[1]);
        }
      }
      
      // Detectar campañas por códigos en la URL
      if (url.includes('fb.me') || url.includes('facebook.com')) {
        result.source = 'Facebook Ads';
      } else if (url.includes('ig.me') || url.includes('instagram.com')) {
        result.source = 'Instagram';
      } else if (url.includes('linkedin.com')) {
        result.source = 'LinkedIn';
      } else if (url.includes('tiktok.com')) {
        result.source = 'TikTok';
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        result.source = 'YouTube';
      }
    }

    logger.info(`Campaña de marketing detectada: ${result.source} - ${result.campaignName}`);
    return result;
  } catch (error) {
    logger.error('Error al detectar fuente de marketing:', error);
    return { source: 'WhatsApp', campaignName: 'Orgánico' };
  }
}

/**
 * Extrae información de campaña de un mensaje de WhatsApp Business
 * @param {Object} messageData - Datos del mensaje de WhatsApp
 * @returns {Object} - Información de la campaña
 */
function extractCampaignFromWhatsAppMessage(messageData) {
  try {
    // Si no hay datos de mensaje, devolver valores por defecto
    if (!messageData) {
      return { source: 'WhatsApp', campaignName: 'Orgánico' };
    }
    
    // Extraer información de la respuesta a anuncio si existe
    if (messageData.referral && messageData.referral.source_type === 'ad') {
      return {
        source: messageData.referral.source_id || 'Facebook Ads',
        campaignName: messageData.referral.headline || 'Campaña Facebook'
      };
    }
    
    // Si hay un mensaje de texto, intentar detectar la fuente
    if (messageData.text && messageData.text.body) {
      return detectMarketingSource(messageData.text.body);
    }
    
    return { source: 'WhatsApp', campaignName: 'Orgánico' };
  } catch (error) {
    logger.error('Error al extraer información de campaña:', error);
    return { source: 'WhatsApp', campaignName: 'Orgánico' };
  }
}

module.exports = {
  detectMarketingSource,
  extractCampaignFromWhatsAppMessage
}; 