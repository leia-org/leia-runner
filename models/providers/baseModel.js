const Errors = require('../../utils/errors');
const Prompts = require('../../utils/prompts');
const ProviderState = require('../providerState');

class BaseModel {
  constructor() {
    this.name = 'base';
    this.apiKeyEnvVar = '';
    this._client = null;
  }

  // Methods implemented for all providers by default

  /**
   * Gets the provider's API key from the environment variable.
   * @returns {string|undefined}
   */
  getApiKey() {
    return process.env[this.apiKeyEnvVar];
  }

  /**
   * Validates that the API key is configured.
   * @returns {string}
   */
  ensureApiKey() {
    if (!this.apiKeyEnvVar) {
      throw new Error('apiKeyEnvVar is not configured for this provider');
    }

    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error(`${this.apiKeyEnvVar} is not configured`);
    }

    return apiKey;
  }

   /**
   * Gets the provider client (lazy initialization).
   * @returns {Object} Provider client
   * @throws {Error} If API key is not configured
   */
  getClient() {
    const apiKey = this.ensureApiKey();
    if (!this._client) {
      this._client = this.createClient(apiKey);
    }
    return this._client;
  }

  /**
   * Gets the provider state from sessionData using ProviderState.
   * This method centralizes session state extraction logic.
   * @param {Object} sessionData - Session data
   * @returns {Object} Provider state
   */
  getProviderState(sessionData = {}) {
    const state = new ProviderState(sessionData);
    
    return {
      threadId: state.threadId,
      systemInstruction: state.getSystemInstruction(),
      providerState: state.providerState,
    };
  }

  /**
   * Creates a new session
   * @param {Object} options - Options for creating the session
   * @returns {Promise<Object>} - Created session data
   */
  async createSession(options) {
    const { instructions } = options;

    if (!instructions) {
      throw Errors.baseModel.missingInstructionOnCreate();
    }

    const threadId = await this.setThreadId();
    
    return {
      threadId,
      providerState: {
        systemInstruction: instructions
      }
    };
  }

  /**
   * Evaluates a student solution
   * @param {Object} options - Options for evaluation
   * @param {Object} options.leiaMeta - LEIA object with problem configuration
   * @param {string} options.result - Solution provided by the student
   * @returns {Promise<Object>} - Evaluation result
   */
  async evaluateSolution(options) {
    const { leiaMeta, result } = options;
    const { solution, solutionFormat, evaluationPrompt } = leiaMeta;

    try {
      const prompt = Prompts.evaluation(solution, result, solutionFormat, evaluationPrompt);

      const responseParsed = await this.generateEvaluationResponse(prompt);

      return responseParsed;
    } catch (error) {
      throw Errors.baseModel.evaluationError(error);
    }
  }

 // To be implemented by each provider

  /**
   * Creates the provider client. Must be implemented by each subclass.
   * Only called once, the first time the client is needed.
   * @returns {Object} Provider client
   */
  createClient() {
    throw new Error('Method createClient must be implemented by subclasses');
  }

  /**
   * Sends a message to the session
   * @param {Object} options - Options for sending the message
   * @returns {Promise<Object>} - Model response
   */
  async sendMessage(options) {
    throw new Error('Method sendMessage must be implemented by subclasses');
  }

  /**
   * Defines the threadId for the session. This method must be implemented by each provider to determine how to handle conversation context.
   * @returns {string} The threadId to use for the session, or an empty string if the provider does not use threadId. 
   */
  async setThreadId() {
    return '';
  }

  /**
   * Generates the evaluation response from the model's raw response. 
   * This method must be implemented by each provider to define how the model's response is processed to get the structured evaluation.
   * @returns {Object} The structured evaluation from the model's response
   * @throws {Error} If the method is not implemented by the subclass
   */
  generateEvaluationResponse() {
    throw new Error('Method generateEvaluationResponse must be implemented by subclasses');
  }
}

module.exports = BaseModel; 