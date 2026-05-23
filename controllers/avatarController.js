const avatarService = require("../services/avatarService");

function hasAnyText(values) {
  return values.some((value) => typeof value === "string" && value.trim().length > 0);
}

function handleAvatarError(res, error, label) {
  console.error(`Error generating ${label} avatar:`, error);

  if (error.code === "invalid_api_key" || error.message?.includes("API_KEY is not configured")) {
    return res.status(500).json({
      error: "AI provider configuration error",
    });
  }

  return res.status(500).json({
    error: `Failed to generate ${label} avatar`,
    message: error.message,
  });
}

const generatePersonaAvatar = async (req, res) => {
  try {
    const { name, fullName, firstName, description, personality } = req.body;
    const avatarName = [fullName, firstName, name].find(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    if (!hasAnyText([avatarName, description, personality])) {
      return res.status(400).json({
        error: "Persona data is required",
      });
    }

    const result = await avatarService.generatePersonaAvatar({
      name: avatarName,
      description,
      personality,
    });

    res.json(result);
  } catch (error) {
    handleAvatarError(res, error, "persona");
  }
};

const generateProblemAvatar = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!hasAnyText([name, description])) {
      return res.status(400).json({
        error: "Problem data is required",
      });
    }

    const result = await avatarService.generateProblemAvatar({
      name,
      description,
    });

    res.json(result);
  } catch (error) {
    handleAvatarError(res, error, "problem");
  }
};

const generateLeiaAvatar = async (req, res) => {
  try {
    const {
      leiaName,
      personaName,
      personaDescription,
      problemDescription,
    } = req.body;

    if (!hasAnyText([leiaName, personaName, personaDescription, problemDescription])) {
      return res.status(400).json({
        error: "LEIA data is required",
      });
    }

    const result = await avatarService.generateLeiaAvatar({
      leiaName,
      personaName,
      personaDescription,
      problemDescription,
    });

    res.json(result);
  } catch (error) {
    handleAvatarError(res, error, "LEIA");
  }
};

module.exports = {
  generatePersonaAvatar,
  generateProblemAvatar,
  generateLeiaAvatar,
};
