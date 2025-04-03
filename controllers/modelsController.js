const modelSyncService = require('../services/modelSyncService');

/**
 * Lista los modelos disponibles
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
module.exports.listModels = async function listModels(req, res) {
  try {
    const models = await modelSyncService.getModelsFromRedis();
    res.status(200).send(models);
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).send({ error: 'Internal error listing models' });
  }
}; 