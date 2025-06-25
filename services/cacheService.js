const { redisClient } = require('../config/redis');

class CacheService {
  constructor() {
    this.sessionPrefix = 'session:';
    this.leiaMetaPrefix = 'leia:meta:';
    this.modelsPrefix = 'models:';
    this.validatedModelsKey = 'validated_models';
  }

  /**
   * Parsea el marco temporal a milisegundos
   * @param {string} timeFrame - Marco temporal (ej: '1h', '2w', '3m', '5d', 'all')
   * @returns {number|null} - Milisegundos desde ahora hacia atrás, null para 'all'
   */
  parseTimeFrame(timeFrame) {
    if (!timeFrame || timeFrame === 'all') {
      return null; // Purgar todo
    }

    const match = timeFrame.match(/^(\d+)([hdwm])$/);
    if (!match) {
      throw new Error('Formato de tiempo inválido. Use: Xh (horas), Xd (días), Xw (semanas), Xm (meses), o "all"');
    }

    const [, amount, unit] = match;
    const value = parseInt(amount);

    const multipliers = {
      'h': 60 * 60 * 1000,        // horas a milisegundos
      'd': 24 * 60 * 60 * 1000,   // días a milisegundos
      'w': 7 * 24 * 60 * 60 * 1000, // semanas a milisegundos
      'm': 30 * 24 * 60 * 60 * 1000 // meses (aprox 30 días) a milisegundos
    };

    return value * multipliers[unit];
  }

  /**
   * Parsea una fecha específica a timestamp
   * @param {string} specificDate - Fecha específica en formato ISO (YYYY-MM-DD) o timestamp
   * @returns {number} - Timestamp en milisegundos
   */
  parseSpecificDate(specificDate) {
    if (!specificDate) {
      throw new Error('Fecha específica requerida');
    }

    // Si es un timestamp numérico
    if (/^\d+$/.test(specificDate)) {
      const timestamp = parseInt(specificDate);
      // Verificar si es timestamp en segundos o milisegundos
      const isSeconds = timestamp < 10000000000; // timestamp menor a año 2001 en ms
      return isSeconds ? timestamp * 1000 : timestamp;
    }

    // Si es una fecha ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss)
    const date = new Date(specificDate);
    if (isNaN(date.getTime())) {
      throw new Error('Formato de fecha inválido. Use formato ISO (YYYY-MM-DD) o timestamp');
    }

    return date.getTime();
  }

  /**
   * Obtiene todas las claves que coinciden con un patrón
   * @param {string} pattern - Patrón de búsqueda
   * @returns {Promise<Array>} - Array de claves
   */
  async getKeysByPattern(pattern) {
    try {
      const keys = [];
      const iterator = redisClient.scanIterator({
        MATCH: pattern,
        COUNT: 100
      });

      for await (const key of iterator) {
        keys.push(key);
      }

      return keys;
    } catch (error) {
      console.error('Error scanning keys:', error);
      throw error;
    }
  }

  /**
   * Filtra claves por fecha de creación
   * @param {Array} keys - Array de claves a filtrar
   * @param {number|null} cutoffTime - Tiempo límite en milisegundos desde epoch, null para no filtrar
   * @returns {Promise<Array>} - Array de claves filtradas
   */
  async filterKeysByTime(keys, cutoffTime) {
    if (cutoffTime === null) {
      return keys; // No filtrar por tiempo
    }

    const filteredKeys = [];
    
    for (const key of keys) {
      try {
        if (key.startsWith(this.sessionPrefix)) {
          // Para sesiones, verificar el campo createdAt
          const sessionData = await redisClient.hGet(key, 'createdAt');
          if (sessionData) {
            const createdAt = parseInt(sessionData);
            if (createdAt && createdAt <= cutoffTime) {
              filteredKeys.push(key);
            }
          }
        } else {
          // Para otras claves, usar TTL o asumir que deben ser eliminadas
          filteredKeys.push(key);
        }
      } catch (error) {
        console.error(`Error checking time for key ${key}:`, error);
        // En caso de error, incluir la clave para ser conservador
        filteredKeys.push(key);
      }
    }

    return filteredKeys;
  }

