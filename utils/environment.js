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
 * @param {boolean} native - Indica si el proveedor es nativo.
 * @returns {boolean}
 */
function isCacheEnabled(envVar, native = true) {
if (!native) {
    return true;
}

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

module.exports = { isCacheEnabled };