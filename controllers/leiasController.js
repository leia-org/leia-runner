const sessionService = require('../services/sessionService');

module.exports.createLeia = async function createLeia(req, res) {
  try {
    const { sessionId, leia, leias, isMultiLEIA } = req.body;
    const runnerConfiguration = req.body.runnerConfiguration || { provider: 'default' };

    if (!sessionId || (!leia && !(isMultiLEIA && Array.isArray(leias) && leias.length > 0))) {
      return res.status(400).send({ error: 'SessionId and leia or leias are required' });
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

    const modelName = runnerConfiguration.provider || 'default';

    if (isMultiLEIA) {
      await sessionService.createMultiSession(
        sessionId,
        leias.map((currentLeia) => ({
          leiaId: currentLeia.id,
          instructions: buildInstructionsFromLeia(currentLeia),
          solution: currentLeia.spec?.problem?.spec?.solution || '',
          solutionFormat: currentLeia.spec?.problem?.spec?.solutionFormat || 'text',
          evaluationPrompt: currentLeia.spec?.problem?.spec?.evaluationPrompt || '',
        })),
        modelName
      );

      await sessionService.storeLeiaMeta(sessionId, {
        leiaId: leias[0].id || sessionId,
        solution: leias[0].spec?.problem?.spec?.solution || '',
        solutionFormat: leias[0].spec?.problem?.spec?.solutionFormat || 'text',
        evaluationPrompt: leias[0].spec?.problem?.spec?.evaluationPrompt || ''
      });

      return res.status(201).send({
        sessionId,
        modelName,
        created: true
      });
    }

    const instructions = buildInstructionsFromLeia(leia);
    await sessionService.createSession(sessionId, instructions, modelName);

    // Store leia metadata in Redis for future reference
    await sessionService.storeLeiaMeta(sessionId, {
      leiaId: leia.id || sessionId,
      solution: leia.spec?.problem?.spec?.solution || '',
      solutionFormat: leia.spec?.problem?.spec?.solutionFormat || 'text',
      evaluationPrompt: leia.spec?.problem?.spec?.evaluationPrompt || ''
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
