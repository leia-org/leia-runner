require('dotenv').config();
const BaseModel = require('./baseModel');
const Errors = require('../../utils/errors');
const ProviderState = require('../providerState');
const { GoogleGenAI } = require('@google/genai');

/**
 * Model provider based on Gemini Interactions API.
 * Uses server state with previous_interaction_id to maintain context.
 */
class Gemini31FlashLitePreviewProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'gemini-3.1-flash-lite-preview';
    this.apiKeyEnvVar = 'GEMINI_API_KEY';
    this.model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
    this.evaluationModel = process.env.GEMINI_EVALUATION_MODEL || this.model;
  }

  // Required for BaseModel
  
  createClient(apiKey) {
    return new GoogleGenAI({ apiKey });
  }

  async sendMessage(options) {
    const { message, sessionData } = options;
    const state = new ProviderState(sessionData);
    const systemInstruction = state.getSystemInstruction();
    const previousInteractionId = state.get('previousInteractionId') || state.threadId;

    try {
      const interaction = await this.createInteraction({
        model: this.model,
        input: message,
        systemInstruction,
        previousInteractionId
      });

      const responseMessage = this.extractTextFromInteraction(interaction);

      if (!responseMessage) {
        throw Errors.gemini.noTextContent();
      }

      state.update({
        previousInteractionId: interaction.id || previousInteractionId
      });

      return {
        message: responseMessage,
        sessionData: state.buildSessionData(interaction.id || previousInteractionId),
      };
    } catch (error) {
      throw Errors.gemini.messageSendError(error);
    }
  }

  /**
   * Performs the call to the Gemini API and returns the structured evaluation.
   * Called by BaseModel.evaluateSolution.
   * @param {string} prompt - Already built evaluation prompt
   * @returns {Promise<Object>} - { score, evaluation }
   */
  async generateEvaluationResponse(prompt) {
    const interaction = await this.createInteraction({
      model: this.evaluationModel,
      input: prompt,
      systemInstruction: 'You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback.',
      responseFormat: this.getEvaluationResponseFormat()
    });

    const responseText = this.extractTextFromInteraction(interaction);

    if (!responseText) {
      throw Errors.gemini.noEvaluationContent();
    }

    return JSON.parse(this.sanitizeJsonResponse(responseText));
  }

  // Helper methods 

  getEvaluationResponseFormat() {
    return {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          description: 'Score between 0 and 10'
        },
        evaluation: {
          type: 'string',
          description: 'Detailed evaluation in Markdown format'
        }
      },
      required: ['score', 'evaluation']
    };
  }

  sanitizeJsonResponse(responseText) {
    const trimmedResponse = responseText.trim();
    const fencedMatch = trimmedResponse.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    return fencedMatch ? fencedMatch[1].trim() : trimmedResponse;
  }

  extractTextFromInteraction(interaction) {
    if (!interaction || !Array.isArray(interaction.outputs)) {
      return '';
    }

    return interaction.outputs
      .filter(output => output?.type === 'text' && typeof output.text === 'string')
      .map(output => output.text.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  async createInteraction({ model, input, systemInstruction, previousInteractionId, responseFormat }) {
    const requestBody = {
      model,
      input
    };

    if (systemInstruction) {
      requestBody.system_instruction = systemInstruction;
    }

    if (previousInteractionId) {
      requestBody.previous_interaction_id = previousInteractionId;
    }

    if (responseFormat) {
      requestBody.response_format = responseFormat;
    }

    const interaction = await this.getClient().interactions.create(requestBody);

    if (interaction.status && interaction.status !== 'completed') {
      throw Errors.gemini.interactionStatusError(interaction.status);
    }

    return interaction;
  }
}

module.exports = new Gemini31FlashLitePreviewProvider();
