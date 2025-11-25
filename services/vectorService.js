const weaviateClient = require('../config/weaviate');
const openaiProvider = require('../models/providers/openai-assistant');

class VectorService {
    constructor() {
        this.className = 'Problem';
    }

    async ensureSchema() {
        try {
            const schema = await weaviateClient.schema.getter().do();
            const classExists = schema.classes.some(c => c.class === this.className);

            if (!classExists) {
                const classObj = {
                    class: this.className,
                    description: 'A LEIA Problem definition',
                    vectorizer: 'none', // We provide our own vectors
                    properties: [
                        {
                            name: 'name',
                            dataType: ['text'],
                            description: 'Name of the problem',
                        },
                        {
                            name: 'description',
                            dataType: ['text'],
                            description: 'Description of the problem',
                        },
                        {
                            name: 'content',
                            dataType: ['text'],
                            description: 'Full JSON content of the problem',
                        },
                        {
                            name: 'originalId',
                            dataType: ['string'],
                            description: 'ID in the MongoDB database',
                        },
                    ],
                };

                await weaviateClient.schema.classCreator().withClass(classObj).do();
                console.log(`Class ${this.className} created in Weaviate.`);
            }
        } catch (error) {
            console.error('Error ensuring schema:', error);
            throw error;
        }
    }

    async indexProblem(problem) {
        try {
            const textToEmbed = `${problem.metadata.name}: ${problem.spec.description}`;
            const vector = await openaiProvider.getEmbedding(textToEmbed);

            await weaviateClient.data
                .creator()
                .withClassName(this.className)
                .withProperties({
                    name: problem.metadata.name,
                    description: problem.spec.description,
                    content: JSON.stringify(problem),
                    originalId: problem.id || problem._id.toString(),
                })
                .withVector(vector)
                .do();

            console.log(`Problem ${problem.metadata.name} indexed.`);
        } catch (error) {
            console.error('Error indexing problem:', error);
            throw error;
        }
    }

    async searchProblems(query, limit = 3) {
        try {
            const vector = await openaiProvider.getEmbedding(query);

            const res = await weaviateClient.graphql
                .get()
                .withClassName(this.className)
                .withFields('name description content originalId _additional { distance }')
                .withNearVector({ vector })
                .withLimit(limit)
                .do();

            const problems = res.data.Get[this.className].map(item => ({
                ...JSON.parse(item.content),
                distance: item._additional.distance,
            }));

            return problems;
        } catch (error) {
            console.error('Error searching problems:', error);
            throw error;
        }
    }
}

module.exports = new VectorService();
