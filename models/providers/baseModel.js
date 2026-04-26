const Errors = require('../../utils/errors');
const Prompts = require('../../utils/prompts');
const ProviderState = require('../providerState');
const Environment = require('../../utils/environment');
const { redisClient } = require('../../config/redis');

class BaseModel {
  constructor() {
    this.name = 'base';
    this.native = true;
    this.envVar = null;
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
   * Obtiene TTL de historial de conversación en segundos.
   * @returns {number}
   */
  getConversationTtlSeconds() {
    const rawTtlSeconds =
      process.env.CONVERSATION_HISTORY_TTL ??
      process.env.CONVERSATION_HISTORY_TTL_SECONDS ??
      this.defaultConversationTtlSeconds;
    const parsed = Number.parseInt(rawTtlSeconds, 10);
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
    if (!Environment.isCacheEnabled(this.envVar, this.native)) {
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

    if (!message || !Environment.isCacheEnabled(this.envVar, this.native)) {
      return;
    }

    const key = this.getConversationKey(sessionId);
    const maxMessages = Environment.getConversationMaxMessages(this.envVar);
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

    if (!normalizedSystemMessage || !Environment.isCacheEnabled(this.envVar, this.native)) {
      return;
    }

    const key = this.getConversationKey(sessionId);
    const maxMessages = Environment.getConversationMaxMessages(this.envVar);
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
    if (!Environment.isCacheEnabled(this.envVar, this.native)) {
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
    if (!Environment.isCacheEnabled(this.envVar, this.native)) {
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
    return process.env[`${this.envVar}_API_KEY`];
  }

  /**
   * Valida que el API key esté configurado.
   * @returns {string}
   */
  ensureApiKey() {
    const envPrefix = this.envVar;

    if (!envPrefix) {
      throw new Error('envVar is not configured for this provider');
    }

    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error(`${envPrefix}_API_KEY is not configured`);
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

  /**
   * Crea la respuesta del modelo para un mensaje de sesión.
   * El flujo común de conversación vive aquí y cada proveedor solo implementa
   * la llamada al modelo y el mapeo de respuesta/estado.
   * @param {Object} options - Opciones para enviar el mensaje
   * @returns {Promise<Object>} - Respuesta normalizada del proveedor
   */
  async sendMessage(options) {
    const { sessionId, message, sessionData } = options;

    if (!sessionId) {
      throw Errors.baseModel.missingSessionId();
    }

    const state = new ProviderState(sessionData);
    const systemInstruction = state.getSystemInstruction();

    try {
      const conversationMessages = await this.buildConversationForRequest(sessionId, systemInstruction, message);
      const requestContext = {
        sessionId,
        message,
        sessionData,
        state,
        systemInstruction,
        conversationMessages,
      };

      const response = await this.buildModelResponse(requestContext);
      const responseMessage = this.extractResponseMessage(response, requestContext);

      if (!responseMessage) {
        throw Errors.baseModel.noTextContent(this.name);
      }

      await this.storeAssistantResponse(sessionId, responseMessage);

      const updatedSessionData = await this.buildSessionDataAfterMessage(
        requestContext,
        response,
        responseMessage
      );

      return {
        message: responseMessage,
        sessionData: updatedSessionData,
      };
    } catch (error) {
      throw Errors.baseModel.messageSendError(error, this.name);
    }
  }

  // Methods that each provider must define

  /**
   * Crea el cliente del proveedor. Debe ser implementado por cada subclase.
   * Solo se invoca una vez, la primera vez que se necesita el cliente.
   * @returns {Object} Cliente del proveedor
   */
  createClient() {
    throw new Error('Method createClient must be implemented by subclasses');
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

  /**
   * Ejecuta la llamada al proveedor con el contexto ya preparado.
   * Debe implementarse por cada proveedor.
   * @param {Object} context - Contexto normalizado de la solicitud
   * @returns {Promise<Object>}
  */
  async buildModelResponse() {
    throw new Error('Method buildModelResponse must be implemented by subclasses');
  }

  /**
   * Extrae el texto final de la respuesta del proveedor.
   * Debe implementarse por cada proveedor.
   * @param {Object} response - Respuesta cruda del proveedor
   * @param {Object} context - Contexto de la solicitud
   * @returns {string}
   */
  extractResponseMessage() {
    throw new Error('Method extractResponseMessage must be implemented by subclasses');
  }

  /**
   * Construye el sessionData que se devolverá al servicio de sesión.
   * @param {Object} context - Contexto de la solicitud
   * @param {Object} response - Respuesta cruda del proveedor
   * @param {string} responseMessage - Mensaje final del asistente
   * @returns {Object}
   */
  async buildSessionDataAfterMessage(context, response, responseMessage) {
    return context.state.buildSessionData(context.sessionId);
  }
}

module.exports = BaseModel; 