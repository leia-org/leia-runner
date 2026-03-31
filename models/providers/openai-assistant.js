require('dotenv').config();
const { OpenAI } = require('openai');
const z = require('zod');
const { zodTextFormat } = require('openai/helpers/zod');
const BaseModel = require('./baseModel');
const Errors = require('../../utils/errors');

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
    this.openai = new OpenAI({ apiKey: this.getApiKey() });
  }

  getProviderState(sessionData = {}) {
    const providerState =
      sessionData.providerState && typeof sessionData.providerState === 'object'
        ? sessionData.providerState
        : {};

    const threadId = typeof sessionData.threadId === 'string' ? sessionData.threadId : '';
    const conversationId =
      providerState.conversationId || (threadId.startsWith('conv_') ? threadId : '');

    if (!providerState.systemInstruction) {
      throw Errors.missingInstruction();
    }

    return {
      systemInstruction: providerState.systemInstruction,
      conversationId,
      lastResponseId: providerState.lastResponseId || '',
    };
  }

  async createConversation() {
    this.ensureApiKey();

    const conversation = await this.openai.post('/conversations', { body: {} });

    if (!conversation?.id) {
      throw Errors.openaiNoConversationId();
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

  buildSessionData({ conversationId, systemInstruction, lastResponseId = '' }) {
    return {
      assistantId: '',
      threadId: conversationId,
      providerState: {
        conversationId,
        systemInstruction,
        lastResponseId,
      },
    };
  }

  async createSession(options) {
    const { instructions } = options;

    if (!instructions) {
      throw Errors.missingInstructionOnCreate();
    }

    try {
      const conversation = await this.createConversation();

      return this.buildSessionData({
        conversationId: conversation.id,
        systemInstruction: instructions,
      });
    } catch (error) {
      throw Errors.sessionCreationError(error);
    }
  }

  async sendMessage(options) {
    const { message, sessionData } = options;
    const providerState = this.getProviderState(sessionData);

    try {
      let conversationId = providerState.conversationId;

      if (!conversationId) {
        if (sessionData?.assistantId || sessionData?.threadId) {
          console.warn(
            'Sesion legacy de Assistants detectada. Se iniciara una nueva conversacion sin historial previo.'
          );
        }

        const conversation = await this.createConversation();
        conversationId = conversation.id;
      }

      const response = await this.openai.responses.create({
        model: this.model,
        conversation: conversationId,
        instructions: providerState.systemInstruction,
        input: [
          {
            role: 'user',
            content: message,
          },
        ],
        store: true,
      });

      if (response?.error) {
        throw Errors.openaiResponseError(response.error.message);
      }

      const responseMessage = this.extractResponseText(response);

      if (!responseMessage) {
        throw Errors.openaiNoTextContent();
      }

      return {
        message: responseMessage,
        sessionData: this.buildSessionData({
          conversationId,
          systemInstruction: providerState.systemInstruction,
          lastResponseId: response.id || providerState.lastResponseId,
        }),
      };
    } catch (error) {
      throw Errors.messageSendError(error);
    }
  }

  async evaluateSolution(options) {
    const { leiaMeta, result } = options;
    const { solution, solutionFormat, evaluationPrompt } = leiaMeta;

    try {
      const prompt = Prompts.evaluation(solution, result, solutionFormat, evaluationPrompt);

      const response = await this.openai.responses.parse({
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
        throw Errors.openaiNoEvaluation();
      }

      return response.output_parsed;
    } catch (error) {
      throw Errors.evaluationError(error);
    }
  }
}

module.exports = new OpenAIAssistantProvider();
