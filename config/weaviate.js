const weaviate = require('weaviate-ts-client').default;

const client = weaviate.client({
    scheme: 'http',
    host: 'weaviate.193.70.80.229.sslip.io',
    apiKey: new weaviate.ApiKey('YQFidvDuzJuViTLiho3cRUfcg1A72ub1'),
});

module.exports = client;
