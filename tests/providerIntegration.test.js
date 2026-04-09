import { describe, expect, beforeAll, afterAll, test } from 'vitest';
import { z } from 'zod';

require('dotenv').config();

const structuredGenerationService = require('../services/structuredGenerationService');
const openaiAssistantProvider = require('../models/providers/openai-assistant');
const geminiProvider = require('../models/providers/gemini-3.1-flash-lite-preview');

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
    score: { type: 'number' },
    feedback: { type: 'string' },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['score', 'feedback', 'suggestions'],
};

async function assertSessionLifecycle(provider, { instructions, message, expectInitialThreadId = 'non-empty' }) {
  const sessionData = await provider.createSession({ instructions });

  expect(sessionData).toEqual(
    expect.objectContaining({
      assistantId: expect.any(String),
      threadId: expect.any(String),
      providerState: expect.any(Object),
    })
  );
  expect(sessionData.providerState.systemInstruction).toBe(instructions);

  if (expectInitialThreadId === 'empty') {
    expect(sessionData.threadId).toBe('');
  } else {
    expect(sessionData.threadId).not.toBe('');
  }

  const response = await provider.sendMessage({
    message,
    sessionData,
  });

  expect(response).toEqual(
    expect.objectContaining({
      message: expect.any(String),
      sessionData: expect.any(Object),
    })
  );
  expect(response.message.trim()).toBeTruthy();
  expect(response.sessionData).toEqual(
    expect.objectContaining({
      threadId: expect.any(String),
      providerState: expect.any(Object),
    })
  );
  expect(response.sessionData.providerState.systemInstruction).toBe(instructions);
  
  // Verify that threadId respects provider behavior:
  // - OpenAI: threadId is created in createSession and persists
  // - Gemini: threadId is empty initially and created on first sendMessage
  if (sessionData.threadId === '') {
    // Gemini behavior: threadId should be assigned after the first message
    expect(response.sessionData.threadId).not.toBe('');
  } else {
    // OpenAI behavior: threadId should be the same as initial sessionData
    expect(response.sessionData.threadId).toBe(sessionData.threadId);
  }

  return response;
}

let originalProvider;

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

    let result;
    try {
      result = await structuredGenerationService.generateObject({
        systemPrompt: 'You are a strict evaluator. Return compact, structured JSON only.',
        userPrompt:
          'Evaluate: student says 2+2=4. expected is 4. Return score, short feedback and one suggestion.',
        zodSchema: MiniEvaluationSchema,
        schemaName: 'mini_evaluation',
        openaiModel: OPENAI_MODEL,
      });
    } catch (error) {
      throw new Error(error);
    }

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

    await assertSessionLifecycle(openaiAssistantProvider, {
      instructions: 'You are a concise assistant that answers briefly.',
      message: 'Reply with a short confirmation that the session flow works.',
      expectInitialThreadId: 'non-empty',
    });
  });

  test('calls Gemini structured endpoint successfully', { timeout: 120000 }, async () => {
    process.env.AI_PROVIDER = 'gemini';

    let result;
    try {
      result = await structuredGenerationService.generateObject({
        systemPrompt: 'You are a strict evaluator. Return compact, structured JSON only.',
        userPrompt:
          'Evaluate: student says Earth is round. expected is Earth is round. Return score, feedback and one suggestion.',
        zodSchema: MiniEvaluationSchema,
        schemaName: 'mini_evaluation',
        geminiModel: GEMINI_MODEL,
        geminiResponseFormat: MiniEvaluationResponseFormat,
      });
    } catch (error) {
      throw new Error(error);
    }

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

    await assertSessionLifecycle(geminiProvider, {
      instructions: 'You are a concise assistant that answers briefly.',
      message: 'Reply with a short confirmation that the session flow works.',
      expectInitialThreadId: 'empty',
    });
  });
});
