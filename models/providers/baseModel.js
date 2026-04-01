const Errors = require('../../utils/errors');
const Prompts = require('../../utils/prompts');

class BaseModel {
  constructor() {
    this.name = 'base';
    this.apiKeyEnvVar = '';
    this._client = null;
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
   * Crea el cliente del proveedor. Debe ser implementado por cada subclase.
   * Solo se invoca una vez, la primera vez que se necesita el cliente.
   * @returns {Object} Cliente del proveedor
   */
  createClient() {
    throw new Error('Method createClient must be implemented by subclasses');
  }

  /**
   * Obtiene el cliente del proveedor (lazy initialization).
   * @returns {Object} Cliente del proveedor
   * @throws {Error} Si la API key no está configurada
   */
  getClient() {
    const apiKey = this.ensureApiKey();
    if (!this._client) {
      this._client = this.createClient(apiKey);
    }
    return this._client;
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

  /**
   * Genera la respuesta de evaluación a partir de la respuesta cruda del modelo. 
   * Este método debe ser implementado por cada proveedor para definir cómo se procesa la respuesta del modelo para obtener la evaluación estructurada.
   * @returns {Object} La evaluación estructurada a partir de la respuesta del modelo
   * @throws {Error} Si el método no es implementado por la subclase
   */
  generateEvaluationResponse() {
    throw new Error('Method generateEvaluationResponse must be implemented by subclasses');
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
   * @param {Object} options.leiaMeta - Objeto LEIA con la configuración del problema
   * @param {string} options.result - Solución proporcionada por el estudiante
   * @returns {Promise<Object>} - Resultado de la evaluación
   */
  async evaluateSolution(options) {
    const { leiaMeta, result } = options;
    const { solution, solutionFormat, evaluationPrompt } = leiaMeta;

    try {
      const prompt = Prompts.evaluation(solution, result, solutionFormat, evaluationPrompt);

      const responseParsed = await this.generateEvaluationResponse(prompt);

      return responseParsed;
    } catch (error) {
      throw Errors.baseModel.evaluationError(error);
    }
  }
}

module.exports = BaseModel; 