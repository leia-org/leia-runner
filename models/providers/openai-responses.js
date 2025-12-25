require('dotenv').config();
const OpenAI = require('openai');
const BaseModel = require('./baseModel');

class OpenAIResponsesProvider extends BaseModel {
  constructor() {
    super();
    this.name = 'openai-responses';
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.promptId = process.env.OPENAI_PROMPT_ID || null;
    this.model = process.env.OPENAI_RESPONSES_MODEL || 'gpt-4.1';
  }

  async createSession(options) {
    const { instructions } = options;
    
    try {
      // Create conversation to store message history
      const conversation = await this.openai.conversations.create();
      
      return {
        conversationId: conversation.id,
        instructions: instructions || ''
      };
    } catch (error) {
      console.error('Error creating session with OpenAI Responses API:', error);
      throw error;
    }
  }
  
  async sendMessage(options) {
    const { message, sessionData } = options;
    const { conversationId, instructions } = sessionData;
    
    if (!conversationId) {
      throw new Error('conversationId is required in sessionData');
    }
    
    try {
      const requestParams = {
        model: this.model,
        conversation: conversationId,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: message
              }
            ]
          }
        ]
      };

      // Use prompt ID from dashboard if configured, otherwise use dynamic instructions
      if (this.promptId) {
        requestParams.prompt = { id: this.promptId };
      } else if (instructions) {
        requestParams.instructions = instructions;
      } else {
        throw new Error('Either OPENAI_PROMPT_ID env var or instructions in sessionData must be provided');
      }

      const response = await this.openai.responses.create(requestParams);

      // Handle error and incomplete statuses before extracting response
      if (response.status === 'error') {
        const errorMessage = response.error?.message || 'Unknown error';
        const errorCode = response.error?.code || 'unknown';
        throw new Error(`Response API error (${errorCode}): ${errorMessage}`);
      }

      if (response.status === 'incomplete') {
        const reason = response.incomplete_details?.reason || 'unknown';
        const description = response.incomplete_details?.description || '';
        throw new Error(`Response incomplete (${reason}): ${description}`);
      }

      if (response.status !== 'completed') {
        throw new Error(`Response failed with status: ${response.status}`);
      }

      // Extract assistant message text from response.output array
      const assistantMessage = response.output.find(
        item => item.type === 'message' && item.role === 'assistant'
      );

      if (assistantMessage && assistantMessage.content && assistantMessage.content.length > 0) {
        const textContent = assistantMessage.content.find(
          content => content.type === 'output_text'
        );

        if (textContent && textContent.text) {
          return { message: textContent.text };
        } else {
          throw new Error('No text content found in assistant message');
        }
      } else {
        throw new Error('No assistant message found in response output');
      }
    } catch (error) {
      console.error('Error sending message to OpenAI Responses API:', error);
      throw error;
    }
  }

  async evaluateSolution(options) {
    const { leiaMeta, result } = options;

    const { solution, solutionFormat } = leiaMeta;

    try {
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

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_EVALUATION_MODEL || "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an evaluator. Your task is to evaluate solutions to problems and provide detailed feedback."
          },
          {
            role: "user",
            content: evaluationPrompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const messageContent = response.choices[0].message.content;
      const evaluationResult = JSON.parse(messageContent);
      return evaluationResult;
    } catch (error) {
      console.error("Error evaluating solution with OpenAI: " + error);
      throw error;
    }
  }
}

module.exports = new OpenAIResponsesProvider();

