import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sessionService = require('../services/sessionService');
const modelManager = require('../models/modelManager');

afterEach(() => vi.restoreAllMocks());

describe('finish_conversation tool', () => {
  test('is available without widgets and completes inside Runner', async () => {
    const session = { provider: 'openai-responses', modelName: 'model', apiKeyId: 'key', apiKeyRequesterId: 'owner' };
    vi.spyOn(sessionService, 'getSession').mockResolvedValue(session);
    vi.spyOn(sessionService, 'getLeiaMeta').mockResolvedValue({ stoppingConditionEnabled: 'true', toolFunctionsEnabled: 'false' });
    const update = vi.spyOn(sessionService, 'updateSession').mockResolvedValue(session);
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ toolCalls: [{ name: 'finish_conversation', callId: 'call-1', arguments: '{}' }] })
      .mockResolvedValueOnce({ message: 'Goodbye.' });
    vi.spyOn(modelManager, 'getModel').mockResolvedValue({ sendMessage });

    const result = await sessionService.sendMessage('session-1', 'I am done', {
      tools: [{ name: 'finish_conversation', description: 'untrusted override' }],
    });

    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      allowTools: true,
      parallelToolCalls: false,
      tools: [expect.objectContaining({ name: 'finish_conversation', description: expect.not.stringContaining('untrusted') })],
    });
    expect(sendMessage.mock.calls[1][0].toolResults).toEqual([
      { callId: 'call-1', name: 'finish_conversation', output: { status: 'conversation_finished' } },
    ]);
    expect(result).toEqual({ message: 'Goodbye.', conversationEnded: true });
    expect(update).toHaveBeenCalledWith('session-1', { conversationEnded: true });
  });

  test('does not expose the tool when the stopping condition is disabled', async () => {
    vi.spyOn(sessionService, 'getSession').mockResolvedValue({ provider: 'openai-responses', modelName: 'model', apiKeyId: 'key', apiKeyRequesterId: 'owner' });
    vi.spyOn(sessionService, 'getLeiaMeta').mockResolvedValue({ stoppingConditionEnabled: 'false', toolFunctionsEnabled: 'false' });
    const sendMessage = vi.fn().mockResolvedValue({ message: 'Continue talking.' });
    vi.spyOn(modelManager, 'getModel').mockResolvedValue({ sendMessage });
    expect(await sessionService.sendMessage('session-1', 'Hello')).toEqual({ message: 'Continue talking.' });
    expect(sendMessage.mock.calls[0][0].allowTools).toBe(false);
  });
});