  /**
   * Filtra claves por sesión específica
   * @param {Array} keys - Array de claves a filtrar
   * @param {string} sessionId - ID de sesión a filtrar
   * @returns {Array} - Array de claves filtradas
   */
  filterKeysBySession(keys, sessionId) {
    return keys.filter(key => 
      key === `${this.sessionPrefix}${sessionId}` || 
      key === `${this.leiaMetaPrefix}${sessionId}`
    );
  }

  /**
   * Filtra claves por modelo específico
   * @param {Array} keys - Array de claves a filtrar
   * @param {string} modelName - Nombre del modelo a filtrar
   * @returns {Promise<Array>} - Array de claves filtradas
   */
  async filterKeysByModel(keys, modelName) {
    const filteredKeys = [];

    for (const key of keys) {
      try {
        if (key.startsWith(this.sessionPrefix)) {
          const sessionData = await redisClient.hGet(key, 'modelName');
          if (sessionData === modelName) {
            filteredKeys.push(key);
            // También incluir los metadatos asociados
            const sessionId = key.replace(this.sessionPrefix, '');
            const metaKey = `${this.leiaMetaPrefix}${sessionId}`;
            if (keys.includes(metaKey)) {
              filteredKeys.push(metaKey);
            }
          }
        } else if (key.startsWith(this.modelsPrefix)) {
          // Incluir claves de modelos relacionadas
          filteredKeys.push(key);
        }
      } catch (error) {
        console.error(`Error checking model for key ${key}:`, error);
      }
    }

    return filteredKeys;
  }

  /**
   * Filtra claves por metadatos específicos
   * @param {Array} keys - Array de claves a filtrar
   * @param {Object} metadata - Objeto con metadatos a buscar
   * @returns {Promise<Array>} - Array de claves filtradas
   */
  async filterKeysByMetadata(keys, metadata) {
    const filteredKeys = [];

    for (const key of keys) {
      try {
        if (key.startsWith(this.leiaMetaPrefix)) {
          const storedMetadata = await redisClient.hGetAll(key);
          
          // Verificar si todos los campos del filtro coinciden
          let matches = true;
          for (const [field, value] of Object.entries(metadata)) {
            if (storedMetadata[field] !== String(value)) {
              matches = false;
              break;
            }
          }

          if (matches) {
            filteredKeys.push(key);
            // También incluir la sesión asociada
            const sessionId = key.replace(this.leiaMetaPrefix, '');
            const sessionKey = `${this.sessionPrefix}${sessionId}`;
            if (keys.includes(sessionKey)) {
              filteredKeys.push(sessionKey);
            }
          }
        }
      } catch (error) {
        console.error(`Error checking metadata for key ${key}:`, error);
      }
    }

    return filteredKeys;
  }

