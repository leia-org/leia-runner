const avatarService = require("../services/avatarGenerationService");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function handleAvatarGeneration(res, generator, payload, logLabel) {
  try {
    const result = await generator(payload);
    res.json(result);
  } catch (error) {
    console.error(`Error generating ${logLabel} avatar:`, error);

    if (error.code === "invalid_api_key" || error.message?.includes("API_KEY is not configured")) {
      return res.status(500).json({
        error: "AI provider configuration error",
      });
    }

    res.status(500).json({
      error: `Failed to generate ${logLabel} avatar`,
      message: error.message,
    });
  }
}

const generatePersonaAvatar = async (req, res) => {
  const { persona } = req.body;

  if (!isObject(persona)) {
    return res.status(400).json({ error: "Persona is required" });
  }

  return handleAvatarGeneration(
    res,
    avatarService.generatePersonaAvatar,
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
    avatarService.generateProblemAvatar,
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
    avatarService.generateLeiaAvatar,
    leia,
    "LEIA"
  );
};

module.exports = {
  generatePersonaAvatar,
  generateProblemAvatar,
  generateLeiaAvatar,
};
