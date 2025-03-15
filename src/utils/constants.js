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
  GENERAL_INQUIRY: 'general_inquiry',
  CLOSED: 'closed',
  OPERATOR_TAKEOVER: 'operator_takeover'
};

/**
 * Preguntas de calificación
 */
const QUALIFICATION_QUESTIONS = [
  '¿En qué empresa trabajas?',
  '¿Cuántos vehículos tiene tu flota y qué problemas estás enfrentando?'
];

/**
 * Comando para que un operador tome el control de la conversación
 */
const OPERATOR_TAKEOVER_COMMAND = '!operador';

module.exports = {
  CONVERSATION_STATES,
  QUALIFICATION_QUESTIONS,
  OPERATOR_TAKEOVER_COMMAND
}; 