const express = require('express');
const router = express.Router();
const leiasController = require('../controllers/leiasController');
const modelsController = require('../controllers/modelsController');
const evaluationController = require('../controllers/evaluationController');
const cacheController = require('../controllers/cacheController');
const { bearerAuth } = require('../utils/auth');

// Aplicar middleware de autenticación a todas las rutas
router.use(bearerAuth);

// Endpoint para crear una nueva instancia de LEIA
router.post('/leias', leiasController.createLeia);

// Endpoint para enviar mensajes a LEIA
router.post('/leias/:sessionId/messages', leiasController.sendLeiaMessage);

// Endpoint para listar los modelos disponibles
router.get('/models', modelsController.listModels);

router.post('/evaluation', bearerAuth, evaluationController.evaluateSolution);

// Endpoints para gestión de caché
router.delete('/cache/purge', cacheController.purgeCache);
router.get('/cache/stats', cacheController.getCacheStats);

module.exports = router; 