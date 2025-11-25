const express = require('express');
const agentController = require('../controllers/agentController');

const router = express.Router();

router.post('/process', agentController.processRequest);
router.post('/index', agentController.indexProblem);

module.exports = router;
