import { describe, expect, beforeAll, afterAll, test } from 'vitest';
import { z } from 'zod';

require('dotenv').config();

const structuredGenerationService = require('../services/structuredGenerationService');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

const MiniEvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  feedback: z.string().min(1),
  suggestions: z.array(z.string()).min(1),
});

const MiniEvaluationResponseFormat = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 10 },
    feedback: { type: 'string' },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['score', 'feedback', 'suggestions'],
};

let originalProvider;

async function runWithSchemaRetry(action, { maxAttempts = 3 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isSchemaRangeError =
        message.includes('too_big') ||
        message.includes('too_small') ||
        message.includes('Number must be less than or equal to') ||
        message.includes('Number must be greater than or equal to');

      if (!isSchemaRangeError || attempt === maxAttempts) {
        break;
      }
    }
  }

  throw lastError;
}

//antes de todos los tests, guardamos el valor original de AI_PROVIDER para restaurarlo después
beforeAll(() => {
  originalProvider = process.env.AI_PROVIDER;
});
//después de todos los tests, restauramos el valor original de AI_PROVIDER para no afectar otras pruebas o el entorno
afterAll(() => {
  if (typeof originalProvider === 'undefined') {
    delete process.env.AI_PROVIDER;
    return;
  }

  process.env.AI_PROVIDER = originalProvider;
});

describe('LLM integration tests', () => {
  test('calls OpenAI structured endpoint successfully', { timeout: 120000 }, async () => {
    process.env.AI_PROVIDER = 'openai';

    const result = await runWithSchemaRetry(async () =>
      structuredGenerationService.generateObject({
        systemPrompt: 'You are a strict evaluator. Return compact, structured JSON only.',
        userPrompt:
          'Evaluate: student says 2+2=4. expected is 4. Return score, short feedback and one suggestion.',
        zodSchema: MiniEvaluationSchema,
        schemaName: 'mini_evaluation',
        openaiModel: OPENAI_MODEL,
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        feedback: expect.any(String),
        suggestions: expect.any(Array),
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  test('calls Gemini structured endpoint successfully', { timeout: 120000 }, async () => {
    process.env.AI_PROVIDER = 'gemini';

    const result = await runWithSchemaRetry(async () =>
      structuredGenerationService.generateObject({
        systemPrompt: 'You are a strict evaluator. Return compact, structured JSON only.',
        userPrompt:
          'Evaluate: student says Earth is round. expected is Earth is round. Return score, feedback and one suggestion.',
        zodSchema: MiniEvaluationSchema,
        schemaName: 'mini_evaluation',
        geminiModel: GEMINI_MODEL,
        geminiResponseFormat: MiniEvaluationResponseFormat,
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        feedback: expect.any(String),
        suggestions: expect.any(Array),
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
