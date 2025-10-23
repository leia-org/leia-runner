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
 * Returns an async generator that yields progress updates in real-time
 */
async function* processWizardStep(conversation, userMessage = null) {
  try {
    const wizardProvider = modelManager.getModel('wizard');

    // Usar sendMessageStream para obtener eventos en tiempo real
    for await (const event of wizardProvider.sendMessageStream({
      message: userMessage,
      sessionData: conversation
    })) {
      yield event;
    }

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
