require("dotenv").config();
const OpenAI = require("openai");
const BaseModel = require("./baseModel");
// const ollama = require("ollama").default;
const weaviate = require("weaviate-client");

const { Ollama } = require("ollama");

const ollama = new Ollama({
  host: process.env.OLLAMA_US_URL,
});

class OpenAIAssistantProvider extends BaseModel {
  constructor() {
    super();
    this.name = "ollama";
    this.threads = {};
    this.weaviateClient = null;
  }

  async getWeaviateClient() {
    if (this.weaviateClient) {
      try {
        const isReady = await this.weaviateClient.isReady();
        if (!isReady) {
          this.weaviateClient = null;
        }
      } catch (error) {
        this.weaviateClient = null;
      }
    }

    if (!this.weaviateClient) {
      this.weaviateClient = await weaviate.connectToCustom({
        httpHost: "127.0.0.1",
        httpPort: 8099,
        httpSecure: false,
        grpcHost: "127.0.0.1",
        grpcPort: 50051,
        grpcSecure: false,
        timeout: {
          query: 60,
          init: 30,
        },
      });
    }

    return this.weaviateClient;
  }

  async createSession(options) {
    const { instructions, sessionId } = options;

    try {
      const messages = [
        {
          role: "system",
          content: [{ type: "text", text: instructions }],
        },
      ];

      this.threads[sessionId] = messages;

      return {
        assistantId: sessionId,
        threadId: sessionId,
      };
    } catch (error) {
      throw error;
    }
  }

  async sendMessage(options) {
    const { message, sessionData } = options;
    const { threadId } = sessionData;

    const client = await this.getWeaviateClient();

    const collection = client.collections.get("TestWeaviate");
    const searchResult = await collection.query.nearText(message, {
      limit: 10,
      alpha: 0.5,
      returnProperties: ["texto", "origen"],
    });

    let RAGcontext = "";
    if (searchResult.objects && searchResult.objects.length > 0) {
      RAGcontext = searchResult.objects
        .map((obj, index) => {
          return `\n--- Documento ${index + 1} (Origen: ${obj.properties.origen}) ---\n${obj.properties.texto}\n`;
        })
        .join("\n");
    }

    try {
      if (!this.threads[threadId]) {
        this.threads[threadId] = [];
      }

      this.threads[threadId].push({
        role: "user",
        content: message,
      });

      const ollamaMessages = this.threads[threadId].map((msg) => ({
        role: msg.role,
        content: Array.isArray(msg.content)
          ? msg.content.map((c) => c.text || c).join("")
          : msg.content,
      }));

      const lastMessageIndex = ollamaMessages.length - 1;

      const promptPotenciado = `
      Answer the user's question. If applicable, use the following context extracted from the database:
      ${RAGcontext}

      User's question: ${ollamaMessages[lastMessageIndex].content}
      `;

      ollamaMessages[lastMessageIndex].content = promptPotenciado;

      const response = await ollama.chat({
        model: "llama3.1:8b",
        messages: ollamaMessages,
      });

      console.log(`El contenido extraido es: ${RAGcontext}`);

      const messageContent = response.message.content;

      this.threads[threadId].push({
        role: "assistant",
        content: messageContent,
      });

      return { message: messageContent };
    } catch (error) {
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

      const response = await ollama.chat({
        model: "llama3.1:8b",
        messages: [
          {
            role: "system",
            content:
              "You are an expert evaluator. Your task is to evaluate solutions to problems and provide detailed feedback.",
          },
          {
            role: "user",
            content: evaluationPrompt,
          },
        ],
        format: "json",
      });

      const messageContent = response.message.content;
      const evaluationResult = JSON.parse(messageContent);

      return evaluationResult;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new OpenAIAssistantProvider();
