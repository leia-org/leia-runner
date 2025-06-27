const cacheService = require('../services/cacheService');

/**
 * Purga el caché basado en criterios específicos
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
module.exports.purgeCache = async function purgeCache(req, res) {
  try {
    const { 
      f = 'all', 
      date,
      sessionId, 
      provider, 
      metadata 
    } = req.query;

    // Validar que no se especifiquen f y date al mismo tiempo
    if (f !== 'all' && date) {
      return res.status(400).send({ 
        error: 'No puede especificar f y date al mismo tiempo. Use uno u otro.',
        help: {
          f: 'Para purgar basado en tiempo relativo (ej: 1h, 2d, 1w)',
          date: 'Para purgar antes de una fecha específica (ej: 2024-01-15 o timestamp)'
        }
      });
    }

    // Validar formato de marco temporal si se proporciona
    if (f !== 'all') {
      try {
        cacheService.parseTimeFrame(f);
      } catch (error) {
        return res.status(400).send({ 
          error: error.message,
          validFormats: {
            hours: 'Xh (ej: 1h, 24h)',
            days: 'Xd (ej: 1d, 7d)',
            weeks: 'Xw (ej: 1w, 2w)',
            months: 'Xm (ej: 1m, 6m)',
            all: 'all (purgar todo)'
          }
        });
      }
    }

    // Validar formato de fecha específica si se proporciona
    if (date) {
      try {
        cacheService.parseSpecificDate(date);
      } catch (error) {
        return res.status(400).send({ 
          error: error.message,
          validFormats: {
            iso: 'YYYY-MM-DD (ej: 2024-01-15)',
            isoWithTime: 'YYYY-MM-DDTHH:mm:ss (ej: 2024-01-15T10:30:00)',
            timestamp: 'Timestamp en segundos o milisegundos (ej: 1705312800)'
          },
          examples: [
            '2024-01-15',
            '2024-01-15T10:30:00',
            '1705312800'
          ]
        });
      }
    }

    // Parsear metadatos si se proporciona como JSON string
    let parsedMetadata = null;
    if (metadata) {
      try {
        parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      } catch (error) {
        return res.status(400).send({ 
          error: 'Los metadatos deben estar en formato JSON válido',
          example: '{"leiaId": "123", "personaId": "456"}'
        });
      }
    }

    // Ejecutar la purga
    const result = await cacheService.purgeCache({
      f,
      date,
      sessionId,
      provider,
      metadata: parsedMetadata
    });

    if (result.success) {
      res.status(200).send({
        message: 'Purga de caché completada exitosamente',
        ...result
      });
    } else {
      res.status(500).send({
        error: 'Error interno durante la purga de caché',
        details: result.error
      });
    }

  } catch (error) {
    console.error('Error en purgeCache:', error);
    res.status(500).send({ 
      error: 'Error interno del servidor durante la purga de caché',
      details: error.message
    });
  }
};

/**
 * Obtiene estadísticas del caché actual
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
module.exports.getCacheStats = async function getCacheStats(req, res) {
  try {
    const stats = await cacheService.getCacheStats();
    
    res.status(200).send({
      message: 'Estadísticas de caché obtenidas exitosamente',
      stats
    });

  } catch (error) {
    console.error('Error en getCacheStats:', error);
    res.status(500).send({ 
      error: 'Error interno del servidor obteniendo estadísticas de caché',
      details: error.message
    });
  }
}; 