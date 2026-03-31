const createError = require('http-errors');

const baseModel = {
  missingInstruction: () =>
    createError(400, 'systemInstruction es requerida en providerState'),

  missingInstructionOnCreate: () =>
    createError(400, 'instructions es requerida para crear una sesion'),
};

const openAI = {
  noConversationId: () =>
    createError(500, 'OpenAI no devolvio un identificador de conversacion'),

  noTextContent: () =>
    createError(500, 'OpenAI no devolvio contenido de texto'),

  noEvaluation: () =>
    createError(500, 'OpenAI no devolvio una evaluacion estructurada'),

  responseError: (message) =>
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

const gemini = {
  clientLoadError: (originalError) =>
    createError(
      500,
      `No se pudo cargar @google/genai. Asegurate de usar Node 20+ y tener la dependencia instalada. Detalle: ${originalError.message}`
    ),

  noTextContent: () => createError(500, 'Gemini no devolvio contenido de texto'),

  noEvaluationContent: () =>
    createError(500, 'Gemini no devolvio contenido para la evaluacion'),

  interactionStatusError: (status) =>
    createError(500, `La interaccion de Gemini termino con estado: ${status}`),

  messageSendError: (originalError) => {
    console.error('Error enviando mensaje a Gemini:', originalError);
    return createError(500, 'Error enviando mensaje a Gemini');
  },

  evaluationError: (originalError) => {
    console.error('Error evaluando solucion con Gemini:', originalError);
    return createError(500, 'Error evaluando solucion con Gemini');
  },
};

const Errors = {
  baseModel,
  openAI,
  gemini,
};

module.exports = Errors;