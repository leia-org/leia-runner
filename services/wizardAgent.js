/**
 * LEIA Wizard Agent Service
 * Orchestrates AI-powered LEIA creation using the wizard provider
 */

const modelManager = require('../models/modelManager');
const logger = require('../utils/logger');

/**
 * Create a new wizard conversation
 */
async function createWizardConversation(userPrompt) {
  try {
    const wizardProvider = modelManager.getModel('wizard');
    const sessionData = await wizardProvider.createSession({
      instructions: userPrompt
    });

    return sessionData;
  } catch (error) {
    logger.error('Error creating wizard conversation:', error);
    throw error;
  }
}

/**
 * Process wizard step with function calling
 * Returns an async generator that yields progress updates
 */
async function* processWizardStep(conversation, userMessage = null) {
  try {
    const wizardProvider = modelManager.getModel('wizard');

    // Llamar al provider con el mensaje (si hay uno nuevo)
    const response = await wizardProvider.sendMessage({
      message: userMessage,
      sessionData: conversation
    });

    // El provider retorna todos los eventos que ocurrieron
    // Los yieldeamos uno por uno para streaming
    for (const event of response.events) {
      yield event;
    }

    // Actualizar la conversación con el nuevo estado
    Object.assign(conversation, response.sessionData);

  } catch (error) {
    logger.error('Error in wizard step:', error);
    yield {
      type: 'error',
      message: error.message
    };
  }
}

/**
 * Continue wizard conversation with user feedback
 */
async function* continueWizardConversation(conversation, userMessage) {
  yield* processWizardStep(conversation, userMessage);
}

module.exports = {
  createWizardConversation,
  processWizardStep,
  continueWizardConversation
};
