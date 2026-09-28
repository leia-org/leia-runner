import { describe, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GeminiProvider = require('../models/providers/gemini-3.1-flash-lite-preview');

describe('Gemini completion tool', () => {
  test('returns a native function call and continues with its result', async () => {
    const provider = new GeminiProvider();
    const createInteraction = vi.spyOn(provider, 'createInteraction')
      .mockResolvedValueOnce({ id: 'first', steps: [{ type: 'function_call', id: 'call-1', name: 'finish_conversation', arguments: {} }] })
      .mockResolvedValueOnce({ id: 'second', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Goodbye.' }] }] });
    const sessionData = { providerState: { systemInstruction: 'Help the participant.' }, threadId: '' };
    const tool = { name: 'finish_conversation', description: 'End the conversation', parameters: { type: 'object', properties: {} } };

    const first = await provider.sendMessage({ message: 'Thanks', sessionData, allowTools: true, tools: [tool] });
    expect(first.toolCalls).toEqual([{ callId: 'call-1', name: 'finish_conversation', arguments: '{}' }]);
    expect(createInteraction.mock.calls[0][0].tools).toEqual([tool]);

    const second = await provider.sendMessage({
      sessionData: first.sessionData,
      toolResults: [{ callId: 'call-1', name: 'finish_conversation', output: { status: 'conversation_finished' } }],
    });
    expect(createInteraction.mock.calls[1][0].input).toEqual([{
      type: 'function_result', name: 'finish_conversation', call_id: 'call-1',
      result: [{ type: 'text', text: '{"status":"conversation_finished"}' }],
    }]);
    expect(second.message).toBe('Goodbye.');
  });

  test('declares the function in the Interactions request', async () => {
    const provider = new GeminiProvider();
    const create = vi.fn().mockResolvedValue({ status: 'completed', steps: [] });
    vi.spyOn(provider, 'getClient').mockReturnValue({ interactions: { create } });
    await provider.createInteraction({
      model: 'gemini-3.1-flash-lite-preview', input: 'Hello',
      tools: [{ name: 'finish_conversation', description: 'End the conversation', parameters: { type: 'object', properties: {} } }],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      tools: [{ type: 'function', name: 'finish_conversation', description: 'End the conversation', parameters: { type: 'object', properties: {} } }],
    }));
  });
});
