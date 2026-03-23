const { OpenAI } = require("openai");
const z = require("zod");
const { zodTextFormat } = require("openai/helpers/zod");

const BehaviourSpecSchema = z.object({
    description: z.string().min(20).describe("Detailed behavioural instructions for the LEIA role, preserving template tags"),
    role: z.string().min(2).describe("Role name for the behaviour"),
    tooltip: z.string().min(4).describe("Short helper tooltip for this behaviour"),
});

const ALLOWED_PROCESS = ["requirements-elicitation", "game"];
const CORE_PLACEHOLDERS = [
    "{{problem.details}}",
    "{{problem.description}}",
    "{{persona.personality}}",
    "{{persona.fullName}}",
    "{{persona.description}}",
    "{{problem.personaBackground}}",
    "{{problem.solution}}",
    "{{behaviour.role}}",
];

const normalizeProcess = (process) => {
    if (!Array.isArray(process)) {
        return [];
    }

    return process.filter((value) => ALLOWED_PROCESS.includes(value));
};

const includesTag = (text, tag) =>
    typeof text === "string" && text.includes(tag);

const replaceTaggedSection = (text, tagName, placeholder) => {
    if (typeof text !== "string") return text;
    const regex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, "gi");
    return text.replace(regex, `<${tagName}>\n${placeholder}\n</${tagName}>`);
};

const sanitizeDescription = (description) => {
    if (typeof description !== "string") {
        return "";
    }

    let sanitized = description;
    sanitized = replaceTaggedSection(sanitized, "details", "{{problem.details}}");
    sanitized = replaceTaggedSection(sanitized, "statement", "{{problem.description}}");
    sanitized = replaceTaggedSection(sanitized, "personality", "{{persona.personality}}");
    sanitized = replaceTaggedSection(sanitized, "persona_name", "{{persona.fullName}}");
    sanitized = replaceTaggedSection(sanitized, "persona_description", "{{persona.description}}");
    sanitized = replaceTaggedSection(sanitized, "background", "{{problem.personaBackground}}");
    sanitized = replaceTaggedSection(sanitized, "engineerOutput", "{{problem.solution}}");

    // Remove accidental fenced blocks that harm runtime prompt quality.
    sanitized = sanitized.replace(/```[\s\S]*?```/g, "");

    // Remove leaked resource envelope fragments that should never appear inside behaviour text.
    sanitized = sanitized.replace(/"apiVersion"\s*:\s*"[^"]+"\s*,?/gi, "");
    sanitized = sanitized.replace(/^\s*,\s*$/gm, "");
    sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

    return sanitized.trim();
};

const normalizeOutputTag = (description, exampleDescription) => {
    if (typeof description !== "string") {
        return "";
    }

    if (!/<engineerOutput>/i.test(exampleDescription || "")) {
        return description;
    }

    return description
        .replace(/<\s*[a-zA-Z_]+Output\s*>/g, "<engineerOutput>")
        .replace(/<\s*\/\s*[a-zA-Z_]+Output\s*>/g, "</engineerOutput>")
        .replace(/<\s*resourceOutput\s*>/gi, "<engineerOutput>")
        .replace(/<\s*\/\s*resourceOutput\s*>/gi, "</engineerOutput>")
        .replace(/<\s*clientOutput\s*>/gi, "<engineerOutput>")
        .replace(/<\s*\/\s*clientOutput\s*>/gi, "</engineerOutput>")
        .replace(/<\s*lawyerOutput\s*>/gi, "<engineerOutput>")
        .replace(/<\s*\/\s*lawyerOutput\s*>/gi, "</engineerOutput>");
};

const ensurePlaceholders = (description, placeholders) => {
    let output = description || "";
    const missing = placeholders.filter((placeholder) => !includesTag(output, placeholder));

    if (missing.length > 0) {
        output = `${output}\n\n${missing.map((placeholder) => `Reference: ${placeholder}`).join("\n")}`.trim();
    }

    return output;
};

