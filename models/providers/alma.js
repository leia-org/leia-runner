require('dotenv').config();
const BaseModel = require('./baseModel');
const Errors = require('../../utils/errors');
const ProviderState = require('../providerState');
const { ConversationStore } = require('../conversationStore');

const ALMA_HOST = process.env.ALMA_HOST || 'https://alma.us.es';
const ALMA_MODEL = process.env.ALMA_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
const ALMA_MODEL_NAME = process.env.ALMA_MODEL_NAME || 'llama-3.1-8b-instruct';
const ALMA_MAX_TOKENS = parseInt(process.env.ALMA_MAX_TOKENS || '512', 10);
const ALMA_TEMPERATURE = parseFloat(process.env.ALMA_TEMPERATURE || '0.7');

const STOP_TOKENS = ['<|eot_id|>', '<|end_of_text|>', '<|im_end|>'];

/**
 * Model provider based on ALMA (alma.us.es).
 * Uses ConversationStore for Redis-backed conversation history and
 * ProviderState for session state, following the BaseModel contract.
 */
class AlmaProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'alma';
    this.apiKeyEnvVar = 'ALMA_API_KEY';
    this.conversationStore = new ConversationStore({ providerName: 'alma' });
  }

  // Required for BaseModel

  /**
   * Creates the ALMA "client". ALMA uses raw fetch rather than an SDK,
   * so we return a lightweight config object satisfying the BaseModel pattern.
   * @param {string} apiKey
   * @returns {{ apiKey: string }}
   */
  createClient(apiKey) {
    return { apiKey };
  }

  /**
   * Sends a message to the ALMA model.
   * Reads system instruction from ProviderState, builds the full conversation
   * from ConversationStore (Redis), calls the API, stores the reply, and
   * returns updated sessionData so the session is persisted.
   *
   * @param {Object} options
   * @param {string} options.sessionId    - Session ID (used as ConversationStore key)
   * @param {string} options.message      - User message
   * @param {Object} options.sessionData  - Session data from Redis
   * @returns {Promise<{ message: string, sessionData: Object }>}
   */
  async sendMessage(options) {
    const { message, sessionData, sessionId } = options;
    const state = new ProviderState(sessionData);
    const systemInstruction = state.getSystemInstruction();

    try {
      // Build full conversation history (system + prior turns + new user message)
      const messages = await this.conversationStore.buildConversationForRequest(
        sessionId,
        systemInstruction,
        message
      );

      const response = await this._chat(messages);

      // Persist assistant reply in Redis
      await this.conversationStore.storeAssistantResponse(sessionId, response);

      // Keep systemInstruction in providerState so future turns can read it
      state.update({ systemInstruction });

      return {
        message: response,
        sessionData: state.buildSessionData(''),
      };
    } catch (error) {
      throw Errors.alma.messageSendError(error);
    }
  }

  /**
   * Generates the structured evaluation response from the model's raw output.
   * Called by BaseModel.evaluateSolution() — do NOT override evaluateSolution().
   *
   * @param {string} prompt - Already built evaluation prompt (from Prompts.evaluation)
   * @returns {Promise<{ score: number, evaluation: string }>}
   */
  async generateEvaluationResponse(prompt) {
    try {
      const messages = [
        {
          role: 'system',
          content:
            'You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback. Respond only with valid JSON.',
        },
        { role: 'user', content: prompt },
      ];

      const response = await this._chat(messages);
      return JSON.parse(this.sanitizeJsonResponse(response));
    } catch (error) {
      throw Errors.alma.evaluationError(error);
    }
  }

  // Helper methods

  /**
   * Strips markdown code fences (```json ... ```) before JSON.parse.
   * @param {string} text
   * @returns {string}
   */
  sanitizeJsonResponse(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  /**
   * Makes a POST request to the ALMA chat completions endpoint.
   * @param {Array<{ role: string, content: string }>} messages
   * @returns {Promise<string>} Trimmed response text
   */
  async _chat(messages) {
    const apiKey = this.getApiKey();
    const url = `${ALMA_HOST}/api/models/${ALMA_MODEL_NAME}/v1/chat/completions`;

    const headers = {
      'Content-Type': 'application/json',
      ...(apiKey && { apikey: apiKey }),
    };

    const body = JSON.stringify({
      model: ALMA_MODEL,
      messages,
      max_tokens: ALMA_MAX_TOKENS,
      temperature: ALMA_TEMPERATURE,
      top_p: 1,
      stop: STOP_TOKENS,
    });

    const res = await fetch(url, { method: 'POST', headers, body });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ALMA API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw Errors.alma.noTextContent();
    }

    return content.trim();
  }
}

module.exports = new AlmaProvider();
