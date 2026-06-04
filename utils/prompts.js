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
    "Create a realistic square profile photo of a person.",
    "Style: natural photorealistic headshot, professional but approachable, with realistic skin texture, facial features, hair, and clothing.",
    "Composition: centered head and upper shoulders, photographed straight-on from the front at eye level. The person must face the camera directly and look into the lens. Do not use a side profile, three-quarter angle, tilted pose, or cropped face.",
    "Use soft natural lighting and a simple realistic background with enough contrast around the subject.",
    "Vary the background between generations. Choose a subtle background that fits the person, such as a softly blurred office, library, cafe, home interior, outdoor setting, or a tasteful solid color. Vary the color palette and setting instead of always using the same neutral studio background.",
    "The result should look like a real profile photograph, not an illustration, cartoon, painting, 3D render, or stylized image.",
    "No text, logo, watermark, border, props, additional people, or distracting background elements.",
    "Output must be a single square image.",
    `Persona name: ${name || "Unknown"}.`,
    `Description: ${description || "No description provided"}.`,
    `Personality: ${personality || "No personality provided"}.`,
  ].join("\n"),

  problemAvatar: ({ name, description }) => [
    "Create a square cartoon icon for a problem or exercise.",
    "Style: clean flat vector-like illustration, thick black outlines, simple symbolic scene, plain muted solid background.",
    "Keep it very simple and readable at tiny sizes: use large clear shapes, very few details, high contrast, and one main visual idea.",
    "Composition: centered main object or situation, no text, no logo, no watermark, no photorealism.",
    "Output must be a single square image.",
    `Problem name: ${name || "Unknown"}.`,
    `Description: ${description || "No description provided"}.`,
  ].join("\n"),

  leiaAvatar: ({
    leiaName,
    personaName,
    personaDescription,
    problemDescription,
  }) => [
    "Create a square cartoon icon for a LEIA learning assistant configuration.",
    "Style: clean flat vector-like illustration, thick black outlines, simple symbolic scene, plain muted solid background.",
    "Keep it very simple and readable at tiny sizes: use large clear shapes, very few details, high contrast, and one main visual idea.",
    "Composition: centered main subject or situation, no text, no logo, no watermark, no photorealism.",
    "Output must be a single square image.",
    `LEIA name: ${leiaName || "Unknown"}.`,
    `Persona name: ${personaName || "Unknown"}.`,
    `Persona description: ${personaDescription || "No persona description provided"}.`,
    `Problem description: ${problemDescription || "No problem description provided"}.`,
  ].join("\n"),

  
};

module.exports = Prompts;
