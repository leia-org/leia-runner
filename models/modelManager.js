const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const modelSyncService = require('../services/modelSyncService');

class ModelManager {
  constructor() {
    this.models = new Map();
    this.modelDir = path.join(__dirname, 'providers');
    this.defaultModel = process.env.DEFAULT_MODEL || 'openai';
  }

  async initialize() {
    try {
      // Create providers directory if it doesn't exist
      try {
        await fs.mkdir(this.modelDir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }

      await this.loadModels();

      if (!this.models.has(this.defaultModel)) {
        const firstModel = Array.from(this.models.keys())[0];
        if (firstModel) {
          this.defaultModel = firstModel;
          console.warn(
            `Default model '${process.env.DEFAULT_MODEL}' is not available. Using '${this.defaultModel}'.`
          );
        } else {
          console.warn('No available models loaded.');
        }
      }

      console.log(`Model manager initialized successfully. Default model: ${this.defaultModel}`);
    } catch (error) {
      console.error('Error initializing model manager:', error);
      throw error;
    }
  }

  async loadModels() {
    try {
      this.models.clear();
      const files = await fs.readdir(this.modelDir);
      const modelFiles = files.filter((file) => file.endsWith('.js') && file !== 'baseModel.js');

      for (const file of modelFiles) {
        const modelName = path.basename(file, '.js');
        const modelPath = path.join(this.modelDir, file);

        try {
          // Import the model
          const modelModule = require(modelPath);
          
          // Run automatic tests
          const testResult = await this.testModel(modelModule, modelName);
          
          if (testResult.success) {
            // If tests pass, register it as validated
            this.models.set(modelName, modelModule);
            this.validatedModels.add(modelName);
            await redisClient.hSet('validated_models', modelName, 'true');
            await redisClient.expire('validated_models', 86400); // 24 hours
            console.log(`Model '${modelName}' loaded and validated successfully`);
          } else {
            console.error(`Model '${modelName}' failed tests:`, testResult.errors);
            await redisClient.hSet('validated_models', modelName, 'false');
            await redisClient.expire('validated_models', 86400); // 24 hours
          }
        } catch (error) {
          console.error(`Error loading model '${modelName}':`, error);
        }
      }
    } catch (error) {
      console.error('Error loading models:', error);
      throw error;
    }
  }

  getModel(modelName = 'default') {
    // If default model is requested, use the configured one
    if (modelName === 'default') {
      if (this.models.has(this.defaultModel)) {
        return this.models.get(this.defaultModel);
      }

      const firstModel = Array.from(this.models.keys())[0];
      if (firstModel) {
        return this.models.get(firstModel);
      }
    }

    if (this.models.has(modelName)) {
      return this.models.get(modelName);
    }

    throw new Error(`Model '${modelName}' not found`);
  }

  async registerModel(modelName, modelCode) {
    try {
      // Save model to filesystem
      const modelPath = path.join(this.modelDir, `${modelName}.js`);
      await fs.writeFile(modelPath, modelCode);

      // Reload and test the model
      delete require.cache[require.resolve(modelPath)];
      const modelModule = require(modelPath);
      
      const testResult = await this.testModel(modelModule, modelName);
      
      if (testResult.success) {
        this.models.set(modelName, modelModule);
        this.validatedModels.add(modelName);
        await redisClient.hSet('validated_models', modelName, 'true');
        await redisClient.expire('validated_models', 86400); // 24 hours
        this.notifyModelChanges();
        return { success: true };
      } else {
        await redisClient.hSet('validated_models', modelName, 'false');
        await redisClient.expire('validated_models', 86400); // 24 hours
        return {
          success: false, 
          errors: testResult.errors 
        };
      }

      this.models.set(modelName, modelModule);
      await this.notifyModelChanges();
      return { success: true };
    } catch (error) {
      console.error(`Error registering model '${modelName}':`, error);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  async initializeModels() {
    await this.initialize();
  }

  getAvailableModels() {
    return Array.from(this.models.keys());
  }

  getDefaultModel() {
    return this.defaultModel;
  }

  setDefaultModel(name) {
    if (!this.models.has(name)) {
      throw new Error(`Model ${name} not found`);
    }
    this.defaultModel = name;
    return this.notifyModelChanges();
  }

  async notifyModelChanges() {
    try {
      await modelSyncService.syncModels();
    } catch (error) {
      console.error('Error notifying model changes:', error);
    }
  }
}

// Singleton pattern
const modelManager = new ModelManager();

module.exports = modelManager; 