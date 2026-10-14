const cacheService = require('../services/cacheService');

/**
 * Purges cache based on specific criteria
 * @param {Object} req - HTTP Request
 * @param {Object} res - HTTP Response
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

    // Validate that f and date are not specified at the same time
    if (f !== 'all' && date) {
      return res.status(400).send({ 
        error: 'Cannot specify both f and date at the same time. Use one or the other.',
        help: {
          f: 'To purge based on relative time (e.g., 1h, 2d, 1w)',
          date: 'To purge before a specific date (e.g., 2024-01-15 or timestamp)'
        }
      });
    }

    // Validate time frame format if provided
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

    // Validate specific date format if provided
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

    // Parse metadata if provided as JSON string
    let parsedMetadata = null;
    if (metadata) {
      try {
        parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      } catch (error) {
        return res.status(400).send({ 
          error: 'Metadata must be in valid JSON format',
          example: '{"leiaId": "123", "personaId": "456"}'
        });
      }
    }

    // Execute the purge
    const result = await cacheService.purgeCache({
      f,
      date,
      sessionId,
      provider,
      metadata: parsedMetadata
    });

    if (result.success) {
      res.status(200).send({
        message: 'Cache purge completed successfully',
        ...result
      });
    } else {
      res.status(500).send({
        error: 'Internal error during cache purge',
        details: result.error
      });
    }

  } catch (error) {
    console.error('Error en purgeCache:', error);
    res.status(500).send({ 
      error: 'Internal server error during cache purge',
      details: error.message
    });
  }
};

/**
 * Gets current cache statistics
 * @param {Object} req - HTTP Request
 * @param {Object} res - HTTP Response
 */
module.exports.getCacheStats = async function getCacheStats(req, res) {
  try {
    const stats = await cacheService.getCacheStats();
    
    res.status(200).send({
      message: 'Cache statistics obtained successfully',
      stats
    });

  } catch (error) {
    console.error('Error en getCacheStats:', error);
    res.status(500).send({ 
      error: 'Internal server error getting cache statistics',
      details: error.message
    });
  }
}; 