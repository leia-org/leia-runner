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
 * Proveedor de modelo basado en ALMA (alma.us.es)
 */
class AlmaProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'alma';
    this.threads = {};
  }

  /**
   * Crea una nueva sesión con ALMA
   * @param {Object} options
   * @param {string} options.instructions - Instrucciones iniciales del sistema
   * @param {string} options.sessionId - ID de la sesión
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
      console.error('Error al crear sesión con ALMA:', error);
      throw error;
    }
  }

  /**
   * Envía un mensaje al modelo ALMA
   * @param {Object} options
   * @param {string} options.message - Mensaje del usuario
   * @param {Object} options.sessionData - Datos de la sesión (incluye threadId)
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
      console.error('Error enviando mensaje a ALMA:', error);
      throw error;
    }
  }

  /**
   * Evalúa una solución usando ALMA
   * @param {Object} options
   * @param {Object} options.leiaMeta - Metadatos de la LEIA (solution, solutionFormat)
   * @param {string} options.result - Solución proporcionada por el estudiante
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
      console.error('Error evaluando solución con ALMA:', error);
      throw error;
    }
  }

  /**
   * Realiza una llamada al endpoint de ALMA
   * @param {Array} messages - Lista de mensajes en formato {role, content}
   * @returns {Promise<string>} - Contenido del mensaje de respuesta
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
