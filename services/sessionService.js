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
        instructions: prompt,
        sessionId
      });
      
      // Save session information in Redis
      const sessionData = {
        sessionId,
        modelName,
        assistantId: sessionDetails.assistantId || null,
        threadId: sessionDetails.threadId || null,
        createdAt: Date.now()
      };
      
      const key = `${this.keyPrefix}${sessionId}`;
      await redisClient.hSet(
        key,
        Object.fromEntries(
          Object.entries(sessionData).map(([key, value]) => [
            key,
            value !== null && value !== undefined ? String(value) : ''
          ])
        )
      );
      await redisClient.expire(key, 86400); // 24 hours
      
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

      // Refresh TTL on activity so active sessions don't expire mid-conversation
      await redisClient.expire(`${this.keyPrefix}${sessionId}`, 86400);
      if (await redisClient.exists(`${this.leiaMetaPrefix}${sessionId}`)) {
        await redisClient.expire(`${this.leiaMetaPrefix}${sessionId}`, 86400);
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
      
      const metaKey = `${this.leiaMetaPrefix}${sessionId}`;
      await redisClient.hSet(metaKey, redisMetadata);
      await redisClient.expire(metaKey, 86400); // 24 hours
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