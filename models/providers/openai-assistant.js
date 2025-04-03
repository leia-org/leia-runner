require('dotenv').config();
const OpenAI = require('openai');

/**
 * Proveedor de modelo basado en OpenAI Assistants API
 */
class OpenAIAssistantProvider {
  constructor() {
    this.openai = new OpenAI(process.env.OPENAI_API_KEY);
    this.assistants = {};
    this.threads = {};
  }

  /**
   * Crea una nueva sesión con OpenAI Assistants API
   * @param {Object} options - Opciones para crear la sesión
   * @param {string} options.instructions - Instrucciones iniciales para el asistente
   * @returns {Promise<Object>} - Detalles de la sesión creada
   */
  async createSession(options) {
    const { instructions } = options;
    
    try {
      // Crear un asistente
      const assistant = await this.openai.beta.assistants.create({
        name: "LEIA Assistant",
        instructions: instructions || "Eres un asistente útil",
        tools: [], // Sin herramientas específicas por defecto
        model: "gpt-4o",
      });
      
      // Crear un thread
      const thread = await this.openai.beta.threads.create();
      
      // Almacenar referencias locales
      this.assistants[assistant.id] = assistant;
      this.threads[thread.id] = thread;
      
      return {
        assistantId: assistant.id,
        threadId: thread.id
      };
    } catch (error) {
      console.error('Error al crear sesión con OpenAI Assistant:', error);
      throw error;
    }
  }
  
  /**
   * Envía un mensaje al modelo
   * @param {Object} options - Opciones para enviar el mensaje
   * @param {string} options.sessionId - ID de la sesión
   * @param {string} options.message - Mensaje a enviar
   * @param {Object} options.sessionData - Datos de la sesión
   * @returns {Promise<Object>} - Respuesta del modelo
   */
  async sendMessage(options) {
    const { message, sessionData } = options;
    const { assistantId, threadId } = sessionData;
    
    try {
      // Añadir mensaje al thread
      await this.openai.beta.threads.messages.create(
        threadId,
        {
          role: "user",
          content: message,
        }
      );
      
      // Ejecutar el asistente
      const run = await this.openai.beta.threads.runs.create(
        threadId,
        { 
          assistant_id: assistantId 
        }
      );
      
      // Esperar a que finalice la ejecución
      let runStatus = await this.openai.beta.threads.runs.retrieve(
        threadId,
        run.id
      );
      
      // Esperar hasta que la ejecución se complete
      while (runStatus.status === "queued" || runStatus.status === "in_progress") {
        // Esperar 1 segundo antes de verificar de nuevo
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await this.openai.beta.threads.runs.retrieve(
          threadId,
          run.id
        );
      }
      
      if (runStatus.status === "completed") {
        // Obtener los mensajes más recientes
        const messages = await this.openai.beta.threads.messages.list(threadId);
        
        // El primer mensaje es el más reciente (respuesta del asistente)
        const assistantMessage = messages.data.find(msg => msg.role === "assistant");
        
        if (assistantMessage && assistantMessage.content.length > 0) {
          // Extraer el contenido de texto del mensaje
          const messageContent = assistantMessage.content[0].text.value;
          return { message: messageContent };
        } else {
          throw new Error("No se encontró respuesta del asistente");
        }
      } else {
        throw new Error(`La ejecución del asistente falló con estado: ${runStatus.status}`);
      }
    } catch (error) {
      console.error('Error enviando mensaje a OpenAI Assistant:', error);
      throw error;
    }
  }
}

module.exports = new OpenAIAssistantProvider(); 