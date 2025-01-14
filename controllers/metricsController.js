const service = require('../services/metricsService.js');
module.exports.metrics = function metrics(req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (!res.locals.oas.security.apiKeyAuth.authorized) {
        res.status(403).send({ error: 'Unauthorized' });
    } else if (
        !req.body.studentSolution || typeof req.body.studentSolution !== 'string' ||
        !req.body.exerciseSolution || typeof req.body.exerciseSolution !== 'string' ||
        !req.query.type || typeof req.query.type !== 'string'
    ) {
        res.status(400).send({ error: 'Bad Request' });
    } else {
        service.metrics(req, res);
    }
}