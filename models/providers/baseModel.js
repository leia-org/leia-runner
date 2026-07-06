
class BaseModel {
  constructor() {
    this.name = 'base';
  }

  /**
   * Crea una nueva sesión
   * @param {Object} options - Opciones para crear la sesión
   * @returns {Promise<Object>} - Datos de la sesión creada
   */
  async createSession(options) {
    throw new Error('Method createSession must be implemented by subclasses');
  }

  /**
   * Envía un mensaje a la sesión
   * @param {Object} options - Opciones para enviar el mensaje
   * @returns {Promise<Object>} - Respuesta del modelo
   */
  async sendMessage(options) {
    throw new Error('Method sendMessage must be implemented by subclasses');
  }

  /**
   * Evalúa una solución de estudiante
   * @param {Object} options - Opciones para la evaluación
   * @param {Object} options.leia - Objeto LEIA con la configuración del problema
   * @param {string} options.result - Solución proporcionada por el estudiante
   * @returns {Promise<Object>} - Resultado de la evaluación
   */
  async evaluateSolution(options) {
    throw new Error('Method evaluateSolution must be implemented by subclasses');
  }
}

module.exports = BaseModel; 