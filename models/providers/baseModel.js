const Errors = require('../../utils/errors');

class BaseModel {
  constructor() {
    this.name = 'base';
    this.apiKeyEnvVar = '';
    this.client = null;
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
   * Obtiene el cliente del proveedor.
   * @returns {Object} Cliente del proveedor
   * @throws {Error} Si no se pudo cargar el cliente
   */
  getClient() {
    this.ensureApiKey();
    if (this.client) {
      return this.client;
    } else {
      throw Errors.baseModel.clientNotLoaded();
    }
  }


  /**
   * Define el threadId para la sesión. Este método debe ser implementado por cada proveedor para determinar cómo manejar el contexto de la conversación.
   * @returns {string} El threadId a usar para la sesión
   * @throws {Error} Si el método no es implementado por la subclase
   */
  setThreadId() {
    throw new Error('Method setThreadId must be implemented by subclasses');
  }

  /**
   * Construye el providerState inicial para una nueva sesión. Este método puede ser sobrescrito por cada proveedor para definir qué información se necesita almacenar en el providerState desde el inicio de la sesión.
   * @returns {Object} El providerState inicial para la sesión
   * @throws {Error} Si el método no es implementado por la subclase
   */
  getProviderState() {
    throw new Error('Method buildProviderState must be implemented by subclasses');
  }

  /**
   * Crea una nueva sesión
   * @param {Object} options - Opciones para crear la sesión
   * @returns {Promise<Object>} - Datos de la sesión creada
   */
  async createSession(options) {
    // TODO: Pasar de options -> instructions.
    const { instructions } = options;

    if (!instructions) {
      throw Errors.baseModel.missingInstructionOnCreate();
    }

    const initialSessionData = {
      threadId: '',
      providerState: {
        systemInstruction: instructions
      }
    };

    return {
      threadId: (await this.setThreadId()) || '',
      providerState: this.getProviderState(initialSessionData)
    };
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