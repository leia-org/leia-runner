const { OpenAI } = require('openai');

class EvaluationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
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
      throw new Error('LEIA object and result are required for evaluation');
    }

    // Verificar que el objeto LEIA tenga la estructura esperada
    if (!leia.spec?.problem?.spec?.solution) {
      throw new Error('LEIA object must contain the expected solution');
    }

    // Obtener la solución esperada y el formato
    const expectedSolution = leia.spec.problem.spec.solution;
    const solutionFormat = leia.spec.problem.solutionFormat || 'text';

    // Crear el prompt para la evaluación
    const prompt = `Please evaluate the following solution against the expected solution.
Expected solution: ${expectedSolution}
Solution format: ${solutionFormat}
Student's solution: ${result}

Please provide a detailed evaluation including:
1. A score from 0 to 100
2. Specific feedback on what was done correctly and what needs improvement
3. Suggestions for improvement

Respond in JSON format with the following structure:
{
  "score": number,
  "feedback": string,
  "suggestions": string[]
}`;

    // Hacer la solicitud a la API de OpenAI
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert evaluator. Your task is to evaluate student solutions against expected solutions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    // Parsear la respuesta
    const evaluationResult = JSON.parse(response.choices[0].message.content);

    return {
      score: evaluationResult.score,
      feedback: evaluationResult.feedback,
      suggestions: evaluationResult.suggestions
    };
  }
}

module.exports = new EvaluationService(); 