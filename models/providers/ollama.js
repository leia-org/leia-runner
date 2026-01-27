require('dotenv').config();
const OpenAI = require('openai');
const BaseModel = require('./baseModel');
const ollama = require('ollama').default;

/**
 * Proveedor de modelo basado en OpenAI Assistants API
 */
class OpenAIAssistantProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'ollama';
    this.threads = {};
  }

  /**
   * Crea una nueva sesión con OpenAI Assistants API
   * @param {Object} options - Opciones para crear la sesión
   * @param {string} options.instructions - Instrucciones iniciales para el asistente
   * @returns {Promise<Object>} - Detalles de la sesión creada
   */

  async createSession(options) {
    const { instructions, sessionId } = options;
    
    try {
      //Definimos las instruccines iniciales como
      /**
       * [
        {
            'role': 'system',
            'content': [
                {'type': 'text', 'text': "What's in this image?"},
            ],
        }
    ]
       */

    const messages = [
      {
        role: 'system',
        content: [
          { type: 'text', text: instructions }
        ]
      }
    ]


    this.threads[sessionId] = messages;

    return {
      assistantId: sessionId,
      threadId: sessionId
    };
  } catch (error) {
    console.error('Error al crear sesión con OpenAI Assistant:', error);
    throw error;
  }
}
  
    
  // async createSession(options) {
  //   const { instructions } = options;
    
  //   try {
  //     // Crear un asistente
  //     const assistant = await this.openai.beta.assistants.create({
  //       name: "LEIA Assistant",
  //       instructions: instructions || "Eres un asistente útil",
  //       tools: [], // Sin herramientas específicas por defecto
  //       model: "gpt-4o",
  //     });
      
  //     // Crear un thread
  //     const thread = await this.openai.beta.threads.create();
      
  //     // Almacenar referencias locales
  //     this.assistants[assistant.id] = assistant;
  //     this.threads[thread.id] = thread;
      
  //     return {
  //       assistantId: assistant.id,
  //       threadId: thread.id
  //     };
  //   } catch (error) {
  //     console.error('Error al crear sesión con OpenAI Assistant:', error);
  //     throw error;
  //   }
  // }
  
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
    const { threadId } = sessionData;
    
    try {
      // Inicializar thread si no existe (puede pasar si el servidor se reinició)
      if (!this.threads[threadId]) {
        this.threads[threadId] = [];
      }

      // Añadir mensaje al thread
      this.threads[threadId].push({
        role: "user",
        content: message
      });

      // Transformar mensajes al formato que Ollama espera (content como string)
      const ollamaMessages = this.threads[threadId].map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content)
          ? msg.content.map(c => c.text || c).join('')
          : msg.content
      }));

      const response = await ollama.chat({
        model: 'gemma3:1b',
        messages: ollamaMessages,
      })

      const messageContent = response.message.content;

      this.threads[threadId].push({
        role: "assistant",
        content: messageContent
      });


      return { message: messageContent };
    
    } catch (error) {
      console.error('Error enviando mensaje a OpenAI Assistant:', error);
      throw error;
    }
  }

  async evaluateSolution(options){
    const {leiaMeta, result} = options;

    const { solution, solutionFormat } = leiaMeta;

    try {
      // Create a prompt to evaluate the solution
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

      const response = await ollama.chat({
        model: 'gemma3:1b',
        messages: [
          {
            role: "system",
            content: "You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback."
          },
          {
            role: "user",
            content: evaluationPrompt
          }
        ],
        format: 'json'
      })

      // Make a request to evaluate the solution

      // Extract the content from the response
      const messageContent = response.message.content;
      
      // Parse the JSON response
      const evaluationResult = JSON.parse(messageContent);
      return evaluationResult;
    } catch (error){
      console.error("Error enviando a OpenAI: "+ error)
      throw error;
    }
  }
}

module.exports = new OpenAIAssistantProvider(); 