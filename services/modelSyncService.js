const { redisClient } = require('../config/redis');
const modelManager = require('../models/modelManager');

class ModelSyncService {
  constructor() {
    this.keyPrefix = 'models:';
    this.isSyncing = false;
  }

  /**
   * Sincroniza los modelos disponibles en Redis
   * @param {boolean} force - Si es true, fuerza la sincronización incluso si ya está en proceso
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

      // Guardar los modelos en Redis
      await redisClient.set(
        `${this.keyPrefix}available`,
        JSON.stringify(models)
      );

      // Guardar el modelo por defecto
      await redisClient.set(
        `${this.keyPrefix}default`,
        defaultModel
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
   * Obtiene los modelos disponibles desde Redis
   * @returns {Promise<Object>} - Objeto con los modelos disponibles y el modelo por defecto
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
   * Fuerza la sincronización de modelos
   * @returns {Promise<void>}
   */
  async forceSync() {
    return this.syncModels(true);
  }
}

const modelSyncService = new ModelSyncService();
module.exports = modelSyncService; 