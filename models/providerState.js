const Errors = require('../utils/errors');

/**
 * Clase para gestionar y validar el estado de los proveedores de IA.
 * Extrae y valida la información de sesión de forma consistente.
 */
class ProviderState {
  constructor(sessionData = {}) {
    this.sessionData = sessionData;
    this.providerState = this.extractProviderStateFromSessionData();
    this.threadId = typeof sessionData.threadId === 'string' ? sessionData.threadId : '';
  }

  /**
   * Extrae el objeto providerState de sessionData
   * @private
   * @returns {Object}
   */
  extractProviderStateFromSessionData() {
    return this.sessionData.providerState && typeof this.sessionData.providerState === 'object'
      ? this.sessionData.providerState
      : {};
  }

  /**
   * Obtiene la instrucción del sistema
   * @throws {Error} Si la instrucción del sistema no está definida
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
   * Obtiene el ID de interacción/conversación
   * Intenta obtenerlo de providerState primero, luego de threadId
   * @param {string} prefix - Prefijo esperado (ej: 'conv_' para OpenAI)
   * @returns {string}
   */
  getInteractionId(prefix = '') {
    const fromProvider = this.providerState.interactionId || '';
    
    if (fromProvider) {
      return fromProvider;
    }

    // Fallback: si threadId tiene el prefijo esperado, usarlo
    if (prefix && this.threadId.startsWith(prefix)) {
      return this.threadId;
    }

    return this.threadId || '';
  }

  /**
   * Obtiene una propiedad personalizada del providerState
   * @param {string} key - Clave de la propiedad
   * @param {*} defaultValue - Valor por defecto si no existe
   * @returns {*}
   */
  get(key, defaultValue = '') {
    return this.providerState[key] ?? defaultValue;
  }

  /**
   * Actualiza el providerState con nuevos valores
   * @param {Object} updates - Objeto con las actualizaciones
   * @returns {Object} El providerState actualizado
   */
  update(updates = {}) {
    this.providerState = { ...this.providerState, ...updates };
    return this.providerState;
  }

  /**
   * Construye el sessionData para devolver en respuestas
   * @param {string} newThreadId - El nuevo threadId (si aplica)
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
