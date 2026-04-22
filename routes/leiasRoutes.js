const express = require('express');
const router = express.Router();
const leiasController = require('../controllers/leiasController');
const modelsController = require('../controllers/modelsController');
const evaluationController = require('../controllers/evaluationController');
const cacheController = require('../controllers/cacheController');
const transcriptionController = require('../controllers/transcriptionController');
const problemGeneratorController = require('../controllers/problemGeneratorController');
const behaviourGeneratorController = require('../controllers/behaviourGeneratorController');
const { bearerAuth } = require('../utils/auth');

// Apply authentication middleware to all routes
router.use(bearerAuth);

// Endpoint for creating a new LEIA instance
router.post('/leias', leiasController.createLeia);

// Endpoint for sending messages to LEIA
router.post('/leias/:sessionId/messages', leiasController.sendLeiaMessage);

// Endpoint for listing available models
router.get('/models', modelsController.listModels);

router.post('/evaluation', bearerAuth, evaluationController.evaluateSolution);

// Endpoints for cache management
router.delete('/cache/purge', cacheController.purgeCache);
router.get('/cache/stats', cacheController.getCacheStats);

// Endpoints for transcriptions
router.post('/transcriptions/generate', transcriptionController.generateTranscription);

// Endpoint for problem generation with AI
router.post('/problems/generate', problemGeneratorController.generateProblem);
router.post('/behaviours/generate', behaviourGeneratorController.generateBehaviour);

module.exports = router;
