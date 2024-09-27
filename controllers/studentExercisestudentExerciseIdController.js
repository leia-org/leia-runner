const service = require('../services/studentExercisestudentExerciseIdService.js');
module.exports.sendMessageToAIProductOwner = function sendMessageToAIProductOwner(req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (!res.locals.oas.security.apiKeyAuth) {
        res.status(403).send({ error: 'Unauthorized' });
    } else if (
        !req.body.message || typeof req.body.message !== 'string' ||
        !req.body.owner || typeof req.body.owner !== 'string' ||
        !req.body.diagram || typeof req.body.diagram !== 'string' ||
        !req.params.studentExerciseId || typeof req.params.studentExerciseId !== 'string'
    ) {
        res.status(400).send({ error: 'Bad Request' });
    } else {
        service.sendMessageToAIProductOwner(req, res);
    }
}

