require('dotenv').config();
const BaseModel = require('./baseModel');
const Errors = require('../../utils/errors');
const { GoogleGenAI } = require('@google/genai');

/**
 * Proveedor de modelo basado en Gemini Interactions API.
 * Usa estado de servidor con previous_interaction_id para mantener el contexto.
 */
class Gemini31FlashLitePreviewProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'gemini-3.1-flash-lite-preview';
    this.envVar = 'GEMINI';
    this.model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
    this.evaluationModel = process.env.GEMINI_EVALUATION_MODEL || this.model;
  }

  // Requerido por el baseModel
  
  createClient(apiKey) {
    return new GoogleGenAI({ apiKey });
  }

  async buildModelResponse(context) {
    const { state, systemInstruction, message } = context;
    const previousInteractionId = state.get('previousInteractionId') || state.threadId;

    const interaction = await this.createInteraction({
      model: this.model,
      input: message,
      systemInstruction,
      previousInteractionId,
    });

    context.previousInteractionId = interaction.id || previousInteractionId;

    return interaction;
  }

  extractResponseMessage(response) {
    if (!response || !Array.isArray(response.outputs)) {
      return '';
    }

    return response.outputs
      .filter(output => output?.type === 'text' && typeof output.text === 'string')
      .map(output => output.text.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  async buildSessionDataAfterMessage(context) {
    const { state, sessionId, previousInteractionId } = context;

    state.update({
      previousInteractionId,
      conversationKey: this.getConversationKey(sessionId),
    });

    return state.buildSessionData(previousInteractionId);
  }

  /**
   * Realiza la llamada al API de Gemini y devuelve la evaluación estructurada.
   * Invocado por BaseModel.evaluateSolution.
   * @param {string} prompt - Prompt de evaluación ya construido
   * @returns {Promise<Object>} - { score, evaluation }
   */
  async generateEvaluationResponse(prompt) {
    const interaction = await this.createInteraction({
      model: this.evaluationModel,
      input: prompt,
      systemInstruction: 'You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback.',
      responseFormat: this.getEvaluationResponseFormat()
    });

    const responseText = this.extractResponseMessage(interaction);

    if (!responseText) {
      throw Errors.gemini.noEvaluationContent();
    }

    return JSON.parse(this.sanitizeJsonResponse(responseText));
  }

  // Métodos auxiliares 

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
