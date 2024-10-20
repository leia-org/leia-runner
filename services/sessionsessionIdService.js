import("dotenv").then((dotenv) => dotenv.config());
const sessionMap = {};

let openai;
(async () => {
  const OpenAI = await import("openai");
  openai = new OpenAI.default(process.env.OPENAI_API_KEY);
})();

async function newAssistant(instructions) {
  const assistant = await openai.beta.assistants.create({
    name: "Customer LEIA",
    model: "gpt-4o",
    instructions: instructions,
  });

  return assistant.id;
}

async function newThread() {
  const thread = await openai.beta.threads.create();

  return thread.id;
}

module.exports.sendMessageToAI = async function sendMessageToAI(req, res) {
  const prompt = req.body.prompt;
  const sessionId = req.params.sessionId;
  const message = req.body.message;

  if (!sessionMap[sessionId]) {
    try {
      const newAssistantId = await newAssistant(prompt);
      const newThreadId = await newThread();
      sessionMap[sessionId] = {
        assistantId: newAssistantId,
        threadId: newThreadId,
      };
    } catch (error) {
      console.error(error);
      res.status(500).send({ error: "Error creating assistant or thread" });
      return;
    }
  }

  const assistantId = sessionMap[sessionId].assistantId;
  const threadId = sessionMap[sessionId].threadId;

  let newMessage;
  try {
    newMessage = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Error adding message to the thread" });
    return;
  }

  try {
    const run = await openai.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: assistantId,
    });

    if (run.status === "completed") {
      const responses = await openai.beta.threads.messages.list(run.thread_id);
      let lastResponse = responses.data[0];
      lastResponse = lastResponse.content[0].text.value;
      res.status(200).send({ message: lastResponse });
    } else {
      console.log(run.status);
      res.status(500).send({ error: "Error running assistant" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Error running assistant" });
  }
};
