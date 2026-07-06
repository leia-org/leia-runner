const { OpenAI } = require("openai");
const z = require("zod");
const { zodTextFormat } = require("openai/helpers/zod");

const MessagesSchema = z.object({
  messages: z.array(
    z.object({
      text: z.string(),
      timestamp: z.string(),
      isLeia: z.boolean(),
    })
  ),
});

class TranscriptionService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

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

    const response = await this.openai.responses.parse({
      model: "gpt-5",
      instructions: "Generate a realistic detailed conversation transcription in " + language + " between a real person and a LEIA (AI assistant). The transcription should cover everything necessary so that a reader can reach the exact same proposed solution (if applicable) without any additional context. The transcription should start with a message from the 'real' person (not the LEIA), and every 'real' person message must have a response from the LEIA. You will be given the prompt that the LEIA is based on. The user has no additional context but is implicit in the prompt what they have to do. It is important that you identify clearly which messages are from the 'real' person (which has no context) which is the interviewer and which are from the LEIA which is the interviewee.",
      input: leiaPrompt,
      text: {
        format: zodTextFormat(MessagesSchema, "messages"),
      },
      reasoning: { effort: "medium" }
    });

    const messages = response.output_parsed;
    return messages;
  }
}

module.exports = TranscriptionService;
