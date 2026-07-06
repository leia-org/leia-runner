const problemGeneratorService = require("../services/problemGeneratorService");

/**
 * Generate a new problem based on an example problem
 * POST /api/v1/problems/generate
 */
const generateProblem = async (req, res) => {
    try {
        const { subject, additionalDetails, exampleProblem } = req.body;

        if (!subject) {
            return res.status(400).json({
                error: "Subject is required",
            });
        }

        if (!exampleProblem) {
            return res.status(400).json({
                error: "Example problem is required",
            });
        }

        const generatedProblem = await problemGeneratorService.generateProblem({
            subject,
            additionalDetails,
            exampleProblem,
        });

        res.json(generatedProblem);
    } catch (error) {
        console.error("Error generating problem:", error);

        // Handle specific OpenAI API errors
        if (error.code === "invalid_api_key") {
            return res.status(500).json({
                error: "OpenAI API configuration error",
            });
        }

        res.status(500).json({
            error: "Failed to generate problem",
            message: error.message,
        });
    }
};

module.exports = {
    generateProblem,
};
