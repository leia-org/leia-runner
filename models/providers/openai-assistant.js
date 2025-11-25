require('dotenv').config();
const OpenAI = require('openai');
const BaseModel = require('./baseModel');

/**
 * Proveedor de modelo basado en OpenAI Assistants API
 */
class OpenAIAssistantProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'openai-assistant';
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

  async evaluateSolution(options) {
    const { leiaMeta, result } = options;

    const { solution, solutionFormat } = leiaMeta;

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

      // Make a request to evaluate the solution
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_EVALUATION_MODEL || "gpt-4o",
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
        response_format: { type: "json_object" }
      });

      // Extract the content from the response
      const messageContent = response.choices[0].message.content;

      // Parse the JSON response
      const evaluationResult = JSON.parse(messageContent);
      return evaluationResult;
    } catch (error) {
      console.error("Error enviando a OpenAI: " + error)
      throw error;
    }
  }

  /**
   * Genera un embedding para el texto proporcionado
   * @param {string} text - Texto para generar embedding
   * @returns {Promise<Array<number>>} - Vector de embedding
   */
  async getEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-large",
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generando embedding:', error);
      throw error;
    }
  }

  /**
   * Genera una estructura de Problema basada en una descripción
   * @param {string} description - Descripción del problema
   * @returns {Promise<Object>} - Objeto Problema generado
   */
  async getOrCreateGeneratorAssistant() {
    if (this.generatorAssistantId) return this.generatorAssistantId;

    try {
      const myAssistants = await this.openai.beta.assistants.list({
        order: "desc",
        limit: 20,
      });

      const existingAssistant = myAssistants.data.find(a => a.name === "LEIA Problem Designer v2");

      if (existingAssistant) {
        this.generatorAssistantId = existingAssistant.id;
        return existingAssistant.id;
      }

      const assistant = await this.openai.beta.assistants.create({
        name: "LEIA Problem Designer v2",
        instructions: `You are an expert Product Owner and System Architect.
        Your goal is to help users define detailed "Problems" for software projects.
        
        You can chat with the user to clarify requirements.
        WHEN you have enough information to define a problem, OR when the user explicitly asks to generate/create the problem, you MUST use the "generate_problem" tool.
        
        Do not output JSON directly in the chat. Use the tool.`,
        model: "gpt-4o",
        tools: [{
          type: "function",
          function: {
            name: "generate_problem",
            description: "Generates a structured Problem definition for a software project.",
            parameters: {
              type: "object",
              properties: {
                apiVersion: { type: "string", enum: ["v1"] },
                metadata: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Short, descriptive name of the problem" },
                    version: {
                      type: "object",
                      properties: {
                        major: { type: "integer" },
                        minor: { type: "integer" },
                        patch: { type: "integer" }
                      },
                      required: ["major", "minor", "patch"]
                    }
                  },
                  required: ["name", "version"]
                },
                spec: {
                  type: "object",
                  properties: {
                    description: { type: "string", description: "Detailed description of the problem" },
                    personaBackground: { type: "string", description: "Context about the user/persona" },
                    details: { type: "string", description: "Specific requirements and details" },
                    solution: { type: "string", description: "Proposed solution" },
                    solutionFormat: { type: "string", enum: ["text", "mermaid", "yaml", "markdown", "html", "json", "xml"] },
                    process: { type: "array", items: { type: "string", enum: ["requirements-elicitation", "game"] } }
                  },
                  required: ["description", "details", "solution", "solutionFormat"]
                }
              },
              required: ["apiVersion", "metadata", "spec"]
            }
          }
        }]
      });

      this.generatorAssistantId = assistant.id;
      return assistant.id;
    } catch (error) {
      console.error('Error getting/creating generator assistant:', error);
      throw error;
    }
  }

  async runAssistantOnThread(threadId, assistantId) {
    const run = await this.openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    let runStatus = await this.openai.beta.threads.runs.retrieve(threadId, run.id);

    while (runStatus.status === "queued" || runStatus.status === "in_progress") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await this.openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    if (runStatus.status === "requires_action") {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
      const toolOutputs = [];
      let generatedProblem = null;

      for (const toolCall of toolCalls) {
        if (toolCall.function.name === "generate_problem") {
          try {
            generatedProblem = JSON.parse(toolCall.function.arguments);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ success: true, message: "Problem generated successfully" })
            });
          } catch (e) {
            console.error("Error parsing generated problem:", e);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ success: false, error: "Invalid JSON" })
            });
          }
        }
      }

      // Submit tool outputs to complete the run
      await this.openai.beta.threads.runs.submitToolOutputs(
        threadId,
        run.id,
        { tool_outputs: toolOutputs }
      );

      // Wait for completion after submitting outputs
      runStatus = await this.openai.beta.threads.runs.retrieve(threadId, run.id);
      while (runStatus.status === "queued" || runStatus.status === "in_progress") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await this.openai.beta.threads.runs.retrieve(threadId, run.id);
      }

      if (generatedProblem) {
        return { type: 'generated', data: generatedProblem };
      }
    }

    if (runStatus.status === "completed") {
      const messages = await this.openai.beta.threads.messages.list(threadId);
      const assistantMessage = messages.data.find(msg => msg.role === "assistant");
      if (assistantMessage && assistantMessage.content.length > 0) {
        return { type: 'text', message: assistantMessage.content[0].text.value };
      }
      throw new Error("No response from assistant");
    } else {
      throw new Error(`Assistant run failed with status: ${runStatus.status}`);
    }
  }

  async generateProblem(description, context) {
    try {
      const assistantId = await this.getOrCreateGeneratorAssistant();
      const thread = await this.openai.beta.threads.create();

      let contextPrompt = "";
      if (context) {
        if (context.persona) {
          contextPrompt += `\nCONTEXT - PERSONA:\n${JSON.stringify(context.persona.spec, null, 2)}\n`;
        }
        if (context.behaviour) {
          contextPrompt += `\nCONTEXT - BEHAVIOUR:\n${JSON.stringify(context.behaviour.spec, null, 2)}\n`;
        }
      }

      const prompt = `
        I need help defining a Problem for a software project.
        Description: "${description}"

        ${contextPrompt}

        Use the provided CONTEXT (Persona and Behaviour) to tailor the problem definition.
        If the description is vague, ask me for clarification.
        If it's clear enough, generate the problem definition using the tool.
      `;

      await this.openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: prompt
      });

      const result = await this.runAssistantOnThread(thread.id, assistantId);

      return {
        ...result,
        threadId: thread.id
      };

    } catch (error) {
      console.error('Error generating problem:', error);
      throw error;
    }
  }

  async refineProblem(threadId, instruction) {
    try {
      const assistantId = await this.getOrCreateGeneratorAssistant();

      await this.openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: instruction
      });

      const result = await this.runAssistantOnThread(threadId, assistantId);

      return {
        ...result,
        threadId: threadId
      };
    } catch (error) {
      console.error('Error refining problem:', error);
      throw error;
    }
  }

  async initializeRefinement(problem, context, originalQuery) {
    try {
      const assistantId = await this.getOrCreateGeneratorAssistant();
      const thread = await this.openai.beta.threads.create();

      let contextPrompt = "";
      if (context) {
        if (context.persona) {
          contextPrompt += `\nCONTEXT - PERSONA:\n${JSON.stringify(context.persona.spec, null, 2)}\n`;
        }
        if (context.behaviour) {
          contextPrompt += `\nCONTEXT - BEHAVIOUR:\n${JSON.stringify(context.behaviour.spec, null, 2)}\n`;
        }
      }

      let queryContext = "";
      if (originalQuery) {
        queryContext = `\nORIGINAL USER REQUEST:\n"${originalQuery}"\n`;
      }

      // Strip system fields to ensure a new ID is generated later
      const cleanProblem = { ...problem };
      delete cleanProblem.id;
      delete cleanProblem._id;
      delete cleanProblem.createdAt;
      delete cleanProblem.updatedAt;
      delete cleanProblem.user;
      if (cleanProblem.metadata) {
        delete cleanProblem.metadata.id;
        delete cleanProblem.metadata._id;
      }

      const prompt = `
            I want to start with this existing Problem definition:
            
            ${JSON.stringify(cleanProblem, null, 2)}

            ${contextPrompt}
            ${queryContext}

            Please acknowledge this problem definition. 
            I will then provide instructions to modify it.
          `;

      await this.openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: prompt
      });

      const result = await this.runAssistantOnThread(thread.id, assistantId);

      return {
        ...result,
        threadId: thread.id
      };
    } catch (error) {
      console.error('Error initializing refinement:', error);
      throw error;
    }
  }
}

module.exports = new OpenAIAssistantProvider();