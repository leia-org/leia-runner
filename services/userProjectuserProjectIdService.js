import('dotenv').then(dotenv => dotenv.config());
const userProjectMap = {};

let openai;
(async () => {
    const OpenAI = await import("openai");
    openai = new OpenAI.default(process.env.OPENAI_API_KEY);
})();

const prompt = "The following Mermaid UML diagram describes a software system.\n\n<UML>\n\n" +
    "You are the product owner of this software system. " +
    "The following information about the product owner is available:\n\n <OWNER>\n\n" +
    "Your task is to play the role of the product owner. " +
    "You will receive messages from a software developer who is working on this software system. " +
    "You must respond to each message with a message keeping in mind your role, and lead the developer to a similar solution to the Mermaid UML. " +
    "This is a formal conversation through a chat app. " +
    "You must follow the developer pace and have an slightly passive attitude. "

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

module.exports.sendMessageToAIProductOwner = async function sendMessageToAIProductOwner(req, res) {
    const uml = req.body.uml;
    const owner = req.body.owner;
    const extraInfo = req.body.extraInfo;
    const userProjectId = req.params.userProjectId;
    const message = req.body.message;

    let customPrompt = prompt.replace("<UML>", uml).replace("<OWNER>", owner);

    if (extraInfo) {
        customPrompt += "\n\nExtra information about the system:\n\n" + extraInfo;
    }

    if (!userProjectMap[userProjectId]) {
        try {
            const newAssistantId = await newAssistant(customPrompt);
            const newThreadId = await newThread();
            userProjectMap[userProjectId] = { assistantId: newAssistantId, threadId: newThreadId };
        } catch (error) {
            console.error(error);
            res.status(500).send({ error: "Error creating assistant or thread" });
            return;
        }
    }

    const assistantId = userProjectMap[userProjectId].assistantId;
    const threadId = userProjectMap[userProjectId].threadId;

    let newMessage;
    try {
        newMessage = await openai.beta.threads.messages.create(
            threadId,
            {
                role: "user",
                content: message,
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Error adding message to the thread" });
        return;
    }


    try {
        const run = await openai.beta.threads.runs.createAndPoll(
            threadId,
            {
                assistant_id: assistantId,
            }
        );

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
}
