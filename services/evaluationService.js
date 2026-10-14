const z = require("zod");
const structuredGenerationService = require("./structuredGenerationService");

const EvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  feedback: z.string(),
  suggestions: z.array(z.string()),
});

const EvaluationResponseFormat = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description: "Numeric score between 0 and 10",
    },
    feedback: {
      type: "string",
      description: "Detailed evaluation feedback",
    },
    suggestions: {
      type: "array",
      items: {
        type: "string",
      },
      description: "Concrete suggestions for improvement",
    },
  },
  required: ["score", "feedback", "suggestions"],
};

class EvaluationService {
  /**
   * Evaluates a student solution against the expected solution
   * @param {Object} leia - LEIA object with problem configuration
   * @param {string} result - Solution provided by the student
   * @returns {Promise<Object>} - Evaluation result
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
    const evaluationPrompt = leia.spec.problem.evaluationPrompt;

    const prompt = this.generatePrompt(result, expectedSolution, solutionFormat, evaluationPrompt)

    return structuredGenerationService.generateObject({
      systemPrompt:
        "You are an expert evaluator. Evaluate student solutions against expected solutions.",
      userPrompt: prompt,
      zodSchema: EvaluationSchema,
      schemaName: "evaluation",
      openaiModel:
        process.env.OPENAI_EVALUATION_MODEL ||
        process.env.OPENAI_MODEL ||
        "gpt-4.1-mini",
      geminiModel:
        process.env.GEMINI_EVALUATION_MODEL ||
        process.env.GEMINI_MODEL ||
        "gemini-3.1-flash-lite-preview",
      geminiResponseFormat: EvaluationResponseFormat,
    });
  }

  generatePrompt(studentSolution, exerciseSolution, format, evaluationPrompt) {
    if (!evaluationPrompt) {
      switch (format) {
        case "mermaid":
          return this.generateUMLDiagramPrompt(studentSolution, exerciseSolution);
        default:
          return this.generateGenericPrompt(studentSolution, exerciseSolution, format);
      }
    }

    return `Evaluate the following solution (${format} format):

Student's solution:
${studentSolution}

Exercise's solution:
${exerciseSolution}

${evaluationPrompt}`
  }

  /**
   * Generates a specific prompt for UML diagram evaluation
   * @param {string} studentSolution - Student solution
   * @param {string} exerciseSolution - Expected exercise solution
   * @returns {string} - Generated prompt
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
   * Generates a generic prompt for any problem type and solution format
   * @param {string} studentSolution - Student solution
   * @param {string} exerciseSolution - Expected exercise solution
   * @param {string} solutionFormat - Solution format
   * @returns {string} - Generated prompt
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
