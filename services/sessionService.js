const { redisClient } = require('../config/redis');
const modelManager = require('../models/modelManager');

class SessionService {
  constructor() {
    this.keyPrefix = 'session:';
    this.leiaMetaPrefix = 'leia:meta:';
  }

  async createSession(sessionId, prompt, modelName = 'default') {
    try {
      // Get the model
      const model = modelManager.getModel(modelName);
      
      // Create a session with the selected provider
      const sessionDetails = await model.createSession({
        instructions: prompt
      });
      
      // Save session information in Redis
      // Support both old format (Assistants API: assistantId/threadId) and new format (Responses API: conversationId/instructions)
      const sessionData = {
        sessionId,
        modelName,
        // Old format (Assistants API)
        assistantId: sessionDetails.assistantId || null,
        threadId: sessionDetails.threadId || null,
        // New format (Responses API)
        conversationId: sessionDetails.conversationId || null,
        instructions: sessionDetails.instructions || null,
        createdAt: Date.now()
      };
      
      await redisClient.hSet(
        `${this.keyPrefix}${sessionId}`,
        sessionData
      );
      
      return sessionData;
    } catch (error) {
      console.error(`Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      const sessionData = await redisClient.hGetAll(`${this.keyPrefix}${sessionId}`);
      
      if (!sessionData || Object.keys(sessionData).length === 0) {
        return null;
      }
      
      return sessionData;
    } catch (error) {
      console.error(`Error getting session ${sessionId}:`, error);
      throw error;
    }
  }

  async sendMessage(sessionId, message) {
    try {
      // Get the session
      const sessionData = await this.getSession(sessionId);
      
      if (!sessionData) {
        return null; // Return null instead of throwing an error
      }
      
      // Get the model for this session
      const model = modelManager.getModel(sessionData.modelName);
      
      // Send the message through the model
      const response = await model.sendMessage({
        sessionId,
        message,
        sessionData
      });
      
      return response;
    } catch (error) {
      console.error(`Error sending message in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Stores LEIA metadata associated with the session
   * @param {string} sessionId - Session ID
   * @param {Object} metadata - LEIA metadata
   * @returns {Promise<void>}
   */
  async storeLeiaMeta(sessionId, metadata) {
    try {
      // Convertir el objeto metadata a un formato que Redis pueda almacenar
      const redisMetadata = {};
      
      // Asegurarse de que todos los valores sean strings
      for (const [key, value] of Object.entries(metadata)) {
        redisMetadata[key] = value !== null && value !== undefined ? String(value) : '';
      }
      
      await redisClient.hSet(
        `${this.leiaMetaPrefix}${sessionId}`,
        redisMetadata
      );
    } catch (error) {
      console.error(`Error storing LEIA metadata for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Gets LEIA metadata associated with the session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} - LEIA metadata
   */
  async getLeiaMeta(sessionId) {
    try {
      const metadata = await redisClient.hGetAll(`${this.leiaMetaPrefix}${sessionId}`);
      
      if (!metadata || Object.keys(metadata).length === 0) {
        return null;
      }
      
      return metadata;
    } catch (error) {
      console.error(`Error getting LEIA metadata for session ${sessionId}:`, error);
      throw error;
    }
  }
}

const sessionService = new SessionService();
module.exports = sessionService; 