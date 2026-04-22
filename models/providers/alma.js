require('dotenv').config();
const BaseModel = require('./baseModel');

const ALMA_HOST = process.env.ALMA_HOST || 'https://alma.us.es';
const ALMA_MODEL = process.env.ALMA_MODEL || 'meta-llama/Llama-3.2-3B-Instruct';
const ALMA_MODEL_NAME = process.env.ALMA_MODEL || 'meta-llama'
const ALMA_API_KEY = process.env.ALMA_API_KEY || '';
const ALMA_MAX_TOKENS = parseInt(process.env.ALMA_MAX_TOKENS || '512', 10);
const ALMA_TEMPERATURE = parseFloat(process.env.ALMA_TEMPERATURE || '0.7');

const STOP_TOKENS = ['<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<3|im_end|>'];

/**
 * Model provider based on ALMA (alma.us.es)
 */
class AlmaProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'alma';
    this.threads = {};
  }

  /**
   * Creates a new session with ALMA
   * @param {Object} options
   * @param {string} options.instructions - Initial system instructions
   * @param {string} options.sessionId - Session ID
   * @returns {Promise<Object>}
   */
  async createSession(options) {
    const { instructions, sessionId } = options;

    try {
      this.threads[sessionId] = [
        { role: 'system', content: instructions }
      ];

      return {
        assistantId: sessionId,
        threadId: sessionId
      };
    } catch (error) {
      console.error('Error creating session with ALMA:', error);
      throw error;
    }
  }

  /**
   * Sends a message to the ALMA model
   * @param {Object} options
   * @param {string} options.message - User message
   * @param {Object} options.sessionData - Session data (includes threadId)
   * @returns {Promise<Object>}
   */
  async sendMessage(options) {
    const { message, sessionData } = options;
    const { threadId } = sessionData;

    try {
      if (!this.threads[threadId]) {
        this.threads[threadId] = [];
      }

      this.threads[threadId].push({ role: 'user', content: message });

      const response = await this._chat(this.threads[threadId]);

      this.threads[threadId].push({ role: 'assistant', content: response });

      return { message: response };
    } catch (error) {
      console.error('Error sending message to ALMA:', error);
      throw error;
    }
  }

  /**
   * Evaluates a solution using ALMA
   * @param {Object} options
   * @param {Object} options.leiaMeta - LEIA metadata (solution, solutionFormat)
   * @param {string} options.result - Solution provided by the student
   * @returns {Promise<Object>}
   */
  async evaluateSolution(options) {
    const { leiaMeta, result } = options;
    const { solution, solutionFormat } = leiaMeta;

    try {
      const evaluationPrompt = `
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

        Respond ONLY with a JSON object in the following format:
        {
          "score": [score between 0 and 10],
          "evaluation": "[detailed evaluation in Markdown format]"
        }`;

      const messages = [
        {
          role: 'system',
          content: 'You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback. Respond only with valid JSON.'
        },
        { role: 'user', content: evaluationPrompt }
      ];

      const response = await this._chat(messages);
      const evaluationResult = JSON.parse(response);
      return evaluationResult;
    } catch (error) {
      console.error('Error evaluating solution with ALMA:', error);
      throw error;
    }
  }

  /**
   * Makes a call to the ALMA endpoint
   * @param {Array} messages - List of messages in {role, content} format
   * @returns {Promise<string>} - Response message content
   */
  async _chat(messages) {
    const url = `${ALMA_HOST}/api/models/${ALMA_MODEL_NAME}/v1/chat/completions`;

    const headers = {
      'Content-Type': 'application/json',
      ...(ALMA_API_KEY && { apikey: ALMA_API_KEY })
    };

    const body = JSON.stringify({
      model: ALMA_MODEL,
      messages,
      max_tokens: ALMA_MAX_TOKENS,
      temperature: ALMA_TEMPERATURE,
      top_p: 1,
      stop: STOP_TOKENS
    });

    const res = await fetch(url, { method: 'POST', headers, body });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ALMA API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }
}

module.exports = new AlmaProvider();
