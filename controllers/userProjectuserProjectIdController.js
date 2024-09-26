const service = require('../services/userProjectuserProjectIdService.js');
module.exports.sendMessageToAIProductOwner = function sendMessageToAIProductOwner(req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (!res.locals.oas.security.apiKeyAuth) {
        res.status(403).send({ error: 'Unauthorized' });
    } else if (
        !req.body.message || typeof req.body.message !== 'string' ||
        !req.body.owner || typeof req.body.owner !== 'string' ||
        !req.body.uml || typeof req.body.uml !== 'string' ||
        !req.params.userProjectId || typeof req.params.userProjectId !== 'string'
    ) {
        res.status(400).send({ error: 'Bad Request' });
    } else {
        service.sendMessageToAIProductOwner(req, res);
    }
}

