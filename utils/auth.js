/**
 * Authentication middleware for Bearer tokens
 */
require('dotenv').config();

/**
 * Authentication middleware for Bearer token
 * @param {Object} req - HTTP Request
 * @param {Object} res - HTTP Response
 * @param {Function} next - Next function
 */
function bearerAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token not provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (token === process.env.RUNNER_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}

module.exports = {
  bearerAuth
}; 