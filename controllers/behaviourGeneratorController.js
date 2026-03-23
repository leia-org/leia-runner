const behaviourGeneratorService = require("../services/behaviourGeneratorService");

/**
 * Generate a new behaviour based on an example behaviour
 * POST /api/v1/behaviours/generate
 */
const generateBehaviour = async (req, res) => {
    try {
        const { subject, additionalDetails, exampleBehaviour } = req.body;
        const normalizedSubject = typeof subject === "string" ? subject.trim() : "";

        if (!normalizedSubject) {
            return res.status(400).json({
                error: "Subject is required",
            });
        }

        if (!exampleBehaviour || typeof exampleBehaviour !== "object") {
            return res.status(400).json({
                error: "Example behaviour is required",
            });
        }

        const generatedBehaviour = await behaviourGeneratorService.generateBehaviour({
            subject: normalizedSubject,
            additionalDetails,
            exampleBehaviour,
        });

        res.json(generatedBehaviour);
    } catch (error) {
        console.error("Error generating behaviour:", error);

        if (error.code === "invalid_api_key") {
            return res.status(500).json({
                error: "OpenAI API configuration error",
            });
        }

        res.status(500).json({
            error: "Failed to generate behaviour",
            message: error.message,
        });
    }
};

module.exports = {
    generateBehaviour,
};
