const modelSyncService = require('../services/modelSyncService');

/**
 * Lists available models
 * @param {Object} req - HTTP Request
 * @param {Object} res - HTTP Response
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