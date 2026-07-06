const modelManager = require('../models/modelManager');
const sessionService = require('../services/sessionService');

module.exports.evaluateSolution = async function evaluateSolution(req, res) {
  try {
    const { sessionId, result } = req.body;

    if (!sessionId || !result) {
      return res.status(400).send({ error: 'SessionId and result are required' });
    }

    // Obtener la sesión
    const sessionData = await sessionService.getSession(sessionId);
    if (!sessionData) {
      return res.status(404).send({ error: `Session with ID: ${sessionId} not found` });
    }

    // Obtener los metadatos de LEIA
    const leiaMeta = await sessionService.getLeiaMeta(sessionId);
    if (!leiaMeta) {
      return res.status(404).send({ error: `LEIA metadata for session ID: ${sessionId} not found` });
    }

    // Obtener el modelo
    const model = modelManager.getModel(sessionData.modelName);

    // Evaluar la solución
    const evaluationResult = await model.evaluateSolution({
      leiaMeta,
      result
    });

    res.status(200).send(evaluationResult);
  } catch (error) {
    console.error(`Error evaluating solution for session ${req.body.sessionId}:`, error);
    res.status(500).send({ error: 'Internal error evaluating solution' });
  }
}; 