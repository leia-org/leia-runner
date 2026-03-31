require('dotenv').config();
const BaseModel = require('./baseModel');
const { gemini: GeminiErrors } = require('../../utils/errors');

/**
 * Proveedor de modelo basado en Gemini Interactions API.
 * Usa estado de servidor con previous_interaction_id para mantener el contexto.
 */
class Gemini31FlashLitePreviewProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'gemini-3.1-flash-lite-preview';
    this.apiKeyEnvVar = 'GEMINI_API_KEY';
    this.model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
    this.evaluationModel = process.env.GEMINI_EVALUATION_MODEL || this.model;
    this.client = null;
  }

  getClient() {
    this.ensureApiKey();

    if (this.client) {
      return this.client;
    }

    try {
      const { GoogleGenAI } = require('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.getApiKey() });
      return this.client;
    } catch (error) {
      throw GeminiErrors.clientLoadError(error);
    }
  }

  getProviderState(sessionData = {}) {
    const providerState = sessionData.providerState && typeof sessionData.providerState === 'object'
      ? sessionData.providerState
      : {};

    return {
      systemInstruction: providerState.systemInstruction || 'Eres un asistente útil',
      previousInteractionId: providerState.previousInteractionId || sessionData.threadId || ''
    };
  }

  async createSession(options) {
    const { instructions } = options;

    return {
      assistantId: '',
      threadId: '',
      providerState: {
        systemInstruction: instructions || 'Eres un asistente útil',
        previousInteractionId: ''
      }
    };
  }

  async sendMessage(options) {
    const { message, sessionData } = options;
    const providerState = this.getProviderState(sessionData);

    try {
      const interaction = await this.createInteraction({
        model: this.model,
        input: message,
        systemInstruction: providerState.systemInstruction,
        previousInteractionId: providerState.previousInteractionId
      });

      const responseMessage = this.extractTextFromInteraction(interaction);

      if (!responseMessage) {
        throw GeminiErrors.noTextContent();
      }

      return {
        message: responseMessage,
        sessionData: {
          threadId: interaction.id || providerState.previousInteractionId,
          providerState: {
            ...providerState,
            previousInteractionId: interaction.id || providerState.previousInteractionId
          }
        }
      };
    } catch (error) {
      throw GeminiErrors.messageSendError(error);
    }
  }

  async evaluateSolution(options) {
    const { leiaMeta, result } = options;
    const { solution, solutionFormat, evaluationPrompt } = leiaMeta;

    try {
      const prompt = Prompts.evaluation(solution, result, solutionFormat, evaluationPrompt);

      const interaction = await this.createInteraction({
        model: this.evaluationModel,
        input: prompt,
        systemInstruction: 'You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback.',
        responseFormat: this.getEvaluationResponseFormat()
      });

      const responseText = this.extractTextFromInteraction(interaction);

      if (!responseText) {
        throw GeminiErrors.noEvaluationContent();
      }

      return JSON.parse(this.sanitizeJsonResponse(responseText));
    } catch (error) {
      throw GeminiErrors.evaluationError(error);
    }
  }

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
      throw GeminiErrors.interactionStatusError(interaction.status);
    }

    return interaction;
  }
}

module.exports = new Gemini31FlashLitePreviewProvider();
