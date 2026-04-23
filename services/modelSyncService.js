const { redisClient } = require('../config/redis');
const modelManager = require('../models/modelManager');

class ModelSyncService {
  constructor() {
    this.keyPrefix = 'models:';
    this.isSyncing = false;
  }

  /**
   * Synchronizes available models in Redis
   * @param {boolean} force - If true, forces synchronization even if already in progress
   * @returns {Promise<void>}
   */
  async syncModels(force = false) {
    if (this.isSyncing && !force) {
      console.log('Model synchronization already in progress');
      return;
    }

    try {
      this.isSyncing = true;
      const models = modelManager.getAvailableModels();
      const defaultModel = modelManager.getDefaultModel();

      // Save models in Redis
      await redisClient.set(
        `${this.keyPrefix}available`,
        JSON.stringify(models),
        { EX: 3600 } // 1 hour
      );

      // Save default model
      await redisClient.set(
        `${this.keyPrefix}default`,
        defaultModel,
        { EX: 3600 } // 1 hour
      );

      console.log('Models synchronized successfully in Redis');
    } catch (error) {
      console.error('Error synchronizing models in Redis:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Gets available models from Redis
   * @returns {Promise<Object>} - Object with available models and default model
   */
  async getModelsFromRedis() {
    try {
      const [availableModels, defaultModel] = await Promise.all([
        redisClient.get(`${this.keyPrefix}available`),
        redisClient.get(`${this.keyPrefix}default`)
      ]);

      return {
        models: JSON.parse(availableModels || '[]'),
        default: defaultModel || modelManager.getDefaultModel()
      };
    } catch (error) {
      console.error('Error getting models from Redis:', error);
      throw error;
    }
  }

  /**
   * Forces model synchronization
   * @returns {Promise<void>}
   */
  async forceSync() {
    return this.syncModels(true);
  }
}

const modelSyncService = new ModelSyncService();
module.exports = modelSyncService; 