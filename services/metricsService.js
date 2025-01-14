require('dotenv').config();
const { z } = require("zod");
const { zodResponseFormat } = require("openai/helpers/zod");

let openai;
(async () => {
  const OpenAI = await import("openai");
  openai = new OpenAI.default(process.env.OPENAI_API_KEY);
})();

const UMLMetricsSchema = z.object({
  classes: z.array(
    z.object({
      studentClassName: z.string(),
      similarTo: z.string().nullable(),
      similarity: z.number(),
      attributes: z.array(
        z.object({
          studentAttributeName: z.string(),
          similarTo: z.string().nullable(),
          similarity: z.number(),
        })
      ),
    })
  ),
  relations: z.array(
    z.object({
      studentRelation: z.object({
        source: z.string(),
        target: z.string(),
        type: z.string(),
        cardinality: z.object({
            source: z.string().nullable(),
            target: z.string().nullable(),
          }).nullable(),
      }),
      similarTo: z.object({
          source: z.string(),
          target: z.string(),
          type: z.string(),
          cardinality: z.object({
              source: z.string().nullable(),
              target: z.string().nullable(),
            }).nullable(),
        }).nullable(),
      similarity: z.number(),
    })
  ),
});

async function getMetricsUML(studentSolution, exerciseSolution) {
  // Define the system prompt
  const prompt = `You are an expert at comparing UML diagrams represented in Mermaid syntax. 
You will be provided with two diagrams: one from a student and one as the correct solution.
Your task is to analyze the semantic similarity between the elements of the diagrams, including classes, attributes in those classes, and relationships, taking into account the context of the problem described by the diagrams. 

Focus exclusively on the semantic meaning of the names within the problem domain, even if the names are in different languages (Spanish or English). For relationships, consider the semantic similarity of the class names involved (source and target). Ensure that the comparison is relevant to the context of the problem.

The output must include a detailed and structured response with the following:
1. **Classes**:
   - A list of matches between the student's classes/attributes and those in the solution.
   - For each class:
     - 'studentClassName': Name of the class in the student diagram.
     - 'similarTo': Name of the most similar class in the solution diagram, or 'null' if no match is found.
     - 'similarity': A similarity score from 0 to 1 based on semantic meaning.
     - For each attribute:
       - 'studentAttributeName': Name of the attribute in the student class.
       - 'similarTo': Name of the most similar attribute in the solution class, or 'null' if no match is found.
       - 'similarity': A similarity score from 0 to 1 based on semantic meaning.

2. **Relationships**:
   - A list of matches between the student's relationships and those in the solution, considering the classes involved, taking into accout the class matching.
   - For each relationship:
     - 'studentRelation': Contains:
       - 'source': Name of the source class in the student's relationship.
       - 'target': Name of the target class in the student's relationship.
       - 'type': Type of the relationship (e.g., association, inheritance, aggregation, composition).
       - 'cardinality': An object describing the cardinalities, including:
         - 'source': Cardinality from the source class.
         - 'target': Cardinality from the target class.
     - 'similarTo': The most similar relationship in the solution, or 'null' if no match is found. It includes:
       - 'source': Name of the source class.
       - 'target': Name of the target class.
       - 'type': Type of the relationship (e.g., association, inheritance, aggregation, composition).
       - 'cardinality': An object describing the cardinalities, including:
         - 'source': Cardinality from the source class.
         - 'target': Cardinality from the target class.
     - 'similarity': A similarity score from 0 to 1 based only in the class name of the classes involved, taking into account the class matching.

If no matches are found for a class, attribute, or relationship, provide a similarity score of 0 and set 'similarTo' to 'null'.

Make sure to be precise and context-aware in your comparisons, ensuring that all similarities are meaningful and relevant to the problem domain.
`;
  // Make the API call with structured response validation
  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Student Diagram:\n\n\`\`\`mermaid\n${studentSolution}\n\`\`\`\n\nExercise Solution:\n\n\`\`\`mermaid\n${exerciseSolution}\n\`\`\``,
      },
    ],
    response_format: zodResponseFormat(UMLMetricsSchema, "uml_metrics"),
  });
  const uml_metrics = completion.choices[0].message;
  return uml_metrics;
}

module.exports.metrics = async function metrics(req, res) {
  const studentSolution = req.body.studentSolution;
  const exerciseSolution = req.body.exerciseSolution;
  const type = req.query.type;

  let metrics;
  if (type === "requirements-gathering") {
    try {
      metrics = await getMetricsUML(studentSolution, exerciseSolution);
    } catch (error) {
      console.error(error);
      res.status(500).send({ error: "Error evaluating the diagram" });
      return;
    }
  } else {
    res.status(400).send({ error: "Bad Request" });
    return;
  }

  if (metrics.refusal) {
    console.log(metrics.refusal);
    res.status(400).send({ error: metrics.refusal });
  } else {
    console.log(metrics.parsed);
    res.send(metrics.parsed);
  }
};
