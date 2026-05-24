const express = require('express');
const router = express.Router();
const leiasController = require('../controllers/leiasController');
const multiLeiasController = require('../controllers/multiLeiasController');
const modelsController = require('../controllers/modelsController');
const evaluationController = require('../controllers/evaluationController');
const cacheController = require('../controllers/cacheController');
const transcriptionController = require('../controllers/transcriptionController');
const problemGeneratorController = require('../controllers/problemGeneratorController');
const behaviourGeneratorController = require('../controllers/behaviourGeneratorController');
const { bearerAuth } = require('../utils/auth');

// Aplicar middleware de autenticación a todas las rutas
router.use(bearerAuth);

// Endpoint para crear una nueva instancia de LEIA
router.post('/leias', leiasController.createLeia);
router.post('/multi-leias', multiLeiasController.createMultiLeia);

// Endpoint para enviar mensajes a LEIA
router.post('/leias/:sessionId/messages', leiasController.sendLeiaMessage);
router.post('/multi-leias/:sessionId/messages', multiLeiasController.sendMultiLeiaMessage);

// Endpoint para listar los modelos disponibles
router.get('/models', modelsController.listModels);

router.post('/evaluation', bearerAuth, evaluationController.evaluateSolution);

// Endpoints para gestión de caché
router.delete('/cache/purge', cacheController.purgeCache);
router.get('/cache/stats', cacheController.getCacheStats);

// Endpoints para transcripciones
router.post('/transcriptions/generate', transcriptionController.generateTranscription);

// Endpoint para generación de problemas con IA
router.post('/problems/generate', problemGeneratorController.generateProblem);
router.post('/behaviours/generate', behaviourGeneratorController.generateBehaviour);

module.exports = router;
