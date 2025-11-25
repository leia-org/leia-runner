const weaviateClient = require('../config/weaviate');

const checkData = async () => {
    try {
        const res = await weaviateClient.graphql
            .get()
            .withClassName('Problem')
            .withFields('name description')
            .withLimit(5)
            .do();

        console.log(JSON.stringify(res, null, 2));
    } catch (error) {
        console.error(error);
    }
};

checkData();
