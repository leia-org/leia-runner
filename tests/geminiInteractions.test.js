import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const axios = require('axios');
const {
  createGeminiInteraction,
  extractTextFromInteraction,
  normalizeGeminiResponseFormat,
} = require('../utils/geminiInteractions');

const original = {
  axiosPost: axios.post,
};

beforeEach(() => {
  axios.post = vi.fn();
});

afterEach(() => {
  axios.post = original.axiosPost;
});

describe('Gemini Interactions migration helpers', () => {
  test('prefiere output_text cuando el SDK lo expone', () => {
    const text = extractTextFromInteraction({
      output_text: ' respuesta directa ',
      steps: [
        {
          type: 'model_output',
          content: [{ type: 'text', text: 'respuesta desde steps' }],
        },
      ],
    });

    expect(text).toBe('respuesta directa');
  });

  test('acepta outputText si el SDK JS expone camelCase', () => {
    const text = extractTextFromInteraction({
      outputText: ' respuesta camelCase ',
    });

    expect(text).toBe('respuesta camelCase');
  });

  test('extrae texto desde steps del esquema nuevo', () => {
    const text = extractTextFromInteraction({
      steps: [
        {
          type: 'user_input',
          content: [{ type: 'text', text: 'pregunta' }],
        },
        {
          type: 'model_output',
          content: [
            { type: 'text', text: ' primer bloque ' },
            { type: 'text', text: 'segundo bloque' },
          ],
        },
      ],
    });

    expect(text).toBe('primer bloque\n\nsegundo bloque');
  });

  test('mantiene compatibilidad con outputs heredado', () => {
    const text = extractTextFromInteraction({
      outputs: [
        { type: 'thought', text: 'ignorado' },
        { type: 'text', text: 'respuesta antigua' },
      ],
    });

    expect(text).toBe('respuesta antigua');
  });

  test('envuelve un JSON Schema heredado en response_format de texto JSON', () => {
    const legacySchema = {
      type: 'object',
      properties: {
        score: { type: 'number' },
      },
      required: ['score'],
    };

    expect(normalizeGeminiResponseFormat(legacySchema)).toEqual({
      type: 'text',
      mime_type: 'application/json',
      schema: legacySchema,
    });
  });

  test('no modifica response_format multimodal ya migrado', () => {
    const migratedFormat = [
      { type: 'text', mime_type: 'application/json', schema: { type: 'object' } },
      { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1' },
    ];

    expect(normalizeGeminiResponseFormat(migratedFormat)).toEqual(migratedFormat);
  });

  test('usa el SDK cuando el cliente expone interactions.create', async () => {
    const sdkResponse = { id: 'int_sdk', output_text: 'ok' };
    const client = {
      interactions: {
        create: vi.fn().mockResolvedValue(sdkResponse),
      },
    };
    const requestBody = { model: 'gemini-test', input: 'hola' };

    await expect(createGeminiInteraction({ client, apiKey: 'AIzaSyTest', requestBody })).resolves.toBe(sdkResponse);
    expect(client.interactions.create).toHaveBeenCalledWith(requestBody);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('usa REST con Api-Revision cuando el SDK no expone interactions', async () => {
    const restResponse = { id: 'int_rest', steps: [] };
    const requestBody = { model: 'gemini-test', input: 'hola' };
    axios.post.mockResolvedValue({ data: restResponse });

    await expect(createGeminiInteraction({ client: {}, apiKey: 'AIzaSyTest', requestBody })).resolves.toBe(restResponse);

    const [url, payload, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions?key=AIzaSyTest');
    expect(payload).toBe(requestBody);
    expect(config.headers['Api-Revision']).toBe('2026-05-20');
  });
});
