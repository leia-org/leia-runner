const sessionService = require('../services/sessionService');
const prompts = require('../utils/prompts');

module.exports.createMultiLeia = async function createMultiLeia(req, res) {
  try {
    const { sessionId, leias } = req.body;
    const runnerConfiguration = req.body.runnerConfiguration || { provider: 'default' };

    if (!sessionId || !Array.isArray(leias) || leias.length === 0) {
      return res.status(400).send({ error: 'SessionId and leias are required' });
    }

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

    await sessionService.createMultiSession(
      sessionId,
      leias.map((currentLeia) => ({
        leiaId: currentLeia.id,
        leiaName: getLeiaName(currentLeia),
        instructions: buildInstructionsFromLeia(currentLeia, leias),
        solution: currentLeia.spec?.problem?.spec?.solution || '',
        solutionFormat: currentLeia.spec?.problem?.spec?.solutionFormat || 'text',
        evaluationPrompt: currentLeia.spec?.problem?.spec?.evaluationPrompt || '',
      })),
      modelName,
      runnerConfiguration.orchestrator
    );

    await sessionService.storeLeiaMeta(sessionId, {
      leiaId: leias[0].id || sessionId,
      solution: leias[0].spec?.problem?.spec?.solution || '',
      solutionFormat: leias[0].spec?.problem?.spec?.solutionFormat || 'text',
      evaluationPrompt: leias[0].spec?.problem?.spec?.evaluationPrompt || ''
    });

    res.status(201).send({
      sessionId,
      modelName,
      created: true
    });
  } catch (error) {
    console.error('Error creating multi-LEIA:', error);
    res.status(500).send({ error: 'Internal error creating multi-LEIA' });
  }
};

module.exports.sendMultiLeiaMessage = async function sendMultiLeiaMessage(req, res) {
  try {
    const sessionId = req.params.sessionId;
    const { message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).send({ error: 'SessionId and message are required' });
    }

    const sessionExists = await sessionService.getSession(sessionId);
    if (!sessionExists) {
      return res.status(404).send({ error: `Session with ID: ${sessionId} not found` });
    }

    const response = await sessionService.sendMultiMessage(sessionId, message, sessionExists);

    res.status(200).send(response);
  } catch (error) {
    console.error(`Error sending message to multi-LEIA (${req.params.sessionId}):`, error);
    res.status(500).send({ error: 'Internal error sending message to multi-LEIA' });
  }
};

function buildInstructionsFromLeia(leia, allLeias = []) {
  const leiaId = leia.id ? String(leia.id) : 'unknown';
  const leiaName = getLeiaName(leia);
  const participants = allLeias.map(getLeiaName).filter(Boolean).join(', ');
  const behaviourDescription = leia.spec?.behaviour?.spec?.description || '';

  return prompts.multiLeiaSystemPrompt(leiaName, leiaId, participants, behaviourDescription);
}

function getLeiaName(leia) {
  return leia.spec?.persona?.spec?.firstName || leia.spec?.persona?.spec?.fullName || null;
}
