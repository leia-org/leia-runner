const z = require("zod");
const structuredGenerationService = require("./structuredGenerationService");

const MessagesSchema = z.object({
  messages: z.array(
    z.object({
      text: z.string(),
      timestamp: z.string(),
      isLeia: z.boolean(),
    })
  ),
});

const MessagesResponseFormat = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          timestamp: { type: "string" },
          isLeia: { type: "boolean" },
        },
        required: ["text", "timestamp", "isLeia"],
      },
    },
  },
  required: ["messages"],
};

class TranscriptionService {
  /**
   * Generate a conversation transcription given a LEIA
   * @param {Object} leia - LEIA object
   * @returns {Promise<Array>} - Array of message objects
   */
  async generateTranscription({ leia, language = 'spanish' }) {
    if (!leia || !leia.spec?.behaviour?.spec?.description) {
      throw new Error("LEIA object with behaviour description is required for transcription");
    }

    const leiaPrompt = leia.spec.behaviour.spec.description;

    return structuredGenerationService.generateObject({
      systemPrompt:
        "Generate a realistic detailed conversation transcription in " +
        language +
        " between a real person and a LEIA (AI assistant). The transcription should cover everything necessary so that a reader can reach the exact same proposed solution (if applicable) without any additional context. The transcription should start with a message from the 'real' person (not the LEIA), and every 'real' person message must have a response from the LEIA. You will be given the prompt that the LEIA is based on. The user has no additional context but is implicit in the prompt what they have to do. It is important that you identify clearly which messages are from the 'real' person (which has no context) which is the interviewer and which are from the LEIA which is the interviewee.",
      userPrompt: leiaPrompt,
      zodSchema: MessagesSchema,
      schemaName: "messages",
      openaiModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-5",
      geminiModel:
        process.env.GEMINI_TRANSCRIPTION_MODEL ||
        process.env.GEMINI_MODEL ||
        "gemini-3.1-flash-lite-preview",
      geminiResponseFormat: MessagesResponseFormat,
      reasoning: { effort: "medium" },
    });
  }
}

module.exports = TranscriptionService;
