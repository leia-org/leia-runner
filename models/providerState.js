const Errors = require('../utils/errors');

/**
 * Class to manage and validate the state of AI providers.
 * Extracts and validates session information consistently.
 */
class ProviderState {
  constructor(sessionData = {}) {
    this.sessionData = sessionData;
    this.providerState = this.extractProviderStateFromSessionData();
    this.threadId = typeof sessionData.threadId === 'string' ? sessionData.threadId : '';
  }

  /**
   * Extracts the providerState object from sessionData
   * @private
   * @returns {Object}
   */
  extractProviderStateFromSessionData() {
    return this.sessionData.providerState && typeof this.sessionData.providerState === 'object'
      ? this.sessionData.providerState
      : {};
  }

  /**
   * Gets the system instruction
   * @throws {Error} If system instruction is not defined
   * @returns {string}
   */
  getSystemInstruction() {
    const systemInstruction = this.providerState.systemInstruction;
    
    if (!systemInstruction) {
      throw Errors.baseModel.missingInstruction();
    }

    return systemInstruction;
  }

  /**
   * Gets the interaction/conversation ID
   * Tries to get it from providerState first, then from threadId
   * @param {string} prefix - Expected prefix (e.g., 'conv_' for OpenAI)
   * @returns {string}
   */
  getInteractionId(prefix = '') {
    const fromProvider = this.providerState.interactionId || '';
    
    if (fromProvider) {
      return fromProvider;
    }

    // Fallback: if threadId has the expected prefix, use it
    if (prefix && this.threadId.startsWith(prefix)) {
      return this.threadId;
    }

    return this.threadId || '';
  }

  /**
   * Gets a custom property from providerState
   * @param {string} key - Property key
   * @param {*} defaultValue - Default value if it doesn't exist
   * @returns {*}
   */
  get(key, defaultValue = '') {
    return this.providerState[key] ?? defaultValue;
  }

  /**
   * Updates providerState with new values
   * @param {Object} updates - Object with updates
   * @returns {Object} The updated providerState
   */
  update(updates = {}) {
    this.providerState = { ...this.providerState, ...updates };
    return this.providerState;
  }

  /**
   * Builds sessionData to return in responses
   * @param {string} newThreadId - The new threadId (if applicable)
   * @returns {Object}
   */
  buildSessionData(newThreadId = '') {
    return {
      threadId: newThreadId || this.threadId,
      providerState: this.providerState,
    };
  }
}

module.exports = ProviderState;
