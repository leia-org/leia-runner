import { describe, expect, beforeAll, afterAll, test } from 'vitest';
import { z } from 'zod';
require('dotenv').config();

const { initRedis, redisClient } = require('../config/redis');
const almaProvider = require('../models/providers/alma');

const EvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  evaluation: z.string().min(1)
});

describe('ALMA integration tests', () => {
  beforeAll(async () => {
    await initRedis();
  });

  afterAll(async () => {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  });

  test('calls ALMA sendMessage successfully', { timeout: 120000 }, async () => {
    const sessionId = `test-session-${Date.now()}`;
    const sessionData = {
      threadId: '',
      providerState: {
        systemInstruction: 'You are a helpful assistant. Reply concisely.'
      }
    };

    const response = await almaProvider.sendMessage({
      message: 'Hello! What is 2+2?',
      sessionData,
      sessionId
    });

    expect(response).toBeDefined();
    expect(typeof response.message).toBe('string');
    expect(response.message.length).toBeGreaterThan(0);
    expect(response.sessionData).toBeDefined();
    expect(response.sessionData.providerState).toBeDefined();
    expect(response.sessionData.providerState.systemInstruction).toBe('You are a helpful assistant. Reply concisely.');
  });

  test('calls ALMA generateEvaluationResponse successfully', { timeout: 120000 }, async () => {
    const prompt = `
Evaluate the following solution for a problem:

Expected solution:
4

Provided solution:
4

The Format to compare is:
number

Evaluate the provided solution by comparing it with the expected solution.
Assign a score between 0 and 10, where:
- 10 means the solution is perfect
- 0 means the solution is completely incorrect
Provide a detailed evaluation in Markdown format.

Respond ONLY with a JSON object in the following format:
{
  "score": [score between 0 and 10],
  "evaluation": "[detailed evaluation in Markdown format]"
}`;

    const response = await almaProvider.generateEvaluationResponse(prompt);
    
    // Validate structure strictly using Zod
    const parsedResponse = EvaluationSchema.parse(response);

    expect(parsedResponse).toBeDefined();
    expect(parsedResponse.score).toBeGreaterThanOrEqual(0);
    expect(parsedResponse.score).toBeLessThanOrEqual(10);
    expect(parsedResponse.evaluation.length).toBeGreaterThan(0);
  });

  test('generateEvaluationResponse throws error on invalid JSON response', { timeout: 120000 }, async () => {
    const prompt = 'Please reply ONLY with the word "Hello". Do not use JSON format.';
    
    await expect(almaProvider.generateEvaluationResponse(prompt)).rejects.toThrow('Error evaluating the solution with ALMA');
  });
});
