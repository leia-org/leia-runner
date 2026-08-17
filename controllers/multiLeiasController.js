const multiLeiaService = require('../services/multiLeiaService');

function sendError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) console.error(fallbackMessage, error);
  return res.status(statusCode).send({
    error: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

module.exports.createMultiLeia = async function createMultiLeia(req, res) {
  try {
    const { sessionId, actors, orchestration } = req.body || {};
    const state = await multiLeiaService.initialize(
      sessionId,
      actors,
      orchestration
    );
    return res.status(201).send({
      sessionId,
      created: true,
      state,
    });
  } catch (error) {
    return sendError(res, error, 'Internal error creating MultiLEIA session');
  }
};

module.exports.sendMultiLeiaMessage = async function sendMultiLeiaMessage(req, res) {
  try {
    const { message, turnId } = req.body || {};
    const result = await multiLeiaService.sendMessage(
      req.params.sessionId,
      message,
      turnId
    );
    return res.status(200).send(result);
  } catch (error) {
    return sendError(res, error, 'Internal error sending MultiLEIA message');
  }
};

module.exports.getMultiLeiaState = async function getMultiLeiaState(req, res) {
  try {
    const runtime = await multiLeiaService.getRuntime(req.params.sessionId);
    if (!runtime) {
      return res.status(404).send({ error: 'MultiLEIA session not found' });
    }
    return res.status(200).send(multiLeiaService.toPublicState(runtime));
  } catch (error) {
    return sendError(res, error, 'Internal error reading MultiLEIA session');
  }
};
