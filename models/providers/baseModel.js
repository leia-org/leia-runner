const Errors = require('../../utils/errors');
const Prompts = require('../../utils/prompts');
const ProviderState = require('../providerState');
const { redisClient } = require('../../config/redis');

class BaseModel {
  constructor() {
    this.name = 'base';
    this.apiKeyEnvVar = '';
    this._client = null;
    this.conversationPrefix = 'conversations:';
    this.defaultConversationMaxMessages = 60;
    this.defaultConversationTtlSeconds = 2629800;
  }


  // conversationStore methods implemented for all providers by default

   /**
   * Obtiene la clave Redis para una conversación de sesión.
   * @param {string} sessionId - Session ID
   * @returns {string}
   */
  getConversationKey(sessionId) {
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    return `${this.conversationPrefix}${normalizedSessionId}`;
  }

  /**
   * Obtiene el prefijo de variables de entorno para configuración de conversación.
   * @returns {string}
   */
  getConversationEnvPrefix() {
    const apiKeyEnvVar = typeof this.apiKeyEnvVar === 'string' ? this.apiKeyEnvVar.trim() : '';

    if (apiKeyEnvVar.endsWith('_API_KEY')) {
      return apiKeyEnvVar.slice(0, -'_API_KEY'.length);
    }

    const providerName = typeof this.name === 'string' ? this.name.trim() : '';
    return providerName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  /**
   * Determina si el cache de conversación está habilitado.
   * Prioriza variable por proveedor y luego la global.
   * @returns {boolean}
   */
  isConversationCacheEnabled() {
    const envPrefix = this.getConversationEnvPrefix();
    let rawValue;

    if (envPrefix) {
      const providerEnvVar = `${envPrefix}_CONVERSATION_CACHE_ENABLED`;
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
   * @returns {number}
   */
  getConversationMaxMessages() {
    const envPrefix = this.getConversationEnvPrefix();
    let rawValue;

    if (envPrefix) {
      const providerEnvVar = `${envPrefix}_HISTORY_MAX_MESSAGES`;
      rawValue = process.env[providerEnvVar];
    }

    if (!rawValue) {
      rawValue = process.env.CONVERSATION_HISTORY_MAX_MESSAGES;
    }

    const parsed = Number.parseInt(rawValue || this.defaultConversationMaxMessages, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return this.defaultConversationMaxMessages;
    }

    return parsed;
  }

  /**
   * Obtiene TTL de historial de conversación en segundos.
   * @returns {number}
   */
  getConversationTtlSeconds() {
    const parsed = Number.parseInt(process.env.CONVERSATION_HISTORY_TTL || this.defaultConversationTtlSeconds, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return this.defaultConversationTtlSeconds;
    }

    return parsed;
  }

  /**
   * Normaliza un mensaje de conversación.
   * @param {string} role - Rol del mensaje
   * @param {string} content - Contenido del mensaje
   * @returns {Object|null}
   */
  normalizeConversationMessage(role, content) {
    const normalizedRole = typeof role === 'string' ? role.trim() : '';
    const normalizedContent = typeof content === 'string' ? content.trim() : '';

    if (!['system', 'user', 'assistant'].includes(normalizedRole)) {
      return null;
    }

    if (!normalizedContent) {
      return null;
    }

    return {
      role: normalizedRole,
      content: normalizedContent,
    };
  }

  /**
   * Obtiene el historial completo de la conversación.
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>}
   */
  async getConversation(sessionId) {
    if (!this.isConversationCacheEnabled()) {
      return [];
    }

    const rawMessages = await redisClient.lRange(this.getConversationKey(sessionId), 0, -1);

    return rawMessages
      .map((rawMessage) => {
        try {
          return JSON.parse(rawMessage);
        } catch (error) {
          return null;
        }
      })
      .map((message) => (message ? this.normalizeConversationMessage(message.role, message.content) : null))
      .filter(Boolean);
  }

  /**
   * Añade un mensaje al historial y recorta al máximo permitido.
   * @param {string} sessionId - Session ID
   * @param {string} role - Rol del mensaje
   * @param {string} content - Contenido del mensaje
   * @returns {Promise<void>}
   */
  async appendMessage(sessionId, role, content) {
    const message = this.normalizeConversationMessage(role, content);

    if (!message || !this.isConversationCacheEnabled()) {
      return;
    }

    const key = this.getConversationKey(sessionId);
    const maxMessages = this.getConversationMaxMessages();
    await redisClient.rPush(key, JSON.stringify(message));
    await redisClient.lTrim(key, -maxMessages, -1);
    await redisClient.expire(key, this.getConversationTtlSeconds());
  }

  /**
   * Garantiza que exista un mensaje de sistema al inicio del historial.
   * @param {string} sessionId - Session ID
   * @param {string} systemInstruction - Instrucción de sistema
   * @returns {Promise<void>}
   */
  async ensureSystemMessage(sessionId, systemInstruction) {
    const normalizedSystemMessage = this.normalizeConversationMessage('system', systemInstruction);

    if (!normalizedSystemMessage || !this.isConversationCacheEnabled()) {
      return;
    }

    const key = this.getConversationKey(sessionId);
    const maxMessages = this.getConversationMaxMessages();
    const firstRawMessage = await redisClient.lIndex(key, 0);

    if (!firstRawMessage) {
      await redisClient.rPush(key, JSON.stringify(normalizedSystemMessage));
      await redisClient.expire(key, this.getConversationTtlSeconds());
      return;
    }

    let firstMessage = null;

    try {
      firstMessage = JSON.parse(firstRawMessage);
    } catch (error) {
      firstMessage = null;
    }

    const normalizedFirstMessage = firstMessage
      ? this.normalizeConversationMessage(firstMessage.role, firstMessage.content)
      : null;

    if (!normalizedFirstMessage) {
      await redisClient.lSet(key, 0, JSON.stringify(normalizedSystemMessage));
      await redisClient.expire(key, this.getConversationTtlSeconds());
      return;
    }

    if (normalizedFirstMessage.role !== 'system') {
      await redisClient.lPush(key, JSON.stringify(normalizedSystemMessage));
      await redisClient.lTrim(key, -maxMessages, -1);
      await redisClient.expire(key, this.getConversationTtlSeconds());
      return;
    }

    if (normalizedFirstMessage.content !== normalizedSystemMessage.content) {
      await redisClient.lSet(key, 0, JSON.stringify(normalizedSystemMessage));
    }

    await redisClient.expire(key, this.getConversationTtlSeconds());
  }

  /**
   * Construye la conversación completa para una solicitud al proveedor.
   * @param {string} sessionId - Session ID
   * @param {string} systemInstruction - Instrucción de sistema
   * @param {string} userMessage - Mensaje del usuario
   * @returns {Promise<Array>}
   */
  async buildConversationForRequest(sessionId, systemInstruction, userMessage) {
    if (!this.isConversationCacheEnabled()) {
      const fallbackConversation = [];
      const normalizedSystemMessage = this.normalizeConversationMessage('system', systemInstruction);
      const normalizedUserMessage = this.normalizeConversationMessage('user', userMessage);

      if (normalizedSystemMessage) {
        fallbackConversation.push(normalizedSystemMessage);
      }

      if (normalizedUserMessage) {
        fallbackConversation.push(normalizedUserMessage);
      }

      return fallbackConversation;
    }

    await this.ensureSystemMessage(sessionId, systemInstruction);
    await this.appendMessage(sessionId, 'user', userMessage);
    return this.getConversation(sessionId);
  }

  /**
   * Guarda la respuesta del asistente en el historial.
   * @param {string} sessionId - Session ID
   * @param {string} assistantMessage - Mensaje del asistente
   * @returns {Promise<void>}
   */
  async storeAssistantResponse(sessionId, assistantMessage) {
    await this.appendMessage(sessionId, 'assistant', assistantMessage);
  }

  /**
   * Elimina el historial de conversación de una sesión.
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async clearConversation(sessionId) {
    if (!this.isConversationCacheEnabled()) {
      return;
    }

    await redisClient.del(this.getConversationKey(sessionId));
  }

  // Methods implemented for all providers by default

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

  /**
   * Obtiene el estado del proveedor desde sessionData usando ProviderState.
   * Este método centraliza la lógica de extracción de estado de sesión.
   * @param {Object} sessionData - Datos de sesión
   * @returns {Object} Estado del proveedor
   */
  getProviderState(sessionData = {}) {
    const state = new ProviderState(sessionData);
    
    return {
      threadId: state.threadId,
      systemInstruction: state.getSystemInstruction(),
      providerState: state.providerState,
    };
  }

  /**
   * Crea una nueva sesión
   * @param {Object} options - Opciones para crear la sesión
   * @returns {Promise<Object>} - Datos de la sesión creada
   */
  async createSession(options) {
    const { instructions } = options;

    if (!instructions) {
      throw Errors.baseModel.missingInstructionOnCreate();
    }

    const threadId = await this.setThreadId();
    
    return {
      threadId,
      providerState: {
        systemInstruction: instructions
      }
    };
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

 // To be implemented by each provider

  /**
   * Crea el cliente del proveedor. Debe ser implementado por cada subclase.
   * Solo se invoca una vez, la primera vez que se necesita el cliente.
   * @returns {Object} Cliente del proveedor
   */
  createClient() {
    throw new Error('Method createClient must be implemented by subclasses');
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
   * Define el threadId para la sesión. Este método debe ser implementado por cada proveedor para determinar cómo manejar el contexto de la conversación.
   * @returns {string} El threadId a usar para la sesión, o un string vacío si el proveedor no utiliza threadId. 
   */
  async setThreadId() {
    return '';
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
}

module.exports = BaseModel; 