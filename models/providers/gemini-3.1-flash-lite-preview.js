require('dotenv').config();
const BaseModel = require('./baseModel');

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
      throw new Error(`No se pudo cargar @google/genai. Asegúrate de usar Node 20+ y tener la dependencia instalada. Detalle: ${error.message}`);
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
        throw new Error('Gemini no devolvió contenido de texto');
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
      console.error('Error enviando mensaje a Gemini:', error);
      throw error;
    }
  }

  async evaluateSolution(options) {
    const { leiaMeta, result } = options;
    const { solution, solutionFormat, evaluationPrompt } = leiaMeta;

    try {
      const prompt = `
        Evaluate the following solution for a problem:

        Expected solution:
        ${solution}

        Provided solution:
        ${result}

        The Format to compare is:
        ${solutionFormat}

        Evaluate the provided solution by comparing it with the expected solution.
        Assign a score between 0 and 10, where:
        - 10 means the solution is perfect
        - 0 means the solution is completely incorrect
        Provide a detailed evaluation in Markdown format.

        Respond ONLY with a JSON object with:
        - score: number between 0 and 10
        - evaluation: detailed evaluation in Markdown format

        ${evaluationPrompt || ''}`;

      const interaction = await this.createInteraction({
        model: this.evaluationModel,
        input: prompt,
        systemInstruction: 'You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback.',
        responseFormat: this.getEvaluationResponseFormat()
      });

      const responseText = this.extractTextFromInteraction(interaction);

      if (!responseText) {
        throw new Error('Gemini no devolvió contenido para la evaluación');
      }

      return JSON.parse(this.sanitizeJsonResponse(responseText));
    } catch (error) {
      console.error('Error evaluando solución con Gemini:', error);
      throw error;
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
      throw new Error(`La interacción de Gemini terminó con estado: ${interaction.status}`);
    }

    return interaction;
  }
}

module.exports = new Gemini31FlashLitePreviewProvider();
