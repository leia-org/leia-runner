import { describe, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OllamaProvider = require('../models/providers/ollama');

describe('Ollama completion tool', () => {
  test('sends the tool and continues with its result', async () => {
    const provider = new OllamaProvider();
    vi.spyOn(provider.conversationStore, 'buildConversationForRequest').mockResolvedValue([{ role: 'system', content: 'Instructions' }]);
    vi.spyOn(provider.conversationStore, 'storeAssistantResponse').mockResolvedValue();
    const createChatCompletion = vi.spyOn(provider, 'createChatCompletion')
      .mockResolvedValueOnce({ message: { tool_calls: [{ type: 'function', function: { name: 'finish_conversation', arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: 'Goodbye.' } });
    const sessionData = { providerState: { systemInstruction: 'Instructions' }, threadId: '' };
    const tool = { name: 'finish_conversation', description: 'End the conversation', parameters: { type: 'object', properties: {} } };

    const first = await provider.sendMessage({ sessionId: 'session-1', message: 'Thanks', sessionData, allowTools: true, tools: [tool] });
    expect(first.toolCalls).toEqual([{ callId: '0', name: 'finish_conversation', arguments: '{}' }]);
    expect(createChatCompletion.mock.calls[0][0].tools).toEqual([tool]);

    const second = await provider.sendMessage({
      sessionId: 'session-1', sessionData: first.sessionData,
      toolResults: [{ callId: '0', name: 'finish_conversation', output: { status: 'conversation_finished' } }],
    });
    expect(createChatCompletion.mock.calls[1][0].messages).toEqual([
      { role: 'system', content: 'Instructions' },
      { role: 'assistant', tool_calls: [{ type: 'function', function: { name: 'finish_conversation', arguments: {} } }] },
      { role: 'tool', tool_name: 'finish_conversation', content: '{"status":"conversation_finished"}' },
    ]);
    expect(second.message).toBe('Goodbye.');
  });
});
