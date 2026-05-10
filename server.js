const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require('cors');
const { redisClient, initRedis } = require('./config/redis');
const modelSyncService = require('./services/modelSyncService');
const modelManager = require('./models/modelManager');
const oasTelemetry = require('@oas-tools/oas-telemetry');
const path = require('path');
const { readFileSync } = require('fs');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(oasTelemetry({ general: { spec: readFileSync(path.join(__dirname, 'api', 'openapi.yml'), { encoding: 'utf8', flag: 'r' }) } }));
app.use(express.json());

// Load OpenAPI specification
const swaggerDocument = YAML.load('./api/openapi.yml');

// Configure Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use('/api/v1', require('./routes/leiasRoutes'));

// Initialize Redis and synchronize models
async function initializeServer() {
  try {
    // Connect to Redis
    await initRedis();
    console.log('Connected to Redis');

    // Initialize models
    await modelManager.initializeModels();
    console.log('Models initialized');

    // Synchronize models in Redis
    await modelSyncService.syncModels();
    console.log('Models synchronized in Redis');

    // Start the server
    app.listen(port, () => {
      console.log(`Swagger UI available at http://localhost:${port}/docs`);
      console.log(`Telemetry available at http://localhost:${port}/telemetry`);
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Error initializing server:', error);
    process.exit(1);
  }
}

initializeServer();

// Gracefully shutdown the server
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Gracefully shutting down...');
    if (redisClient.isOpen) await redisClient.disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Gracefully shutting down...');
    if (redisClient.isOpen) await redisClient.disconnect();
    process.exit(0);
});