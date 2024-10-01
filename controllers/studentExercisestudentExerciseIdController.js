const service = require('../services/studentExercisestudentExerciseIdService.js');
module.exports.sendMessageToAI = function sendMessageToAI(req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (!res.locals.oas.security.apiKeyAuth.authorized) {
        res.status(403).send({ error: 'Unauthorized' });
    } else if (
        !req.body.message || typeof req.body.message !== 'string' ||
        !req.body.prompt || typeof req.body.prompt !== 'string' ||
        !req.params.studentExerciseId || typeof req.params.studentExerciseId !== 'string'
    ) {
        res.status(400).send({ error: 'Bad Request' });
    } else {
        service.sendMessageToAI(req, res);
    }
}

