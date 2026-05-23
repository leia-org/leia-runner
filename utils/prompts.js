const Prompts = {
  evaluation: (solution, result, solutionFormat, evaluationPrompt) => [
    'Evaluate the following solution for a problem:',
    '',
    'Expected solution:',
    solution,
    '',
    'Provided solution:',
    result,
    '',
    'The Format to compare is:',
    solutionFormat,
    '',
    'Evaluate the provided solution by comparing it with the expected solution.',
    'Assign a score between 0 and 10, where:',
    '- 10 means the solution is perfect',
    '- 0 means the solution is completely incorrect',
    'Provide a detailed evaluation in Markdown format.',
    '',
    'Respond ONLY with a JSON object in the following format:',
    '{',
    '  "score": [score between 0 and 10],',
    '  "evaluation": "[detailed evaluation in Markdown format]"',
    '}',
    ...(evaluationPrompt ? ['', evaluationPrompt] : []),
  ].join('\n'),

  personaAvatar: ({ name, description, personality }) => [
    "Create a square cartoon avatar icon for a persona.",
    "Style: clean flat vector-like illustration, thick black outlines, simple face and shoulders, plain muted solid background.",
    "Composition: centered head and upper shoulders, no text, no logo, no watermark, no photorealism.",
    "Output must be a single square image.",
    `Persona name: ${name || "Unknown"}.`,
    `Description: ${description || "No description provided"}.`,
    `Personality: ${personality || "No personality provided"}.`,
  ].join("\n"),

  
};

module.exports = Prompts;
