const axios = require('axios');

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_API_REVISION = '2026-05-20';

async function createGeminiInteraction({ client, apiKey, requestBody }) {
  if (client?.interactions && typeof client.interactions.create === 'function') {
    return client.interactions.create(requestBody);
  }

  const response = await axios.post(
    `${GEMINI_INTERACTIONS_URL}?key=${encodeURIComponent(apiKey)}`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'Api-Revision': GEMINI_API_REVISION,
      },
    }
  );

  return response.data;
}

function normalizeGeminiResponseFormat(responseFormat) {
  if (!responseFormat || typeof responseFormat !== 'object') {
    return responseFormat;
  }

  if (Array.isArray(responseFormat)) {
    return responseFormat.map(normalizeGeminiResponseFormat);
  }

  if (responseFormat.type === 'text' || responseFormat.type === 'image' || responseFormat.type === 'audio') {
    return responseFormat;
  }

  return {
    type: 'text',
    mime_type: 'application/json',
    schema: responseFormat,
  };
}

function extractTextFromInteraction(interaction) {
  if (!interaction) {
    return '';
  }

  if (typeof interaction.output_text === 'string' && interaction.output_text.trim()) {
    return interaction.output_text.trim();
  }

  if (typeof interaction.outputText === 'string' && interaction.outputText.trim()) {
    return interaction.outputText.trim();
  }

  const stepText = extractTextFromSteps(interaction.steps);
  if (stepText) {
    return stepText;
  }

  return extractTextFromLegacyOutputs(interaction.outputs);
}

function extractTextFromSteps(steps) {
  if (!Array.isArray(steps)) {
    return '';
  }

  return steps
    .filter((step) => step?.type === 'model_output' && Array.isArray(step.content))
    .flatMap((step) => step.content)
    .filter((content) => content?.type === 'text' && typeof content.text === 'string')
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function extractTextFromLegacyOutputs(outputs) {
  if (!Array.isArray(outputs)) {
    return '';
  }

  return outputs
    .filter((output) => output?.type === 'text' && typeof output.text === 'string')
    .map((output) => output.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

module.exports = {
  createGeminiInteraction,
  extractTextFromInteraction,
  normalizeGeminiResponseFormat,
};
