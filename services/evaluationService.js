const { OpenAI } = require("openai");
const z = require("zod");
const { zodResponseFormat } = require("openai/helpers/zod");

const EvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  feedback: z.string(),
  suggestions: z.array(z.string()),
});

class EvaluationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Evalúa una solución de estudiante contra la solución esperada
   * @param {Object} leia - Objeto LEIA con la configuración del problema
   * @param {string} result - Solución proporcionada por el estudiante
   * @returns {Promise<Object>} - Resultado de la evaluación
   */
  async evaluateSolution({ leia, result }) {
    if (!leia || !result) {
      throw new Error("LEIA object and result are required for evaluation");
    }

    if (!leia.spec?.problem?.spec?.solution) {
      throw new Error("LEIA object must contain the expected solution");
    }

    const expectedSolution = leia.spec.problem.spec.solution;
    const solutionFormat = leia.spec.problem.solutionFormat;

    let prompt;

    switch (solutionFormat) {
      case "mermaid":
        prompt = this.generateUMLDiagramPrompt(result, expectedSolution);
        break;
      default:
        prompt = this.generateGenericPrompt(
          result,
          expectedSolution,
          solutionFormat
        );
        break;
    }

    const response = await this.openai.beta.chat.completions.parse({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are an expert evaluator. Evaluate student solutions against expected solutions.",
        },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(EvaluationSchema),
      temperature: 0.7,
    });

    return response.choices[0].message;
  }

  /**
   * Genera un prompt específico para evaluación de diagramas UML
   * @param {string} studentSolution - Solución del estudiante
   * @param {string} exerciseSolution - Solución esperada del ejercicio
   * @returns {string} - Prompt generado
   */
  generateUMLDiagramPrompt(studentSolution, exerciseSolution) {
    return `Evaluate the following UML diagram:

Student's solution:
${studentSolution}

Exercise's solution:
${exerciseSolution}

You must give a brief explanation of the differences between the student's solution and the exercise's solution. The student task is to create a UML diagram that represents the conceptual model of a system, and the exercise's solution is the correct UML diagram for the conceptual model of this system. Keep in mind that although the student's solution may not be identical to the exercise's solution, it may still be correct. For example, the student may have used different names for classes or methods, but the overall structure may be correct. Name differences are will not be taken in account for the score.

The response must have the following sections: Classes, Relationships, Attributes, Key differences and Score.

In the section for Classes, check if all classes are present in the student model, if class names are consistent, and if any classes are missing or extra.

In the Relationships section, check if relationships are correct, if there are differences in type such as association, aggregation, or composition, if multiplicity is correct, and if any relationships are missing or extra.

In the Attributes section, check if all attributes are correctly defined for each class, if attribute names are consistent and if any attributes are missing or extra.

In the Key differences section, provide a summary of key differences and highlight any major issues that could impact design or implementation.

In the Score section, please give a score from 0 to 10 to the student's solution, where 0 is the UML does not describe the expected exercise's solution system at all and 10 is the UML defines perfectly the system from the given exercise's solution as expected. This score must be in the following format: "X/10", where X is the score.

The response must be in markdown format. Do not use a main title since this will be added later, so go straight to the points. This response will be seen by the student who submitted the solution, so refer to the student correctly, using the second person and his solution as your solution.`;
  }

  /**
   * Genera un prompt genérico para cualquier tipo de problema y formato de solución
   * @param {string} studentSolution - Solución del estudiante
   * @param {string} exerciseSolution - Solución esperada del ejercicio
   * @param {string} solutionFormat - Formato de la solución
   * @returns {string} - Prompt generado
   */
  generateGenericPrompt(studentSolution, exerciseSolution, solutionFormat) {
    return `Evaluate the following solution (${solutionFormat} format):

Student's solution:
${studentSolution}

Exercise's solution:
${exerciseSolution}

You must provide a comprehensive evaluation of the student's solution compared to the expected solution. Consider the following aspects:

1. **Correctness**: How well does the student's solution match the expected solution?
2. **Completeness**: Are all required elements present in the student's solution?
3. **Quality**: Is the solution well-structured and following best practices?
4. **Understanding**: Does the solution demonstrate proper understanding of the concepts?

Please provide detailed feedback in the following sections:

## Analysis
Compare the student's solution with the expected solution, highlighting similarities and differences.

## Strengths
Identify what the student did well in their solution.

## Areas for Improvement
Point out specific areas where the student's solution could be improved.

## Key Differences
Summarize the main differences between the student's solution and the expected solution.

## Score
Please give a score from 0 to 10 to the student's solution, where 0 means the solution is completely incorrect and 10 means the solution is perfect. This score must be in the following format: "X/10", where X is the score.

The response must be in markdown format. Do not use a main title since this will be added later, so go straight to the points. This response will be seen by the student who submitted the solution, so refer to the student correctly, using the second person and refer to their solution as "your solution".`;
  }
}

module.exports = new EvaluationService();
