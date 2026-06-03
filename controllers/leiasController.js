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
    const { provider, modelName, apiKeyId, apiKeyRequesterId } = runnerConfiguration; 
    // Create session with the specified provider
    const sessionData = await sessionService.createSession(sessionId, instructions,modelName, provider, apiKeyId, apiKeyRequesterId);

    // Activity-level toolfunctions gate. Tools are honored only when:
    //   - the activity declares at least one widget, AND
    //   - the active runner provider implements function tools — which
    //     in this runner is `openai-responses` only (Gemini text /
    //     Ollama ignore the tools array).
    // luke voice mode goes through a different stack (luke-server) and
    // is not gated here.
    //
    // Widgets now live in the problem definition (authored in the designer)
    // and ride here inside leia.spec.problem.spec.widgets. We fall back to the
    // legacy runnerConfiguration.lukeConfig.widgets for LEIAs configured
    // before the migration (dual-read).
    const problemWidgets = leia?.spec?.problem?.spec?.widgets;
    const legacyWidgets = runnerConfiguration?.lukeConfig?.widgets;
    const widgets = Array.isArray(problemWidgets) && problemWidgets.length > 0
      ? problemWidgets
      : (Array.isArray(legacyWidgets) ? legacyWidgets : []);
    const toolCapableProvider = runnerConfiguration?.provider === 'openai-responses';
    const toolFunctionsEnabled = widgets.length > 0 && toolCapableProvider;

    // Store leia metadata in Redis for future reference
    await sessionService.storeLeiaMeta(sessionId, {
      leiaId: leia.id || sessionId,
      solution: leia.spec?.problem?.spec?.solution || '',
      solutionFormat: leia.spec?.problem?.spec?.solutionFormat || 'text',
      evaluationPrompt: leia.spec?.problem?.spec?.evaluationPrompt || '',
      toolFunctionsEnabled: toolFunctionsEnabled ? 'true' : 'false',
    });

    res.status(201).send({
      sessionId,
      provider: provider,
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
    const { message, tools, toolResults } = req.body;

    const hasToolResults = Array.isArray(toolResults) && toolResults.length > 0;
    if (!sessionId || (!message && !hasToolResults)) {
      return res.status(400).send({ error: 'SessionId and message (or toolResults) are required' });
    }

    // Check if session exists
    const sessionExists = await sessionService.getSession(sessionId);
    if (!sessionExists) {
      return res.status(404).send({ error: `Session with ID: ${sessionId} not found` });
    }

    // Send message through the session service
    const response = await sessionService.sendMessage(sessionId, message, { tools, toolResults });

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