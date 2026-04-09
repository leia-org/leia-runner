require('dotenv').config();
const BaseModel = require('./baseModel');
const Errors = require('../../utils/errors');
const ProviderState = require('../providerState');
const ollamaCS = require('../conversationStore');

class OllamaProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'ollama';
    this.model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    this.evaluationModel = process.env.OLLAMA_EVALUATION_MODEL || this.model;
    this.baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
  }

  // Requerido por BaseModel
  createClient() {
    return {
      baseUrl: this.baseUrl,
      apiKey: process.env.OLLAMA_API_KEY || '',
    };
  }

  /**
   * Creates a new Ollama session
   * @param {Object} options - Session creation options
   * @param {string} options.instructions - System instructions for the session
   * @returns {Promise<Object>} - Session data with threadId and providerState
   */
  async createSession(options) {
    const { instructions } = options;

    if (!instructions) {
      throw Errors.baseModel.missingInstructionOnCreate();
    }

    // Ollama doesn't need a persistent thread like OpenAI
    // We use sessionId as the conversation identifier (stored in ProviderState)
    const threadId = '';

    return {
      threadId,
      providerState: {
        systemInstruction: instructions,
      },
    };
  }

  async sendMessage(options) {
    const { sessionId, message, sessionData } = options;

    if (!sessionId) {
      throw Errors.ollama.missingSessionId();
    }

    const state = new ProviderState(sessionData);
    const systemInstruction = state.getSystemInstruction();

    try {
      const conversationMessages = await ollamaCS.buildConversationForRequest(
        sessionId,
        systemInstruction,
        message
      );

      const chatResponse = await this.createChatCompletion({
        model: this.model,
        messages: conversationMessages,
      });

      const responseMessage = this.extractAssistantMessage(chatResponse);

      if (!responseMessage) {
        throw Errors.ollama.noTextContent();
      }

      await ollamaCS.storeAssistantResponse(sessionId, responseMessage);

      state.update({
        conversationKey: ollamaCS.getConversationKey(sessionId),
        model: this.model,
      });

      return {
        message: responseMessage,
        sessionData: state.buildSessionData(sessionId),
      };
    } catch (error) {
      throw Errors.ollama.messageSendError(error);
    }
  }

  async generateEvaluationResponse(prompt) {
    try {
      const response = await this.createChatCompletion({
        model: this.evaluationModel,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert evaluator. Return only valid JSON with fields "score" (number from 0 to 10) and "evaluation" (string).',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        format: 'json',
      });

      const responseMessage = this.extractAssistantMessage(response);

      if (!responseMessage) {
        throw Errors.ollama.noEvaluationContent();
      }

      return this.parseEvaluationResponse(responseMessage);
    } catch (error) {
      throw Errors.ollama.evaluationError(error);
    }
  }

  // Métodos auxiliares

  async createChatCompletion({ model, messages, format }) {
    const headers = {
      'Content-Type': 'application/json',
    };

    const requestBody = {
      model,
      messages,
      stream: false,
    };

    if (format) {
      requestBody.format = format;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errorBody}`);
    }

    const responseData = await response.json();

    if (responseData?.error) {
      throw new Error(responseData.error);
    }

    return responseData;
  }

  extractAssistantMessage(response) {
    if (!response || typeof response !== 'object') {
      return '';
    }

    const content = response.message && typeof response.message.content === 'string'
      ? response.message.content.trim()
      : '';

    return content;
  }

  parseEvaluationResponse(responseText) {
    const sanitized = this.sanitizeJsonResponse(responseText);
    const parsed = JSON.parse(sanitized);

    if (typeof parsed.score !== 'number') {
      throw new Error('Ollama evaluation did not return numeric score');
    }

    if (typeof parsed.evaluation !== 'string') {
      throw new Error('Ollama evaluation did not return string evaluation');
    }

    return {
      score: Math.max(0, Math.min(10, parsed.score)),
      evaluation: parsed.evaluation,
    };
  }

  sanitizeJsonResponse(responseText) {
    const trimmedResponse = responseText.trim();
    const fencedMatch = trimmedResponse.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    return fencedMatch ? fencedMatch[1].trim() : trimmedResponse;
  }
}

module.exports = new OllamaProvider();
