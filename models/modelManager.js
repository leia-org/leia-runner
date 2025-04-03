const fs = require('fs').promises;
const path = require('path');
const { redisClient } = require('../config/redis');
require('dotenv').config();
const modelSyncService = require('../services/modelSyncService');

class ModelManager {
  constructor() {
    this.models = new Map();
    this.modelDir = path.join(__dirname, 'providers');
    this.validatedModels = new Set();
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
      
      // Cargar modelos desde Redis
      const cachedModels = await redisClient.hGetAll('validated_models');
      if (cachedModels) {
        Object.keys(cachedModels).forEach(modelName => {
          if (cachedModels[modelName] === 'true') {
            this.validatedModels.add(modelName);
          }
        });
      }
      
      // Cargar y probar todos los modelos disponibles
      await this.loadModels();

      // Verificar que el modelo por defecto está disponible
      if (this.defaultModel && !this.validatedModels.has(this.defaultModel)) {
        // Si el modelo por defecto no está validado, tomar el primer modelo validado
        if (this.validatedModels.size > 0) {
          this.defaultModel = Array.from(this.validatedModels)[0];
          console.log(`Modelo por defecto '${process.env.DEFAULT_MODEL}' no está validado. Usando '${this.defaultModel}' como modelo por defecto.`);
        } else {
          console.warn('No hay modelos validados disponibles.');
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
      const files = await fs.readdir(this.modelDir);
      const modelFiles = files.filter(file => file.endsWith('.js'));
      
      for (const file of modelFiles) {
        const modelName = path.basename(file, '.js');
        const modelPath = path.join(this.modelDir, file);
        
        try {
          // Importar el modelo
          const modelModule = require(modelPath);
          
          // Ejecutar tests automáticos
          const testResult = await this.testModel(modelModule, modelName);
          
          if (testResult.success) {
            // Si pasa los tests, registrarlo como validado
            this.models.set(modelName, modelModule);
            this.validatedModels.add(modelName);
            await redisClient.hSet('validated_models', modelName, 'true');
            console.log(`Modelo '${modelName}' cargado y validado exitosamente`);
          } else {
            console.error(`Modelo '${modelName}' falló los tests:`, testResult.errors);
            await redisClient.hSet('validated_models', modelName, 'false');
          }
        } catch (error) {
          console.error(`Error cargando el modelo '${modelName}':`, error);
        }
      }
    } catch (error) {
      console.error('Error cargando modelos:', error);
      throw error;
    }
  }

  async testModel(modelModule, modelName) {
    console.log(`Ejecutando tests para el modelo '${modelName}'...`);
    const result = { success: true, errors: [] };

    // Verificar estructura del modelo
    if (!modelModule.sendMessage || typeof modelModule.sendMessage !== 'function') {
      result.success = false;
      result.errors.push('El modelo no implementa el método sendMessage');
    }

    if (!modelModule.createSession || typeof modelModule.createSession !== 'function') {
      result.success = false;
      result.errors.push('El modelo no implementa el método createSession');
    }

    // Si la estructura es correcta, realizar test básico
    if (result.success) {
      try {
        // Crear una sesión de prueba
        const sessionData = await modelModule.createSession({
          instructions: 'Este es un test automatizado.'
        });

        // Enviar un mensaje simple y verificar la respuesta
        const response = await modelModule.sendMessage({
          sessionId: 'test-session',
          message: '¿Estás funcionando correctamente?',
          sessionData: sessionData
        });

        if (!response || !response.message) {
          result.success = false;
          result.errors.push('El modelo no devolvió una respuesta válida');
        }
      } catch (error) {
        result.success = false;
        result.errors.push(`Error en el test: ${error.message}`);
      }
    }

    return result;
  }

  getModel(modelName = 'default') {
    // Si se solicita el modelo por defecto, usar el configurado
    if (modelName === 'default') {
      if (this.validatedModels.has(this.defaultModel)) {
        return this.models.get(this.defaultModel);
      } else if (this.validatedModels.size > 0) {
        // Si el modelo por defecto no está disponible, usar el primero validado
        const firstModel = Array.from(this.validatedModels)[0];
        return this.models.get(firstModel);
      }
    }
    
    // Verificar si el modelo solicitado existe y está validado
    if (this.validatedModels.has(modelName)) {
      return this.models.get(modelName);
    }
    
    throw new Error(`Modelo '${modelName}' no encontrado o no validado`);
  }

  async registerModel(modelName, modelCode) {
    try {
      // Guardar el modelo en el sistema de archivos
      const modelPath = path.join(this.modelDir, `${modelName}.js`);
      await fs.writeFile(modelPath, modelCode);
      
      // Recargar y probar el modelo
      delete require.cache[require.resolve(modelPath)];
      const modelModule = require(modelPath);
      
      const testResult = await this.testModel(modelModule, modelName);
      
      if (testResult.success) {
        this.models.set(modelName, modelModule);
        this.validatedModels.add(modelName);
        await redisClient.hSet('validated_models', modelName, 'true');
        this.notifyModelChanges();
        return { success: true };
      } else {
        await redisClient.hSet('validated_models', modelName, 'false');
        return { 
          success: false, 
          errors: testResult.errors 
        };
      }
    } catch (error) {
      console.error(`Error registrando el modelo '${modelName}':`, error);
      return { 
        success: false, 
        errors: [error.message] 
      };
    }
  }

  getAvailableModels() {
    return Array.from(this.validatedModels);
  }

  getDefaultModel() {
    return this.defaultModel;
  }

  setDefaultModel(name) {
    if (!this.models.has(name)) {
      throw new Error(`Model ${name} not found`);
    }
    this.defaultModel = name;
    this.notifyModelChanges();
  }

  async notifyModelChanges() {
    try {
      await modelSyncService.syncModels();
    } catch (error) {
      console.error('Error notifying model changes:', error);
    }
  }

  /**
   * Inicializa los modelos disponibles
   * @returns {Promise<void>}
   */
  async initializeModels() {
    try {
      // Registrar modelos que tenemos en el sistema de archivos
      await this.loadModels();
    } catch (error) {
      console.error('Error initializing models:', error);
      throw error;
    }
  }

  /**
   * Registra un nuevo modelo
   * @param {string} name - Nombre del modelo
   * @param {Object} model - Instancia del modelo
   */
  registerModel(name, model) {
    this.models.set(name, model);
    this.notifyModelChanges();
  }

  /**
   * Obtiene todos los modelos disponibles
   * @returns {Array<string>} - Lista de nombres de modelos
   */
  getAvailableModels() {
    return Array.from(this.models.keys());
  }

  /**
   * Obtiene el modelo por defecto
   * @returns {string} - Nombre del modelo por defecto
   */
  getDefaultModel() {
    return this.defaultModel;
  }

  /**
   * Establece el modelo por defecto
   * @param {string} name - Nombre del modelo
   */
  setDefaultModel(name) {
    if (!this.models.has(name)) {
      throw new Error(`Model ${name} not found`);
    }
    this.defaultModel = name;
    this.notifyModelChanges();
  }

  /**
   * Notifica cambios en los modelos y sincroniza con Redis
   */
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