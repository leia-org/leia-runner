const weaviateClient = require('../config/weaviate');

const resetSchema = async () => {
    try {
        const className = 'Problem';
        console.log(`Deleting class ${className}...`);
        await weaviateClient.schema.classDeleter().withClassName(className).do();
        console.log(`Class ${className} deleted.`);
    } catch (error) {
        console.error('Error deleting schema:', error);
    }
};

resetSchema();
