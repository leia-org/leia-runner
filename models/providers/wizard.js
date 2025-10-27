require('dotenv').config();
const OpenAI = require('openai');
const BaseModel = require('./baseModel');
const { WIZARD_TOOLS, getFriendlyFunctionTitle, getFriendlyFunctionDescription } = require('../../utils/wizardTools');
const {
  analyzeRequirements,
  searchExistingPersonas,
  searchExistingProblems,
  searchExistingBehaviours,
  searchExistingLeias,
  loadLeiaById,
  cloneAndModifyLeia,
  evaluateComponentMatch,
  generatePersona,
  generateProblem,
  generateBehaviour,
  validateLeiaSpec,
  refineComponent
} = require('../../services/wizardFunctions');

/**
 * Map function names to their implementations
 */
const FUNCTION_HANDLERS = {
  analyze_requirements: analyzeRequirements,
  search_existing_personas: searchExistingPersonas,
  search_existing_problems: searchExistingProblems,
  search_existing_behaviours: searchExistingBehaviours,
  search_existing_leias: searchExistingLeias,
  load_leia_by_id: loadLeiaById,
  clone_and_modify_leia: cloneAndModifyLeia,
  evaluate_component_match: evaluateComponentMatch,
  generate_persona: generatePersona,
  generate_problem: generateProblem,
  generate_behaviour: generateBehaviour,
  validate_leia_spec: validateLeiaSpec,
  refine_component: refineComponent
};

/**
 * System prompt for the wizard agent
 */
const WIZARD_SYSTEM_PROMPT = `You are a LEIA Creation Wizard - an expert AI assistant that helps users create comprehensive Learning Experiences with Intelligent Agents (LEIAs).

Your goal is to understand what the user wants to create and intelligently:
1. Search for existing components (personas, problems, behaviours, or complete LEIAs) that might fit
2. Load and clone existing LEIAs when user wants to base new work on them
3. Evaluate if existing components are suitable (reuse when quality match is >70)
4. Generate new components when existing ones don't meet requirements
5. Validate that all components work together cohesively
6. Refine components based on user feedback

Key principles:
- Always start by analyzing requirements to understand what the user wants
- When user mentions "based on", "similar to", or references an existing LEIA, search and load it first
- Search for existing public components first before generating new ones
- Evaluate matches carefully - only reuse components with good fit (score >70)
- Generate new components when needed, ensuring they align with requirements
- Validate the final LEIA specification for coherence
- Be conversational and guide the user through the process
- Ask clarifying questions when requirements are unclear

Process flow:
1. Analyze user request → extract structured requirements
2. If user wants to base on existing LEIA:
   a. Search existing LEIAs → find the source LEIA
   b. Load complete LEIA → get all components
   c. Clone and modify → apply requested changes
3. Otherwise, search existing catalog → find potential matches
4. Evaluate matches → score component fitness
5. Generate missing components → create what's needed
6. Validate complete LEIA → ensure coherence
7. Present to user → explain choices and allow refinement

You can handle refinement requests at any stage - use the refine_component function to improve components based on user feedback.

For cloning LEIAs, use clone_and_modify_leia with specific modification instructions for each component (persona, problem, or behaviour).`;

/**
 * Proveedor de modelo para el LEIA Wizard con function calling
 */
class WizardProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'wizard';
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * Crea una nueva sesión de wizard
   * @param {Object} options - Opciones para crear la sesión
   * @param {string} options.instructions - Prompt inicial del usuario
   * @returns {Promise<Object>} - Detalles de la sesión creada
   */
  async createSession(options) {
    const { instructions, userToken } = options;

    return {
      messages: [
        { role: 'system', content: WIZARD_SYSTEM_PROMPT },
        { role: 'user', content: instructions }
      ],
      persona: null,
      problem: null,
      behaviour: null,
      completed: false,
      userToken: userToken || null // Store user token for accessing private resources
    };
  }

  /**
   * Envía un mensaje al wizard y procesa function calling con streaming
   * Este método retorna un async generator que hace yield de eventos en tiempo real
   *
   * @param {Object} options - Opciones para enviar el mensaje
   * @param {string} options.message - Mensaje a enviar (opcional para primera llamada)
   * @param {Object} options.sessionData - Datos de la sesión con historial de mensajes
   * @returns {AsyncGenerator} - Generator que hace yield de eventos del wizard
   */
  async *sendMessageStream(options) {
    const { message, sessionData } = options;

    // Si hay un mensaje nuevo, agregarlo al historial
    if (message) {
      sessionData.messages.push({ role: 'user', content: message });
    }

    let continueProcessing = true;
    let iterationCount = 0;
    const maxIterations = 15;

    while (continueProcessing && iterationCount < maxIterations) {
      iterationCount++;

      yield { type: 'thinking' };

      // Hacer llamada a OpenAI con function calling (sin streaming por ahora para tool calls)
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: sessionData.messages,
        tools: WIZARD_TOOLS,
        tool_choice: 'auto'
      });

      const responseMessage = completion.choices[0].message;
      sessionData.messages.push(responseMessage);

      // Verificar si el agente quiere llamar funciones
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Procesar cada function call
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          // Emitir evento de inicio de función
          yield {
            type: 'function_call_start',
            functionName,
            functionTitle: getFriendlyFunctionTitle(functionName),
            functionDescription: getFriendlyFunctionDescription(functionName, functionArgs),
            args: functionArgs
          };

          // Ejecutar la función
          const handler = FUNCTION_HANDLERS[functionName];
          if (!handler) {
            console.error(`Unknown function: ${functionName}`);
            continue;
          }

          // Pass userToken as second parameter for search functions
          const result = await handler(functionArgs, sessionData.userToken);

          // Emitir evento de función completada
          yield {
            type: 'function_call_complete',
            functionName,
            result
          };

          // Agregar resultado al historial
          sessionData.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });

          // Actualizar estado de la sesión
          this.updateSessionState(sessionData, functionName, result);
        }
      } else {
        // El agente devolvió un mensaje de texto sin function calls
        const textResponse = responseMessage.content;

        yield {
          type: 'message',
          content: textResponse
        };

        // Verificar si la LEIA está completa
        if (sessionData.persona && sessionData.problem && sessionData.behaviour) {
          sessionData.completed = true;

          yield {
            type: 'complete',
            leia: {
              persona: sessionData.persona,
              problem: sessionData.problem,
              behaviour: sessionData.behaviour
            }
          };
        }

        continueProcessing = false;
      }
    }

    if (iterationCount >= maxIterations) {
      console.warn('Wizard reached max iterations');
      yield {
        type: 'error',
        message: 'Process took too many steps. Please try refining your request.'
      };
    }
  }

  /**
   * Método heredado para compatibilidad con BaseModel
   * Llama a sendMessageStream y recolecta todos los eventos
   */
  async sendMessage(options) {
    const events = [];
    for await (const event of this.sendMessageStream(options)) {
      events.push(event);
    }

    return {
      message: 'Wizard processing complete',
      events,
      sessionData: options.sessionData
    };
  }

  /**
   * Actualiza el estado de la sesión basado en resultados de funciones
   */
  updateSessionState(sessionData, functionName, result) {
    if (!result.success) return;

    switch (functionName) {
      case 'generate_persona':
        if (result.persona) {
          sessionData.persona = result.persona;
        }
        break;

      case 'generate_problem':
        if (result.problem) {
          sessionData.problem = result.problem;
        }
        break;

      case 'generate_behaviour':
        if (result.behaviour) {
          sessionData.behaviour = result.behaviour;
        }
        break;

      case 'refine_component':
        if (result.refined) {
          const componentType = result.componentType;
          sessionData[componentType] = result.refined;
        }
        break;
    }
  }

  /**
   * No implementamos evaluateSolution ya que el wizard no evalúa soluciones
   */
  async evaluateSolution(options) {
    throw new Error('evaluateSolution is not supported by the wizard provider');
  }
}

module.exports = new WizardProvider();
