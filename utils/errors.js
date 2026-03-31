const createError = require('http-errors');

const Errors = {
  missingInstruction: () =>
    createError(400, 'systemInstruction es requerida en providerState'),

  missingInstructionOnCreate: () =>
    createError(400, 'instructions es requerida para crear una sesion'),

  openaiNoConversationId: () =>
    createError(500, 'OpenAI no devolvio un identificador de conversacion'),

  openaiNoTextContent: () =>
    createError(500, 'OpenAI no devolvio contenido de texto'),

  openaiNoEvaluation: () =>
    createError(500, 'OpenAI no devolvio una evaluacion estructurada'),

  openaiResponseError: (message) =>
    createError(500, message || 'OpenAI devolvio un error al generar la respuesta'),

  sessionCreationError: (originalError) => {
    console.error('Error al crear sesion con OpenAI Conversations:', originalError);
    return createError(500, 'Error creando sesion');
  },

  messageSendError: (originalError) => {
    console.error('Error enviando mensaje a OpenAI Conversations:', originalError);
    return createError(500, 'Error enviando mensaje');
  },

  evaluationError: (originalError) => {
    console.error('Error enviando a OpenAI:', originalError);
    return createError(500, 'Error evaluando solucion');
  },
};

module.exports = Errors;
