const vectorService = require('../services/vectorService');
const openaiProvider = require('../models/providers/openai-assistant');

class AgentController {
    async processRequest(req, res, next) {
        try {
            const { query, context, threadId, problem, originalQuery } = req.body;

            if (!query) {
                return res.status(400).json({ message: 'Query is required' });
            }

            // If threadId is present, the user is refining an existing generation
            if (threadId) {
                console.log(`Refining problem on thread ${threadId} with instruction: "${query}"`);
                const result = await openaiProvider.refineProblem(threadId, query);

                if (result.type === 'text') {
                    return res.json({
                        type: 'text',
                        message: result.message,
                        threadId: result.threadId
                    });
                }

                return res.json({
                    type: 'generated',
                    data: result.data,
                    threadId: result.threadId,
                    message: 'I have updated the problem based on your feedback.',
                });
            }

            // If problem is present, the user wants to personalize an existing problem
            if (problem) {
                console.log(`Personalizing problem: "${problem.metadata.name}"`);
                const result = await openaiProvider.initializeRefinement(problem, context, originalQuery);

                // Initialize refinement should always return a generated problem (the initial one)
                // But just in case, we handle the structure
                return res.json({
                    type: 'generated',
                    data: result.data || result.problem, // Handle potential legacy structure if any
                    threadId: result.threadId,
                    message: result.message || `Okay, let's personalize "${problem.metadata.name}". What would you like to change?`,
                });
            }

            console.log(`Processing agent request for query: "${query}"`);

            // 1. Search for similar problems
            const similarProblems = await vectorService.searchProblems(query);

            // Filter by distance (threshold)
            // Weaviate distance: 0 (identical) to 2 (opposite).
            // Adjusted threshold for text-embedding-3-large
            const threshold = 0.6;
            const matches = similarProblems.filter(p => p.distance < threshold);

            if (matches.length > 0) {
                console.log(`Found ${matches.length} similar problems.`);
                return res.json({
                    type: 'found',
                    data: matches,
                    message: 'Found similar existing problems.',
                });
            }

            // 2. If no good matches, generate a new problem (or chat)
            console.log('No similar problems found. Generating new problem or chatting...');
            const result = await openaiProvider.generateProblem(query, context);

            if (result.type === 'text') {
                return res.json({
                    type: 'text',
                    message: result.message,
                    threadId: result.threadId
                });
            }

            return res.json({
                type: 'generated',
                data: result.data,
                threadId: result.threadId,
                message: 'Generated a new problem based on your description.',
            });

        } catch (error) {
            console.error('Error in agent process:', error);
            next(error);
        }
    }

    async indexProblem(req, res, next) {
        try {
            const problem = req.body;
            if (!problem || !problem.metadata || !problem.spec) {
                return res.status(400).json({ message: 'Invalid problem structure' });
            }

            await vectorService.indexProblem(problem);
            res.json({ message: 'Problem indexed successfully' });
        } catch (error) {
            console.error('Error indexing problem:', error);
            next(error);
        }
    }
}

module.exports = new AgentController();