class BehaviourGeneratorService {
    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async generateBehaviour({ subject, additionalDetails, exampleBehaviour }) {
        if (!subject || !exampleBehaviour) {
            throw new Error("Subject and example behaviour are required");
        }

        const exampleSpec = exampleBehaviour.spec || exampleBehaviour;
        const behaviourProcess = normalizeProcess(exampleSpec.process);
        const exampleDescription = exampleSpec.description || "";
        const exampleRole = exampleSpec.role || "Not provided";
        const exampleTooltip = exampleSpec.tooltip || "Not provided";

        const requiredTags = CORE_PLACEHOLDERS.filter((tag) => includesTag(exampleDescription, tag));

        const prompt = `Generate a new behaviour for an educational LEIA exercise.

## CONTEXT:
LEIA uses a behaviour definition to guide how the AI should act during the conversation with students.
The behaviour is usually a long instruction prompt that can include dynamic placeholders.
This is not a problem statement: focus on interaction style, attitude, boundaries and response rules for the agent.

## AVAILABLE PLACEHOLDERS:
- {{persona.fullName}}
- {{persona.firstName}}
- {{persona.description}}
- {{persona.personality}}
- {{problem.description}}
- {{problem.details}}
- {{problem.personaBackground}}
- {{problem.solution}}
- {{behaviour.role}}
- {{behaviour.process}}

## EXAMPLE BEHAVIOUR (use as style/template):
- Description: ${exampleDescription || "Not provided"}
- Role: ${exampleRole}
- Tooltip: ${exampleTooltip}
- Process: ${behaviourProcess.length ? behaviourProcess.join(", ") : "Not provided"}

## NEW BEHAVIOUR REQUIREMENTS:
- New role/topic: "${subject}"
${additionalDetails ? `- Additional instructions: ${additionalDetails}` : ""}
${requiredTags.length ? `- Required tags in description: ${requiredTags.join(", ")}` : ""}

## INSTRUCTIONS:
1. Keep the same level of detail and instructional quality as the example.
2. Write a DESCRIPTION that clearly defines how LEIA should behave in this new role and still works as a runtime prompt.
2.1 The description must define agent behavior (tone, strictness, pacing, boundaries), not domain facts.
3. Provide a ROLE aligned with "${subject}".
4. Provide a short TOOLTIP that helps identify this behaviour in the UI.
5. Keep content realistic and educational.
6. Preserve the same language used in the example behaviour.
7. Keep template placeholders exactly as-is (double braces, same names).
8. Do not output markdown code fences or extra fields.
9. NEVER inline concrete case data inside tags like <details>, <statement>, <background>, <engineerOutput>; always keep placeholders there.`;

        const response = await this.client.responses.parse({
            model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
            input: [
                {
                    role: "system",
                    content: `You are an expert instructional designer specialized in crafting AI behavior prompts for educational simulations.

Generate behaviour specs that are practical, clear and suitable for student training scenarios.`,
                },
                { role: "user", content: prompt },
            ],
            text: {
                format: zodTextFormat(BehaviourSpecSchema, "behaviour_spec"),
            },
        });

        const generatedSpec = response.output_parsed || {};
        const generatedDescription = generatedSpec.description?.trim();
        const generatedRole = generatedSpec.role?.trim();
        const generatedTooltip = generatedSpec.tooltip?.trim();

        let finalDescription = generatedDescription || exampleDescription;
        finalDescription = normalizeOutputTag(finalDescription, exampleDescription);
        finalDescription = sanitizeDescription(finalDescription);
        const missingRequiredTags = requiredTags.filter(
            (tag) => !includesTag(finalDescription, tag)
        );
        if (missingRequiredTags.length > 0) {
            // If tags were lost during generation, preserve template reliability.
            finalDescription = exampleDescription;
        }
        finalDescription = sanitizeDescription(finalDescription);
        finalDescription = ensurePlaceholders(finalDescription, CORE_PLACEHOLDERS);

        const finalRole = subject.trim();
        const finalTooltip =
            generatedTooltip ||
            exampleSpec.tooltip ||
            `Behaviour for ${finalRole}`.slice(0, 120);

        return {
            spec: {
                description: finalDescription,
                role: finalRole,
                tooltip: finalTooltip,
                process: behaviourProcess,
            },
        };
    }
}

module.exports = new BehaviourGeneratorService();
