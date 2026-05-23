const avatarService = require("../services/avatarService");

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

    const result = await avatarService.generatePersonaAvatar({
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

const generateProblemAvatar = async (req, res) => {
  try {
    const { name, description } = req.body;
    const hasProblemData = [name, description].some(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    if (!hasProblemData) {
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
    console.error("Error generating problem avatar:", error);

    if (error.code === "invalid_api_key" || error.message?.includes("API_KEY is not configured")) {
      return res.status(500).json({
        error: "AI provider configuration error",
      });
    }

    res.status(500).json({
      error: "Failed to generate problem avatar",
      message: error.message,
    });
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
    const hasLeiaData = [
      leiaName,
      personaName,
      personaDescription,
      problemDescription,
    ].some((value) => typeof value === "string" && value.trim().length > 0);

    if (!hasLeiaData) {
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
    console.error("Error generating LEIA avatar:", error);

    if (error.code === "invalid_api_key" || error.message?.includes("API_KEY is not configured")) {
      return res.status(500).json({
        error: "AI provider configuration error",
      });
    }

    res.status(500).json({
      error: "Failed to generate LEIA avatar",
      message: error.message,
    });
  }
};

module.exports = {
  generatePersonaAvatar,
  generateProblemAvatar,
  generateLeiaAvatar,
};
