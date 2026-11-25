import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const problemChatService = require('../services/problemChatService');
const { redisClient } = require('../config/redis');

describe('problem chat authoring instructions', () => {
  it('requires library lookup before creating resources', () => {
    const prompt = problemChatService.buildSystemPrompt([
      { name: 'list_problems' },
      { name: 'list_behaviours' },
      { name: 'list_personas' },
      { name: 'apply_behaviour' },
    ]);

    expect(prompt).toContain('Mandatory reuse-first workflow');
    expect(prompt).toContain('Before creating a Problem, call list_problems');
    expect(prompt).toContain('After the final Problem is selected or created, call list_behaviours');
    expect(prompt).toContain('Before creating a Persona, call list_personas');
  });

  it('forbids base Behaviour authoring when apply_behaviour is unavailable', () => {
    const prompt = problemChatService.buildSystemPrompt([
      { name: 'list_behaviours' },
      { name: 'use_behaviour' },
    ]);

    expect(prompt).toContain('You cannot author or edit the base Behaviour resource');
    expect(prompt).toContain('You may still use extends, overrides or constrainedTo');
  });

  it('uses proposal instructions only for Designers that support draft editing commands', () => {
    const prompt = problemChatService.buildSystemPrompt([
      { name: 'edit_problem' },
      { name: 'apply_behaviour' },
      { name: 'edit_behaviour' },
    ]);

    expect(prompt).toContain('must approve the displayed proposal');
    expect(prompt).toContain('keep the other selections and title');
    expect(prompt).toContain('edit_behaviour with appendInstructions');
    expect(prompt).not.toContain('temporarily clears the Behaviour selection');
    expect(prompt).not.toContain('You cannot author or edit');
  });

  it('forbids proposing authored Behaviours for basic users', () => {
    const prompt = problemChatService.buildSystemPrompt([{ name: 'edit_problem' }, { name: 'use_behaviour' }]);
    expect(prompt).toContain('You cannot author or edit the base Behaviour');
    expect(prompt).toContain('Reuse a suitable saved Behaviour');
  });

  it('allows partial fields in draft edit commands', () => {
    const [editTool, lookupTool] = problemChatService.normalizeTools([{ name: 'edit_behaviour' }, { name: 'list_behaviours' }]);
    expect(editTool.strict).toBe(false);
    expect(lookupTool.strict).toBeUndefined();
  });

  it('stages rubric changes only when rubric tools are enabled in proposal mode', () => {
    const editTools = [{ name: 'edit_problem' }];
    expect(problemChatService.buildSystemPrompt(editTools)).not.toContain('apply_rubric');

    const prompt = problemChatService.buildSystemPrompt([...editTools, { name: 'apply_rubric' }]);
    expect(prompt).toContain('made of four resources');
    expect(prompt).toContain('Call get_current_rubric before proposing a complete structured rubric with apply_rubric');
    expect(prompt).toContain('A rubric proposal also requires instructor approval');
  });

  it('omits rubric instructions when apply_rubric is not enabled and includes them when enabled', () => {
    const withoutRubric = problemChatService.buildSystemPrompt([
      { name: 'list_problems' },
      { name: 'list_behaviours' },
      { name: 'list_personas' },
    ]);
    expect(withoutRubric).toContain('made of three resources');
    expect(withoutRubric).not.toContain('apply_rubric');

    const withRubric = problemChatService.buildSystemPrompt([
      { name: 'list_problems' },
      { name: 'list_behaviours' },
      { name: 'list_personas' },
      { name: 'apply_rubric' },
    ]);
    expect(withRubric).toContain('made of four resources');
    expect(withRubric).toContain('apply_rubric');
    expect(withRubric).toContain('{{rubric.criteria}}');
  });
});

