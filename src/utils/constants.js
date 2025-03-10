/**
 * Estados de la conversación
 */
const CONVERSATION_STATES = {
  INITIAL: 'initial',
  GREETING: 'greeting',
  QUALIFICATION: 'qualification',
  INTEREST_VALIDATION: 'interest_validation',
  APPOINTMENT_SCHEDULING: 'appointment_scheduling',
  CLOSING: 'closing',
  GENERAL_INQUIRY: 'general_inquiry'
};

/**
 * Preguntas de calificación
 */
const QUALIFICATION_QUESTIONS = [
  '¿Cuál es tu nombre completo?',
  '¿En qué ciudad te encuentras?',
  '¿Qué te interesó de nuestra publicidad?',
  '¿Has considerado adquirir nuestros productos/servicios anteriormente?'
];

module.exports = {
  CONVERSATION_STATES,
  QUALIFICATION_QUESTIONS
}; 