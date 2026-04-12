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
      // Crear directorio de proveedores si no existe
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
            `Modelo por defecto '${process.env.DEFAULT_MODEL}' no está disponible. Usando '${this.defaultModel}'.`
          );
        } else {
          console.warn('No hay modelos disponibles cargados.');
        }
      }

      console.log(`Modelo manager inicializado exitosamente. Modelo por defecto: ${this.defaultModel}`);
    } catch (error) {
      console.error('Error inicializando el manager de modelos:', error);
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
          // Importar el modelo
          const modelModule = require(modelPath);

          this.models.set(modelName, modelModule);
          console.log(`Modelo '${modelName}' cargado exitosamente`);
        } catch (error) {
          console.error(`Error cargando el modelo '${modelName}':`, error);
        }
      }
    } catch (error) {
      console.error('Error cargando modelos:', error);
      throw error;
    }
  }

  getModel(modelName = 'default') {
    // Si se solicita el modelo por defecto, usar el configurado
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

    throw new Error(`Modelo '${modelName}' no encontrado`);
  }

  async registerModel(modelName, modelCode) {
    try {
      // Guardar el modelo en el sistema de archivos
      const modelPath = path.join(this.modelDir, `${modelName}.js`);
      await fs.writeFile(modelPath, modelCode);

      // Recargar y probar el modelo
      delete require.cache[require.resolve(modelPath)];
      const modelModule = require(modelPath);

      if (typeof modelModule.createSession !== 'function' || typeof modelModule.sendMessage !== 'function') {
        return {
          success: false,
          errors: ['El modelo debe implementar createSession y sendMessage'],
        };
      }

      this.models.set(modelName, modelModule);
      await this.notifyModelChanges();
      return { success: true };
    } catch (error) {
      console.error(`Error registrando el modelo '${modelName}':`, error);
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