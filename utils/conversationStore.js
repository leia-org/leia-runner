const { redisClient } = require('../config/redis');

/**
 * ConversationStore manages conversation history for any provider that requires context management.
 * Uses Redis to persist and retrieve conversation messages, supporting message normalization,
 * system instruction management, and automatic history trimming.
 */
class ConversationStore {
  /**
   * Creates a new ConversationStore instance
   * @param {Object} options - Configuration options
   * @param {string} options.prefix - Redis key prefix (default: 'session:conversation:')
   * @param {string} options.providerName - Provider name for env var lookup (default: generic settings)
   * @param {number} options.defaultMaxMessages - Default max messages when not configured (default: 60)
   */
  constructor(options = {}) {
    this.keyPrefix = options.prefix || 'session:conversation:';
    this.providerName = options.providerName || '';
    this.defaultMaxMessages = options.defaultMaxMessages || 60;
    this.maxMessages = this.parseMaxMessages();
  }

  /**
   * Parses max messages from environment variables
   * Checks provider-specific env var first, then falls back to generic one
   * @private
   * @returns {number} Maximum messages to keep in history
   */
  parseMaxMessages() {
    let rawValue;

    if (this.providerName) {
      const providerEnvVar = `${this.providerName.toUpperCase()}_HISTORY_MAX_MESSAGES`;
      rawValue = process.env[providerEnvVar];
    }

    if (!rawValue) {
      rawValue = process.env.CONVERSATION_HISTORY_MAX_MESSAGES;
    }

    const parsed = Number.parseInt(rawValue || this.defaultMaxMessages, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return this.defaultMaxMessages;
    }

    return parsed;
  }

  getConversationKey(sessionId) {
    return `${this.keyPrefix}${sessionId}`;
  }

  /**
   * Normalizes and validates a message
   * @param {string} role - Message role (system, user, assistant)
   * @param {string} content - Message content
   * @returns {Object|null} Normalized message or null if invalid
   */
  normalizeMessage(role, content) {
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
   * Retrieves the full conversation history for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Array>} Array of normalized messages
   */
  async getConversation(sessionId) {
    const rawMessages = await redisClient.lRange(this.getConversationKey(sessionId), 0, -1);

    return rawMessages
      .map((rawMessage) => {
        try {
          return JSON.parse(rawMessage);
        } catch (error) {
          return null;
        }
      })
      .map((message) => (message ? this.normalizeMessage(message.role, message.content) : null))
      .filter(Boolean);
  }

  /**
   * Appends a message to the conversation history and trims if necessary
   * @param {string} sessionId - Session identifier
   * @param {string} role - Message role
   * @param {string} content - Message content
   * @returns {Promise<void>}
   */
  async appendMessage(sessionId, role, content) {
    const message = this.normalizeMessage(role, content);

    if (!message) {
      return;
    }

    const key = this.getConversationKey(sessionId);
    await redisClient.rPush(key, JSON.stringify(message));
    await redisClient.lTrim(key, -this.maxMessages, -1);
  }

  /**
   * Ensures a system message exists at the start of conversation
   * Creates one if missing, updates if present, or adds as first message if not already there
   * @param {string} sessionId - Session identifier
   * @param {string} systemInstruction - System instruction text
   * @returns {Promise<void>}
   */
  async ensureSystemMessage(sessionId, systemInstruction) {
    const normalizedSystemMessage = this.normalizeMessage('system', systemInstruction);

    if (!normalizedSystemMessage) {
      return;
    }

    const key = this.getConversationKey(sessionId);
    const firstRawMessage = await redisClient.lIndex(key, 0);

    if (!firstRawMessage) {
      await redisClient.rPush(key, JSON.stringify(normalizedSystemMessage));
      return;
    }

    let firstMessage = null;

    try {
      firstMessage = JSON.parse(firstRawMessage);
    } catch (error) {
      firstMessage = null;
    }

    const normalizedFirstMessage = firstMessage
      ? this.normalizeMessage(firstMessage.role, firstMessage.content)
      : null;

    if (!normalizedFirstMessage) {
      await redisClient.lSet(key, 0, JSON.stringify(normalizedSystemMessage));
      return;
    }

    if (normalizedFirstMessage.role !== 'system') {
      await redisClient.lPush(key, JSON.stringify(normalizedSystemMessage));
      await redisClient.lTrim(key, -this.maxMessages, -1);
      return;
    }

    if (normalizedFirstMessage.content !== normalizedSystemMessage.content) {
      await redisClient.lSet(key, 0, JSON.stringify(normalizedSystemMessage));
    }
  }

  /**
   * Builds a complete conversation for a provider request
   * Ensures system message, adds user message, and returns full history
   * @param {string} sessionId - Session identifier
   * @param {string} systemInstruction - System instruction to ensure
   * @param {string} userMessage - User message to append
   * @returns {Promise<Array>} Complete conversation history ready for LLM
   */
  async buildConversationForRequest(sessionId, systemInstruction, userMessage) {
    await this.ensureSystemMessage(sessionId, systemInstruction);
    await this.appendMessage(sessionId, 'user', userMessage);
    return this.getConversation(sessionId);
  }

  /**
   * Stores a provider response in the conversation history
   * @param {string} sessionId - Session identifier
   * @param {string} assistantMessage - Assistant/model response to store
   * @returns {Promise<void>}
   */
  async storeAssistantResponse(sessionId, assistantMessage) {
    await this.appendMessage(sessionId, 'assistant', assistantMessage);
  }

  /**
   * Completely clears the conversation history for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   */
  async clearConversation(sessionId) {
    await redisClient.del(this.getConversationKey(sessionId));
  }
}

/**
 * Singleton instance of ConversationStore pre-configured for generic use
 * @type {ConversationStore}
 */
const conversationStore = new ConversationStore({
  prefix: 'session:conversation:',
  providerName: '',
  defaultMaxMessages: 60,
});

module.exports = conversationStore;
module.exports.ConversationStore = ConversationStore;
