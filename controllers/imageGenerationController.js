const imageService = require("../services/imageGenerationService");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function handleGenerationError(res, error, logMessage, responseError) {
  console.error(`${logMessage}:`, error);

  if (error.code === "invalid_api_key" || error.message?.includes("API_KEY is not configured")) {
    return res.status(500).json({
      error: "AI provider configuration error",
    });
  }

  return res.status(500).json({
    error: responseError,
    message: error.message,
  });
}

async function handleAvatarGeneration(res, generator, payload, logLabel) {
  try {
    const result = await generator(payload);
    res.json(result);
  } catch (error) {
    return handleGenerationError(
      res,
      error,
      `Error generating ${logLabel} avatar`,
      `Failed to generate ${logLabel} avatar`
    );
  }
}

const generatePersonaAvatar = async (req, res) => {
  const { persona } = req.body;

  if (!isObject(persona)) {
    return res.status(400).json({ error: "Persona is required" });
  }

  return handleAvatarGeneration(
    res,
    imageService.generatePersonaAvatar,
    persona,
    "persona"
  );
};

const generateProblemAvatar = async (req, res) => {
  const { problem } = req.body;

  if (!isObject(problem)) {
    return res.status(400).json({ error: "Problem is required" });
  }

  return handleAvatarGeneration(
    res,
    imageService.generateProblemAvatar,
    problem,
    "problem"
  );
};

const generateLeiaAvatar = async (req, res) => {
  const { leia } = req.body;

  if (!isObject(leia)) {
    return res.status(400).json({ error: "LEIA is required" });
  }

  return handleAvatarGeneration(
    res,
    imageService.generateLeiaAvatar,
    leia,
    "LEIA"
  );
};

const generateInfographic = async (req, res) => {
  const { behaviour, solution } = req.body;
  if (!isObject(behaviour)) {
    return res.status(400).json({ error: "Behaviour is required" });
  }
  try {
    const result = await imageService.generateInfographic(behaviour, solution);
    res.json(result);
  }
  catch (error) {
    return handleGenerationError(
      res,
      error,
      "Error generating infographic",
      "Failed to generate infographic"
    );
  }
};

module.exports = {
  generatePersonaAvatar,
  generateProblemAvatar,
  generateLeiaAvatar,
  generateInfographic
};
