const { OpenAI } = require("openai");
const z = require("zod");
const { zodResponseFormat } = require("openai/helpers/zod");


// Schema for generated problem
const ProblemSpecSchema = z.object({
    description: z.string().describe("A clear description of what the problem is about"),
    personaBackground: z.string().describe("Background context for the persona in this problem scenario"),
    details: z.string().describe("Extended details about the problem, including specific requirements"),
    solution: z.string().describe("The expected solution in the specified format"),
});

class ProblemGeneratorService {
    constructor() {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.client = openai;
    }

    /**
     * Generates a new problem based on an example problem with a different subject
     * @param {Object} params - Generation parameters
     * @param {string} params.subject - The new subject for the problem (e.g., "Prison Management System")
     * @param {string} params.additionalDetails - Optional additional instructions from the user
     * @param {Object} params.exampleProblem - The example problem to use as a template
     * @returns {Promise<Object>} - Generated problem matching the Problem schema
     */
    async generateProblem({ subject, additionalDetails, exampleProblem }) {
        if (!subject || !exampleProblem) {
            throw new Error("Subject and example problem are required");
        }

        const exampleSpec = exampleProblem.spec || exampleProblem;

        const prompt = `Generate a new problem for an educational exercise.

## CONTEXT:
LEIA is an educational platform where students practice by interacting with an AI that simulates a real-world scenario. The problem defines what scenario the AI will present.

## AVAILABLE TEMPLATE TAGS:
You can use these placeholders in the problem fields (description, personaBackground, details). They will be replaced at runtime with actual values:

### Persona tags:
- {{persona.fullName}} - Full name of the persona (e.g., "John Smith")
- {{persona.firstName}} - First name only (e.g., "John")
- {{persona.description}} - Description of the persona
- {{persona.personality}} - Personality traits
- {{persona.subjectPronoum}} - Subject pronoun (he/she/they)
- {{persona.objectPronoum}} - Object pronoun (him/her/them)
- {{persona.possesivePronoum}} - Possessive pronoun (his/hers/theirs)
- {{persona.possesiveAdjective}} - Possessive adjective (his/her/their)

## EXAMPLE PROBLEM (use as template for structure and style):
- Description: ${exampleSpec.description || "Not provided"}
- Persona Background: ${exampleSpec.personaBackground || "Not provided"}
- Details: ${exampleSpec.details || "Not provided"}
- Solution: ${exampleSpec.solution || "Not provided"}
- Solution Format: ${exampleSpec.solutionFormat || "text"}

## NEW PROBLEM REQUIREMENTS:
- Topic/Domain: "${subject}"
${additionalDetails ? `- Additional instructions: ${additionalDetails}` : ""}

## INSTRUCTIONS:
1. Create a problem about "${subject}" following EXACTLY the same structure as the example
2. The DESCRIPTION should explain the context of the organization/scenario that needs a solution
3. The PERSONA BACKGROUND should provide context about who the client/user is (role, experience, motivations) - use persona template tags like {{persona.fullName}} where appropriate
4. The DETAILS should include specific requirements, constraints and expected features
5. The SOLUTION must be complete and in ${exampleSpec.solutionFormat || "text"} format (if "mermaid", generate a valid UML class diagram)
6. Maintain the same level of complexity and detail as the example
7. Content should be realistic and educational for students
8. Use template tags ({{persona.*}}, {{behaviour.*}}) to make the content dynamic where it makes sense`;

        const response = await this.client.responses.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert educator and content creator, specialized in generating realistic educational problems and scenarios.

Your task is to generate problems that simulate real-world scenarios. The problems should be:
- Realistic and based on real business/organizational domains
- Complex enough for students to practice and learn
- Clear about what the scenario or challenge is
- With solutions that represent the expected outcome (in mermaid format if specified)

Always respond in the same language as the example problem provided.`,
                },
                { role: "user", content: prompt },
            ],
            text: {
                format: zodResponseFormat(ProblemSpecSchema, "problem_spec"),
            }
        });

        const generatedSpec = response.choices[0].message.parsed;

        // Build the complete problem object
        return {
            apiVersion: "v1",
            metadata: {
                name: subject.toLowerCase().replace(/\s+/g, "-"),
                version: "1.0.0",
            },
            spec: {
                ...generatedSpec,
                solutionFormat: exampleSpec.solutionFormat || "text",
                process: exampleSpec.process || [],
                extends: exampleSpec.extends || {},
                overrides: exampleSpec.overrides || {},
                constrainedTo: exampleSpec.constrainedTo || {},
            },
        };
    }
}

module.exports = new ProblemGeneratorService();
