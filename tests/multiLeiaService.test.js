import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const multiLeiaService = require('../services/multiLeiaService');
const sessionService = require('../services/sessionService');
const { redisClient } = require('../config/redis');

function createRuntime(maxInternalTurns = 2) {
  return {
    version: 1,
    sessionId: 'session-1',
    status: 'awaiting_user',
    actors: [
      { id: 'actor-a', name: 'Actor A', sessionId: 'session-1:actor:actor-a', cursor: 0 },
      { id: 'actor-b', name: 'Actor B', sessionId: 'session-1:actor:actor-b', cursor: 0 },
    ],
    graph: {},
    orchestration: {
      maxInternalTurns,
      openingActorId: 'actor-a',
      problemActorId: 'actor-a',
      sharedTask: 'Solve the shared task',
      routerSessionId: 'session-1:orchestrator',
    },
    nextActorIndex: 0,
    sequence: 0,
    transcript: [],
    processedTurns: [],
    traversal: [],
    lastPartial: null,
  };
}

describe('MultiLEIA partial traversal recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps completed messages and retries from the failed actor next turn', async () => {
    const runtime = createRuntime();
    let lockToken = null;

    vi.spyOn(redisClient, 'set').mockImplementation(async (key, value) => {
      if (key.startsWith('multi-leia:lock:')) lockToken = value;
      return 'OK';
    });
    vi.spyOn(redisClient, 'get').mockImplementation(async (key) =>
      key.startsWith('multi-leia:lock:') ? lockToken : null
    );
    vi.spyOn(redisClient, 'del').mockResolvedValue(1);
    vi.spyOn(multiLeiaService, 'getRuntime').mockResolvedValue(runtime);
    vi.spyOn(multiLeiaService, 'saveRuntime').mockImplementation(async (value) => value);
    vi.spyOn(sessionService, 'sendMessage')
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"actor-a"}' })
      .mockResolvedValueOnce({ message: 'Actor A response' })
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"actor-b"}' })
      .mockRejectedValueOnce(new Error('Provider unavailable'));
    const onMessage = vi.fn();

    const result = await multiLeiaService.sendMessage(
      runtime.sessionId,
      'Participant message',
      'turn-1',
      { onMessage }
    );

    expect(result.partial).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      senderId: 'actor-a',
      text: 'Actor A response',
      turnId: 'turn-1',
    });
    expect(result.state).toMatchObject({
      status: 'awaiting_user',
      nextActorId: 'actor-b',
      lastPartial: {
        turnId: 'turn-1',
        actorId: 'actor-b',
        actorName: 'Actor B',
      },
    });
    expect(runtime.transcript.map((event) => event.senderId)).toEqual([
      'participant',
      'actor-a',
    ]);
    expect(runtime.processedTurns).toEqual([
      { turnId: 'turn-1', messages: result.messages },
    ]);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(result.messages[0]);
  });

  it('lets two LEIAs speak more than twice until the orchestrator returns control', async () => {
    const runtime = createRuntime(6);
    let lockToken = null;

    vi.spyOn(redisClient, 'set').mockImplementation(async (key, value) => {
      if (key.startsWith('multi-leia:lock:')) lockToken = value;
      return 'OK';
    });
    vi.spyOn(redisClient, 'get').mockImplementation(async (key) =>
      key.startsWith('multi-leia:lock:') ? lockToken : null
    );
    vi.spyOn(redisClient, 'del').mockResolvedValue(1);
    vi.spyOn(multiLeiaService, 'getRuntime').mockResolvedValue(runtime);
    vi.spyOn(multiLeiaService, 'saveRuntime').mockImplementation(async (value) => value);
    vi.spyOn(sessionService, 'sendMessage')
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"actor-a"}' })
      .mockResolvedValueOnce({ message: 'Actor A opens' })
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"actor-b"}' })
      .mockResolvedValueOnce({ message: 'Actor B responds' })
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"actor-a"}' })
      .mockResolvedValueOnce({ message: 'Actor A follows up' })
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"participant"}' });
    const onRoute = vi.fn();
    const onMessage = vi.fn();

    const result = await multiLeiaService.sendMessage(
      runtime.sessionId,
      'Start the discussion',
      'turn-long',
      { onRoute, onMessage }
    );

    expect(result.partial).toBeUndefined();
    expect(result.messages.map((message) => message.senderId)).toEqual([
      'actor-a',
      'actor-b',
      'actor-a',
    ]);
    expect(result.messages.map((message) => message.text)).toEqual([
      'Actor A opens',
      'Actor B responds',
      'Actor A follows up',
    ]);
    expect(onRoute).toHaveBeenCalledTimes(3);
    expect(onMessage).toHaveBeenCalledTimes(3);
    expect(runtime.transcript.map((event) => event.senderId)).toEqual([
      'participant',
      'actor-a',
      'actor-b',
      'actor-a',
    ]);
    expect(runtime.status).toBe('awaiting_user');
  });

  it('stops after one LEIA when the orchestrator returns control to the participant', async () => {
    const runtime = createRuntime(6);
    let lockToken = null;

    vi.spyOn(redisClient, 'set').mockImplementation(async (key, value) => {
      if (key.startsWith('multi-leia:lock:')) lockToken = value;
      return 'OK';
    });
    vi.spyOn(redisClient, 'get').mockImplementation(async (key) =>
      key.startsWith('multi-leia:lock:') ? lockToken : null
    );
    vi.spyOn(redisClient, 'del').mockResolvedValue(1);
    vi.spyOn(multiLeiaService, 'getRuntime').mockResolvedValue(runtime);
    vi.spyOn(multiLeiaService, 'saveRuntime').mockImplementation(async (value) => value);
    vi.spyOn(sessionService, 'sendMessage')
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"actor-b"}' })
      .mockResolvedValueOnce({ message: 'Hello, how can I help?' })
      .mockResolvedValueOnce({ message: '{"nextSpeakerId":"participant"}' });

    const result = await multiLeiaService.sendMessage(
      runtime.sessionId,
      'Hello',
      'turn-short'
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      senderId: 'actor-b',
      text: 'Hello, how can I help?',
    });
    expect(runtime.transcript.map((event) => event.senderId)).toEqual([
      'participant',
      'actor-b',
    ]);
  });
});
