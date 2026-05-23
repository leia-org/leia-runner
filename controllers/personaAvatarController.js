const personaAvatarService = require("../services/personaAvatarService");

const generatePersonaAvatar = async (req, res) => {
  try {
    const { name, fullName, firstName, description, personality } = req.body;
    const avatarName = [fullName, firstName, name].find(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    if (!avatarName && !description && !personality) {
      return res.status(400).json({
        error: "Persona data is required",
      });
    }

    const result = await personaAvatarService.generatePersonaAvatar({
      name: avatarName,
      description,
      personality,
    });

    res.json(result);
  } catch (error) {
    console.error("Error generating persona avatar:", error);

    if (error.code === "invalid_api_key" || error.message?.includes("API_KEY is not configured")) {
      return res.status(500).json({
        error: "AI provider configuration error",
      });
    }

    res.status(500).json({
      error: "Failed to generate persona avatar",
      message: error.message,
    });
  }
};

module.exports = {
  generatePersonaAvatar,
};
