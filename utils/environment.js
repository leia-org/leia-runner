/**
 * Construye el nombre de una variable de entorno específica del proveedor.
 * Ejemplo: OPENAI + API_KEY -> OPENAI_API_KEY.
 * @param {string} envVar - Prefijo del proveedor.
 * @param {string} suffix - Sufijo de la variable.
 * @returns {string}
 */
const getProviderEnvVar = (envVar, suffix) => (envVar ? `${envVar}_${suffix}` : '');

/**
 * Determina si el cache de conversación está habilitado.
 * Prioriza la variable del proveedor y luego la global.
 *
 * Convención esperada:
 * - `${envVar}_CONVERSATION_CACHE_ENABLED`
 * - `CONVERSATION_CACHE_ENABLED`
 *
 * @param {string} envVar - Prefijo del proveedor.
 * @returns {boolean}
 */
function isCacheEnabled(envVar) {
let rawValue;

if (envVar) {
    const providerEnvVar = getProviderEnvVar(envVar, 'CONVERSATION_CACHE_ENABLED');
    rawValue = process.env[providerEnvVar];
}

if (rawValue === undefined) {
    rawValue = process.env.CONVERSATION_CACHE_ENABLED;
}

if (rawValue === undefined || rawValue === null || rawValue === '') {
    return true;
}

const normalized = String(rawValue).trim().toLowerCase();
if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
}
if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
}

return true;
}

/**
 * Obtiene el límite de historial de conversación para el proveedor actual.
 * Prioriza la variable del proveedor y luego la global.
 *
 * Convención esperada:
 * - `${envVar}_HISTORY_MAX_MESSAGES`
 * - `CONVERSATION_HISTORY_MAX_MESSAGES`
 *
 * @param {string} envVar - Prefijo del proveedor.
 * @returns {number}
 */
function getConversationMaxMessages(envVar) {
let rawValue;

if (envVar) {
    const providerEnvVar = getProviderEnvVar(envVar, 'HISTORY_MAX_MESSAGES');
    rawValue = process.env[providerEnvVar];
}

if (!rawValue) {
    rawValue = process.env.CONVERSATION_HISTORY_MAX_MESSAGES;
}

const parsed = Number.parseInt(rawValue || 60, 10);
if (!Number.isInteger(parsed) || parsed <= 0) {
    return 60;
}

return parsed;
}

module.exports = { isCacheEnabled, getConversationMaxMessages };