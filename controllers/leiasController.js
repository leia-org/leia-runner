const sessionService = require('../services/sessionService');
const modelManager = require('../models/modelManager');

module.exports.createLeia = async function createLeia(req, res) {
  try {
    const { sessionId, leia } = req.body;
    const runnerConfiguration = req.body.runnerConfiguration || { provider: 'default' };

    if (!sessionId || !leia) {
      return res.status(400).send({ error: 'SessionId and leia are required' });
    }

    // Check if session already exists
    const existingSession = await sessionService.getSession(sessionId);
    if (existingSession) {
      return res.status(409).send({
        error: `Session with ID: ${sessionId} already exists`,
        sessionId,
        modelName: existingSession.modelName,
        created: false
      });
    }

    // Extract necessary information from leia for instructions
    const instructions = buildInstructionsFromLeia(leia);

    // Determine which model provider to use
    const modelName = runnerConfiguration.provider || 'default';

    // Create session with the specified provider
    const sessionData = await sessionService.createSession(sessionId, instructions, modelName);

    // Store leia metadata in Redis for future reference
    await sessionService.storeLeiaMeta(sessionId, {
      leiaId: leia.id || sessionId,
      solution: leia.spec?.problem?.spec?.solution || '',
      solutionFormat: leia.spec?.problem?.spec?.solutionFormat || 'text'
    });

    res.status(201).send({
      sessionId,
      modelName,
      created: true
    });
  } catch (error) {
    console.error('Error creating LEIA:', error);
    res.status(500).send({ error: 'Internal error creating LEIA' });
  }
};

module.exports.sendLeiaMessage = async function sendLeiaMessage(req, res) {
  try {
    const sessionId = req.params.sessionId;
    const { message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).send({ error: 'SessionId and message are required' });
    }

    // Check if session exists
    const sessionExists = await sessionService.getSession(sessionId);
    if (!sessionExists) {
      return res.status(404).send({ error: `Session with ID: ${sessionId} not found` });
    }

    // Send message through the session service
    const response = await sessionService.sendMessage(sessionId, message);

    res.status(200).send(response);
  } catch (error) {
    console.error(`Error sending message to LEIA (${req.params.sessionId}):`, error);
    res.status(500).send({ error: 'Internal error sending message to LEIA' });
  }
};

/**
 * Builds instructions for the model from the LEIA configuration
 * @param {Object} leia - LEIA configuration
 * @returns {string} - Instructions for the model
 */
function buildInstructionsFromLeia(leia) {
  let instructions = leia.spec?.behaviour?.spec?.description || '';
  return instructions;
} 