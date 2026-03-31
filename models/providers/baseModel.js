const Errors = require('../../utils/errors');

class BaseModel {
  constructor() {
    this.name = 'base';
    this.apiKeyEnvVar = '';
    this.client = null;
  }


  // Validation

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


  // To be implemented by each provider

  /**
   * Define el threadId para la sesión. Este método debe ser implementado por cada proveedor para determinar cómo manejar el contexto de la conversación.
   * @returns {string} El threadId a usar para la sesión, o un string vacío si el proveedor no utiliza threadId. 
   */
  async setThreadId() {
    return '';
  }

  /**
   * Construye el providerState inicial para una nueva sesión. Este método puede ser sobrescrito por cada proveedor para definir qué información se necesita almacenar en el providerState desde el inicio de la sesión.
   * @returns {Object} El providerState inicial para la sesión
   * @throws {Error} Si el método no es implementado por la subclase
   */
  getProviderState(sessionData = {}) {
    throw new Error('Method getProviderState must be implemented by subclasses');
  }

  // Methods implemented by all providers but can be overwritten if needed

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

    const threadId = await this.setThreadId();
    const initialSessionData = {
      threadId: '',
      providerState: {
        systemInstruction: instructions
      }
    };

    return {
      threadId: threadId,
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