  /**
   * Purga caché basado en criterios específicos
   * @param {Object} options - Opciones de purga
   * @param {string} options.timeFrame - Marco temporal ('1h', '2d', '1w', '3m', 'all')
   * @param {string} options.specificDate - Fecha específica (YYYY-MM-DD o timestamp) - purga antes de esta fecha
   * @param {string} options.sessionId - ID de sesión específica (opcional)
   * @param {string} options.modelName - Nombre del modelo específico (opcional)
   * @param {Object} options.metadata - Metadatos específicos para filtrar (opcional)
   * @returns {Promise<Object>} - Resultado de la purga
   */
  async purgeCache(options = {}) {
    try {
      const { timeFrame = 'all', specificDate, sessionId, modelName, metadata } = options;
      
      let cutoffTime = null;

      // Parsear marco temporal o fecha específica
      if (specificDate) {
        cutoffTime = this.parseSpecificDate(specificDate);
        console.log(`Usando fecha específica: ${new Date(cutoffTime).toISOString()}`);
      } else if (timeFrame !== 'all') {
        const timeFrameMs = this.parseTimeFrame(timeFrame);
        cutoffTime = timeFrameMs ? Date.now() - timeFrameMs : null;
        console.log(`Usando marco temporal: ${timeFrame} (cutoff: ${cutoffTime ? new Date(cutoffTime).toISOString() : 'none'})`);
      }

      // Obtener todas las claves relevantes
      const patterns = [
        `${this.sessionPrefix}*`,
        `${this.leiaMetaPrefix}*`,
        `${this.modelsPrefix}*`,
        this.validatedModelsKey
      ];

      let allKeys = [];
      for (const pattern of patterns) {
        const keys = await this.getKeysByPattern(pattern);
        allKeys = allKeys.concat(keys);
      }

      console.log(`Encontradas ${allKeys.length} claves en total`);

      // Aplicar filtros secuencialmente
      let keysToDelete = allKeys;

      // Filtrar por tiempo si se especifica (timeFrame o specificDate)
      if (cutoffTime !== null) {
        keysToDelete = await this.filterKeysByTime(keysToDelete, cutoffTime);
        console.log(`Después del filtro de tiempo: ${keysToDelete.length} claves`);
      }

      // Filtrar por sesión si se especifica
      if (sessionId) {
        keysToDelete = this.filterKeysBySession(keysToDelete, sessionId);
        console.log(`Después del filtro de sesión: ${keysToDelete.length} claves`);
      }

      // Filtrar por modelo si se especifica
      if (modelName) {
        keysToDelete = await this.filterKeysByModel(keysToDelete, modelName);
        console.log(`Después del filtro de modelo: ${keysToDelete.length} claves`);
      }

      // Filtrar por metadatos si se especifica
      if (metadata && Object.keys(metadata).length > 0) {
        keysToDelete = await this.filterKeysByMetadata(keysToDelete, metadata);
        console.log(`Después del filtro de metadatos: ${keysToDelete.length} claves`);
      }

      // Eliminar las claves seleccionadas
      let deletedCount = 0;
      if (keysToDelete.length > 0) {
        // Eliminar en lotes para evitar problemas de memoria
        const batchSize = 100;
        for (let i = 0; i < keysToDelete.length; i += batchSize) {
          const batch = keysToDelete.slice(i, i + batchSize);
          const result = await redisClient.del(batch);
          deletedCount += result;
        }
      }

      const result = {
        success: true,
        deletedKeys: deletedCount,
        totalKeysFound: allKeys.length,
        timeFrame: specificDate ? null : timeFrame,
        specificDate: specificDate || null,
        appliedFilters: {
          sessionId: sessionId || null,
          modelName: modelName || null,
          metadata: metadata || null
        }
      };

      console.log('Purga de caché completada:', result);
      return result;

    } catch (error) {
      console.error('Error purgando caché:', error);
      return {
        success: false,
        error: error.message,
        deletedKeys: 0
      };
    }
  }

  /**
   * Obtiene estadísticas del caché
   * @returns {Promise<Object>} - Estadísticas del caché
   */
  async getCacheStats() {
    try {
      const patterns = [
        { name: 'sessions', pattern: `${this.sessionPrefix}*` },
        { name: 'metadata', pattern: `${this.leiaMetaPrefix}*` },
        { name: 'models', pattern: `${this.modelsPrefix}*` }
      ];

      const stats = {
        total: 0,
        breakdown: {}
      };

      for (const { name, pattern } of patterns) {
        const keys = await this.getKeysByPattern(pattern);
        stats.breakdown[name] = keys.length;
        stats.total += keys.length;
      }

      // Incluir claves de modelos validados
      const validatedModelsExists = await redisClient.exists(this.validatedModelsKey);
      if (validatedModelsExists) {
        stats.breakdown.validatedModels = 1;
        stats.total += 1;
      }

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas de caché:', error);
      throw error;
    }
  }
}

module.exports = new CacheService(); 