describe('problem chat tool continuations', () => {
  const chatId = 'problem-chat-test';
  const fileIds = ['file-sample'];
  const tool = (callId) => ({ type: 'function_call', call_id: callId, name: 'list_problems', arguments: '{}' });
  let state;
  let responses;

  beforeEach(async () => {
    state = null;
    responses = { create: vi.fn(), retrieve: vi.fn() };
    vi.spyOn(problemChatService, '_client').mockResolvedValue({ responses });
    vi.spyOn(redisClient, 'get').mockImplementation(async () => state);
    vi.spyOn(redisClient, 'set').mockImplementation(async (_key, data) => {
      state = data;
      return 'OK';
    });
    vi.spyOn(redisClient, 'eval').mockImplementation(async (_script, { arguments: [previous, next] }) => {
      if (previous !== state) return 0;
      state = next;
      return 1;
    });
    await problemChatService.openSession(chatId);
  });

  afterEach(() => vi.restoreAllMocks());

  it('closes interrupted calls before sending the next message, preserving history and attachments', async () => {
    responses.create
      .mockResolvedValueOnce({ id: 'resp_pending', output: [tool('call_a'), tool('call_b')] })
      .mockResolvedValueOnce({ id: 'resp_answer', output_text: 'Done' });

    const first = await problemChatService.sendMessage(chatId, { message: 'First request', fileIds });
    expect(first.toolCalls.map(({ callId }) => callId)).toEqual(['call_a', 'call_b']);
    await expect(problemChatService.sendMessage(chatId, { message: 'New request', fileIds }))
      .resolves.toEqual({ responseId: 'resp_answer', message: 'Done' });
    const payload = responses.create.mock.calls[1][0];
    expect(payload.previous_response_id).toBe('resp_pending');
    expect(payload.input).toEqual([
      { type: 'function_call_output', call_id: 'call_a', output: expect.stringContaining('"status":"cancelled"') },
      { type: 'function_call_output', call_id: 'call_b', output: expect.stringContaining('"status":"cancelled"') },
      { role: 'user', content: [{ type: 'input_text', text: 'New request' }] },
    ]);
    expect(JSON.parse(state).pendingToolCallIds).toEqual([]);
    expect(responses.retrieve).not.toHaveBeenCalled();
  });

  it('rejects partial or stale results before contacting OpenAI and accepts a complete retry', async () => {
    responses.create
      .mockResolvedValueOnce({ id: 'resp_pending', output: [tool('call_a'), tool('call_b')] })
      .mockResolvedValueOnce({ id: 'resp_answer', output_text: 'Done' });
    await problemChatService.sendMessage(chatId, { message: 'First request' });
    const pendingState = state;

    const resultA = { callId: 'call_a', output: { status: 'proposed' } };
    const resultB = { callId: 'call_b', output: null };
    for (const toolResults of [[resultA], [resultA, resultA], [resultA, { callId: 'call_stale' }]]) {
      await expect(problemChatService.sendMessage(chatId, { toolResults })).rejects.toMatchObject({ statusCode: 409 });
    }
    expect(responses.create).toHaveBeenCalledTimes(1);
    expect(state).toBe(pendingState);

    await problemChatService.sendMessage(chatId, { toolResults: [resultA, resultB] });
    expect(responses.create).toHaveBeenLastCalledWith(expect.objectContaining({
      previous_response_id: 'resp_pending',
      input: [
        { type: 'function_call_output', call_id: 'call_a', output: '{"status":"proposed"}' },
        { type: 'function_call_output', call_id: 'call_b', output: 'null' },
      ],
    }));
  });

  it('recovers a session saved by a previous Runner version', async () => {
    state = JSON.stringify({ responseId: 'resp_legacy', fileIds: [] });
    responses.retrieve.mockResolvedValue({ output: [tool('call_legacy')] });
    responses.create.mockResolvedValue({ id: 'resp_answer', output_text: 'Done' });

    await problemChatService.sendMessage(chatId, { message: 'Try again' });
    expect(responses.retrieve).toHaveBeenCalledWith('resp_legacy');
    expect(responses.create).toHaveBeenCalledWith(expect.objectContaining({
      previous_response_id: 'resp_legacy',
      input: [
        expect.objectContaining({ type: 'function_call_output', call_id: 'call_legacy' }),
        { role: 'user', content: [{ type: 'input_text', text: 'Try again' }] },
      ],
    }));
  });

  it('keeps pending calls after a rejected provider request', async () => {
    responses.create
      .mockResolvedValueOnce({ id: 'resp_pending', output: [tool('call_a')] })
      .mockRejectedValueOnce(new Error('Provider unavailable'))
      .mockResolvedValueOnce({ id: 'resp_answer', output_text: 'Done' });
    await problemChatService.sendMessage(chatId, { message: 'First request' });
    const pendingState = state;
    await expect(problemChatService.sendMessage(chatId, { message: 'Try again' })).rejects.toThrow('Provider unavailable');
    expect(state).toBe(pendingState);

    await problemChatService.sendMessage(chatId, { message: 'Try again' });
    expect(responses.create.mock.calls[2][0]).toEqual(responses.create.mock.calls[1][0]);
  });

  it('prevents a slow response from replacing the state committed by another request', async () => {
    let finishSlowRequest;
    const slowResponse = new Promise((resolve) => { finishSlowRequest = resolve; });
    responses.create
      .mockReturnValueOnce(slowResponse)
      .mockResolvedValueOnce({ id: 'resp_winner', output: [tool('call_winner')] });

    const slowRequest = problemChatService.sendMessage(chatId, { message: 'Slow request' });
    await vi.waitFor(() => expect(responses.create).toHaveBeenCalledTimes(1));
    await problemChatService.sendMessage(chatId, { message: 'Winning request' });
    finishSlowRequest({ id: 'resp_slow', output: [tool('call_slow')] });

    await expect(slowRequest).rejects.toMatchObject({ statusCode: 409 });
    expect(JSON.parse(state)).toMatchObject({ responseId: 'resp_winner', pendingToolCallIds: ['call_winner'] });
  });
});
