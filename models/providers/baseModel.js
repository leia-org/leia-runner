
class BaseModel {
  constructor() {
    this.name = 'base';
    this.apiKeyEnvVar = '';
  }

  /**
   * Obtiene el API key del proveedor desde la variable de entorno.
   * @returns {string|undefined}
   */
  getApiKey() {
    return process.env[this.apiKeyEnvVar];
  }

  /**
   * Valida que el API key esté configurado.
   * @returns {string}
   */
  ensureApiKey() {
    if (!this.apiKeyEnvVar) {
      throw new Error('apiKeyEnvVar is not configured for this provider');
    }

    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error(`${this.apiKeyEnvVar} is not configured`);
    }

    return apiKey;
  }

  /**
   * Crea una nueva sesión
   * @param {Object} options - Opciones para crear la sesión
   * @returns {Promise<Object>} - Datos de la sesión creada
   */
  async createSession(options) {
    throw new Error('Method createSession must be implemented by subclasses');
  }

  /**
   * Envía un mensaje a la sesión
   * @param {Object} options - Opciones para enviar el mensaje
   * @returns {Promise<Object>} - Respuesta del modelo
   */
  async sendMessage(options) {
    throw new Error('Method sendMessage must be implemented by subclasses');
  }

  /**
   * Evalúa una solución de estudiante
   * @param {Object} options - Opciones para la evaluación
   * @param {Object} options.leia - Objeto LEIA con la configuración del problema
   * @param {string} options.result - Solución proporcionada por el estudiante
   * @returns {Promise<Object>} - Resultado de la evaluación
   */
  async evaluateSolution(options) {
    throw new Error('Method evaluateSolution must be implemented by subclasses');
  }
}

module.exports = BaseModel; 