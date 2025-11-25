const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require('cors');
const { redisClient } = require('./config/redis');
const modelSyncService = require('./services/modelSyncService');
const modelManager = require('./models/modelManager');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Cargar la especificación OpenAPI
const swaggerDocument = YAML.load('./api/openapi.yml');

// Configurar Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Rutas
app.use('/api/v1', require('./routes/leiasRoutes'));
app.use('/api/v1/agent', require('./routes/agentRoutes'));

// Inicializar Redis y sincronizar modelos
async function initializeServer() {
  try {
    // Conectar a Redis
    await redisClient.connect();
    console.log('Connected to Redis');

    // Inicializar modelos
    await modelManager.initializeModels();
    console.log('Models initialized');

    // Sincronizar modelos en Redis
    await modelSyncService.syncModels();
    console.log('Models synchronized in Redis');

    // Inicializar Weaviate Schema
    const vectorService = require('./services/vectorService');
    await vectorService.ensureSchema();

    // Iniciar el servidor
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Error initializing server:', error);
    process.exit(1);
  }
}

initializeServer();

// Gracefully shutdown the server
process.on('SIGINT', () => {
  console.log('Received SIGINT. Gracefully shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Gracefully shutting down...');
  process.exit(0);
});