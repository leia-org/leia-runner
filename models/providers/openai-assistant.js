require('dotenv').config();
const { OpenAI } = require('openai');
const z = require('zod');
const { zodTextFormat } = require('openai/helpers/zod');
const BaseModel = require('./baseModel');
const Errors = require('../../utils/errors');
const ProviderState = require('../providerState');

const EvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  evaluation: z.string(),
});

/**
 * Proveedor de OpenAI basado en Responses + Conversations.
 * Mantiene el nombre legacy del archivo para no romper la configuración actual.
 */
class OpenAIAssistantProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'openai-assistant';
    this.apiKeyEnvVar = 'OPENAI_API_KEY';
    this.model = 'gpt-5.4-mini';
    this.evaluationModel = process.env.OPENAI_EVALUATION_MODEL || 'gpt-5.4-mini';
  }

  // Requerido para el baseModel
  
  createClient(apiKey) {
    return new OpenAI({ apiKey });
  }

  // Métodos auxiliares
  
  async createConversation() {
    this.ensureApiKey();

    const conversation = await this.getClient().post('/conversations', { body: {} });

    if (!conversation?.id) {
      throw Errors.openAI.noConversationId();
    }

    return conversation;
  }

  extractResponseText(response) {
    if (typeof response?.output_text === 'string' && response.output_text.trim()) {
      return response.output_text.trim();
    }

    if (!Array.isArray(response?.output)) {
      return '';
    }

    return response.output
      .filter((item) => item?.type === 'message' && Array.isArray(item.content))
      .flatMap((item) => item.content)
      .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
      .map((content) => content.text.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  async sendMessage(options) {
    const { message, sessionData } = options;
    const state = new ProviderState(sessionData);
    const systemInstruction = state.getSystemInstruction();
    let conversationId = state.get('conversationId') || (state.threadId.startsWith('conv_') ? state.threadId : '');

    try {
      if (!conversationId) {
        if (sessionData?.threadId) {
          console.warn(
            'Sesion legacy de Assistants detectada. Se iniciara una nueva conversacion sin historial previo.'
          );
        }

        const conversation = await this.createConversation();
        conversationId = conversation.id;
      }

      const response = await this.getClient().responses.create({
        model: this.model,
        conversation: conversationId,
        instructions: systemInstruction,
        input: [
          {
            role: 'user',
            content: message,
          },
        ],
        store: true,
      });

      if (response?.error) {
        throw Errors.openAI.responseError(response.error.message);
      }

      const responseMessage = this.extractResponseText(response);

      if (!responseMessage) {
        throw Errors.openAI.noTextContent();
      }

      state.update({
        conversationId,
        systemInstruction,
        lastResponseId: response.id || state.get('lastResponseId'),
      });

      return {
        message: responseMessage,
        sessionData: state.buildSessionData(conversationId),
      };
    } catch (error) {
      throw Errors.openAI.messageSendError(error);
    }
  }

  /**
   * Realiza la llamada al API de OpenAI y devuelve la evaluación estructurada.
   * Invocado por BaseModel.evaluateSolution.
   * @param {string} prompt - Prompt de evaluación ya construido
   * @returns {Promise<Object>} - { score, evaluation }
   */
  async generateEvaluationResponse(prompt) {
    try {
      const response = await this.getClient().responses.parse({
        model: this.evaluationModel,
        input: [
          {
            role: 'system',
            content:
              'You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        text: {
          format: zodTextFormat(EvaluationSchema, 'evaluation_result'),
        },
      });

      if (!response.output_parsed) {
        throw Errors.openAI.noEvaluation();
      }

      return response.output_parsed;
    } catch (error) {
      throw Errors.openAI.evaluationError(error);
    }
  }
}

module.exports = new OpenAIAssistantProvider();
