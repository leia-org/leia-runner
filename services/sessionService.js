const { redisClient } = require('../config/redis');
const modelManager = require('../models/modelManager');
const simpleOrchestrator = require('../models/orchestrators/simpleOrchestrator');
const responsesOrchestrator = require('../models/orchestrators/responsesOrchestrator');

class SessionService {
  constructor() {
    this.keyPrefix = 'session:';
    this.leiaMetaPrefix = 'leia:meta:';
  }

  serializeSessionData(sessionData) {
    const redisSessionData = {};

    for (const [key, value] of Object.entries(sessionData)) {
      if (value === null || value === undefined) {
        redisSessionData[key] = '';
      } else if (typeof value === 'object') {
        redisSessionData[key] = JSON.stringify(value);
      } else {
        redisSessionData[key] = String(value);
      }
    }

    return redisSessionData;
  }

  deserializeSessionData(sessionData) {
    if (!sessionData || Object.keys(sessionData).length === 0) {
      return null;
    }

    const normalizedSessionData = { ...sessionData };

    if (normalizedSessionData.providerState) {
      try {
        normalizedSessionData.providerState = JSON.parse(normalizedSessionData.providerState);
      } catch (error) {
        console.warn('No se pudo parsear providerState, se usará el valor almacenado:', error.message);
      }
    }

    if (normalizedSessionData.leias) {
      try {
        normalizedSessionData.leias = JSON.parse(normalizedSessionData.leias);
      } catch (error) {
        console.warn('No se pudo parsear leias, se usará el valor almacenado:', error.message);
      }
    }

    if (normalizedSessionData.isMultiLEIA === 'true') {
      normalizedSessionData.isMultiLEIA = true;
    } else if (normalizedSessionData.isMultiLEIA === 'false') {
      normalizedSessionData.isMultiLEIA = false;
    }

    return normalizedSessionData;
  }

  async updateSession(sessionId, sessionUpdates) {
    const currentSessionData = await this.getSession(sessionId);

    if (!currentSessionData) {
      return null;
    }

    const mergedSessionData = { ...currentSessionData };

    for (const [key, value] of Object.entries(sessionUpdates)) {
      if (value !== undefined) {
        mergedSessionData[key] = value;
      }
    }

    await redisClient.hSet(
      `${this.keyPrefix}${sessionId}`,
      this.serializeSessionData(mergedSessionData)
    );

    return mergedSessionData;
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
      const sessionData = {
        sessionId,
        modelName,
        threadId: sessionDetails.threadId ?? '',
        providerState: sessionDetails.providerState ?? '',
        createdAt: Date.now()
      };
      
      await redisClient.hSet(
        `${this.keyPrefix}${sessionId}`,
        this.serializeSessionData(sessionData)
      );
      
      return sessionData;
    } catch (error) {
      console.error(`Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  async createMultiSession(sessionId, leias, modelName = 'default') {
    if (!Array.isArray(leias) || leias.length === 0) {
      throw new Error('At least one LEIA is required for a multi-LEIA session');
    }

    const sessionData = {
      sessionId,
      modelName,
      threadId: '',
      providerState: {},
      isMultiLEIA: true,
      leias,
      createdAt: Date.now()
    };

    await redisClient.hSet(
      `${this.keyPrefix}${sessionId}`,
      this.serializeSessionData(sessionData)
    );

    return sessionData;
  }

  async getSession(sessionId) {
    try {
      const sessionData = await redisClient.hGetAll(`${this.keyPrefix}${sessionId}`);
      
      return this.deserializeSessionData(sessionData);
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

      if (response?.sessionData) {
        await this.updateSession(sessionId, response.sessionData);
        delete response.sessionData;
      }
      
      return response;
    } catch (error) {
      console.error(`Error sending message in session ${sessionId}:`, error);
      throw error;
    }
  }

  async sendMultiMessage(sessionId, message, sessionData) {
    const leias = Array.isArray(sessionData.leias) ? sessionData.leias : [];
    if (leias.length === 0) {
      throw new Error(`Multi-LEIA session ${sessionId} has no LEIAs`);
    }
    const model = modelManager.getModel(sessionData.modelName);
    const conversation = await model.getConversation(sessionId);
    const selectedLeia = await responsesOrchestrator.selectLeia(leias, conversation);
    if (!selectedLeia) {
      throw new Error(`Multi-LEIA session ${sessionId} could not select a LEIA`);
    }

    const selectedProviderState = sessionData.providerState || {};
    const modelSessionData = {
      ...sessionData,
      providerState: {
        ...selectedProviderState,
        systemInstruction: selectedLeia.instructions,
      },
      isMultiLEIA: true,
    };

    const response = await model.sendMessage({
      sessionId,
      message,
      sessionData: modelSessionData,
      leiaId: selectedLeia.leiaId,
    });

    if (response?.sessionData) {
      await this.updateSession(sessionId, {
        ...response.sessionData,
        isMultiLEIA: true,
        leias,
      });
      delete response.sessionData;
    }

    return {
      ...response,
      leiaId: selectedLeia.leiaId,
    };
  }

  /**
   * Clears the cached conversation associated with a session, if the model supports it.
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async clearConversation(sessionId) {
    try {
      const sessionData = await this.getSession(sessionId);

      if (!sessionData) {
        return;
      }

      const model = modelManager.getModel(sessionData.modelName);

      if (model && typeof model.clearConversation === 'function') {
        await model.clearConversation(sessionId);
      }
    } catch (error) {
      console.error(`Error clearing conversation cache for session ${sessionId}:`, error);
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
