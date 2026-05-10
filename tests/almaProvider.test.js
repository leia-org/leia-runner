import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
const almaProvider = require('../models/providers/alma');
const Errors = require('../utils/errors');

describe('ALMA Provider Unit Tests', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  
    vi.spyOn(almaProvider.conversationStore, 'buildConversationForRequest').mockResolvedValue([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'Hello' }
    ]);
    vi.spyOn(almaProvider.conversationStore, 'storeAssistantResponse').mockResolvedValue();

    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('sendMessage', () => {
    const defaultOptions = {
      sessionId: 'test-session',
      message: 'Hello',
      sessionData: { providerState: { systemInstruction: 'system prompt' } }
    };

    test('successfully sends a message and returns response', async () => {
      const mockResponse = {
        choices: [
          { message: { content: 'Hi there!' } }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await almaProvider.sendMessage(defaultOptions);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(response).toBeDefined();
      expect(response.message).toBe('Hi there!');
      expect(response.sessionData.providerState.systemInstruction).toBe('system prompt');
    });

    test('throws messageSendError when fetch fails', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(almaProvider.sendMessage(defaultOptions)).rejects.toThrow('Error sending message to ALMA');
    });

    test('throws error when API returns non-ok status', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      await expect(almaProvider.sendMessage(defaultOptions)).rejects.toThrow('Error sending message to ALMA');
    });

    test('throws noTextContent error when response lacks choices', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}) // Empty object
      });

      await expect(almaProvider.sendMessage(defaultOptions)).rejects.toThrow('Error sending message to ALMA');
    });
  });

  describe('generateEvaluationResponse', () => {
    const prompt = 'Evaluate this: ...';

    test('successfully generates an evaluation response', async () => {
      const mockResponse = {
        choices: [
          { message: { content: '```json\n{"score": 9, "evaluation": "Great work"}\n```' } }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await almaProvider.generateEvaluationResponse(prompt);

      expect(response).toEqual({ score: 9, evaluation: 'Great work' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('throws evaluationError when JSON parsing fails', async () => {
      const mockResponse = {
        choices: [
          { message: { content: 'This is not JSON' } }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await expect(almaProvider.generateEvaluationResponse(prompt)).rejects.toThrow('Error evaluating the solution with ALMA');
    });

    test('throws evaluationError on fetch failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network disconnected'));

      await expect(almaProvider.generateEvaluationResponse(prompt)).rejects.toThrow('Error evaluating the solution with ALMA');
    });
  });

  describe('sanitizeJsonResponse helper', () => {
    test('removes generic markdown fences', () => {
      const input = '```\n{"test": true}\n```';
      expect(almaProvider.sanitizeJsonResponse(input)).toBe('{"test": true}');
    });

    test('removes json markdown fences', () => {
      const input = '```json\n{"test": true}\n```';
      expect(almaProvider.sanitizeJsonResponse(input)).toBe('{"test": true}');
    });

    test('handles JSON without fences', () => {
      const input = '{"test": true}';
      expect(almaProvider.sanitizeJsonResponse(input)).toBe('{"test": true}');
    });

    test('trims surrounding whitespace', () => {
      const input = '   \n```json\n{"test": true}\n```  \n ';
      expect(almaProvider.sanitizeJsonResponse(input)).toBe('{"test": true}');
    });
  });
});
