/**
 * Middleware de autenticación para Bearer tokens
 */
require('dotenv').config();

/**
 * Middleware de autenticación para Bearer token
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 * @param {Function} next - Función next
 */
function bearerAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación no proporcionado' });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (token === process.env.RUNNER_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Token de autenticación inválido' });
  }
}

module.exports = {
  bearerAuth
}; 