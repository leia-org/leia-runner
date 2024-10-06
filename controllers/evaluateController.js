const service = require('../services/evaluateService.js');
module.exports.evaluate = function evaluate(req, res) {
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
        service.evaluate(req, res);
    }
}