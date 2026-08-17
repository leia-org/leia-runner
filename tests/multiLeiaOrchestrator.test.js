import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const OpenAIResponsesProvider = require('../models/providers/openai-responses');
const {
  buildAgentTurnPrompt,
  buildOrchestratorInstructions,
  buildOrchestratorTools,
  buildRoutingPrompt,
  createVirtualGraph,
  normalizeMaxInternalTurns,
  parseOrchestratorToolCall,
  parseRoutingDecision,
  parseVirtualOrchestratorCall,
  planTurn,
} = require('../services/multiLeiaOrchestrator');

const actors = [
  { id: 'customer', name: 'Customer' },
  { id: 'analyst', name: 'Analyst' },
  { id: 'architect', name: 'Architect' },
];

describe('MultiLEIA virtual graph', () => {
  it('connects every actor to the other actors, participant and end', () => {
    const graph = createVirtualGraph(actors);

    expect(graph.edges.participant).toEqual(['customer', 'analyst', 'architect']);
    expect(graph.edges.customer).toEqual(['analyst', 'architect', 'participant', 'end']);
    expect(graph.edges.customer).not.toContain('customer');
  });

  it('explores actors deterministically and rotates the opening actor', () => {
    const first = planTurn({
      actors,
      nextActorIndex: 0,
      orchestration: { maxInternalTurns: 2 },
    });
    const second = planTurn({
      actors,
      nextActorIndex: first.nextActorIndex,
      orchestration: { maxInternalTurns: 2 },
    });

    expect(first.steps).toEqual([
      { actorId: 'customer', targetId: 'analyst', isLast: false },
      { actorId: 'analyst', targetId: 'participant', isLast: true },
    ]);
    expect(second.steps[0].actorId).toBe('analyst');
    expect(second.steps[1].actorId).toBe('architect');
  });

  it('treats internal turns as a one-to-eight safety limit', () => {
    expect(normalizeMaxInternalTurns(10, 3)).toBe(8);
    expect(normalizeMaxInternalTurns(0, 3)).toBe(1);
    expect(normalizeMaxInternalTurns(undefined, 3)).toBe(2);
  });

  it('labels shared events and tells the final actor to wait for the participant', () => {
    const prompt = buildAgentTurnPrompt({
      actor: actors[1],
      target: { id: 'participant', name: 'the participant' },
      events: [
        { senderName: 'Customer', text: 'Recurring bookings are required.' },
      ],
      sharedTask: 'Elicit booking requirements',
      isLast: true,
    });

    expect(prompt).toContain('[Customer]: Recurring bookings are required.');
    expect(prompt).toContain('You are Analyst.');
    expect(prompt).toContain('wait for the participant');
  });

  it('accepts a valid dynamic route and rejects the current speaker', () => {
    expect(
      parseRoutingDecision(
        { message: '{"nextSpeakerId":"architect"}' },
        actors,
        'analyst'
      )
    ).toBe('architect');
    expect(
      parseRoutingDecision(
        '{"nextSpeakerId":"participant"}',
        actors,
        'architect'
      )
    ).toBe('participant');
    expect(
      parseRoutingDecision(
        '{"nextSpeakerId":"analyst"}',
        actors,
        'analyst'
      )
    ).toBeNull();
  });

  it('tells the router that the configured value is a maximum', () => {
    const prompt = buildRoutingPrompt({
      actors,
      events: [{ senderName: 'Participant', text: 'Hello' }],
      currentSpeakerId: 'participant',
      generatedCount: 0,
      maxTurns: 5,
    });

    expect(prompt).toContain('Maximum public LEIA messages this round: 5');
    expect(prompt).toContain('Eligible LEIAs: customer');
  });

  it('exposes one speaking tool per LEIA and resolves calls back to actors', () => {
    const tools = buildOrchestratorTools(actors);
    const action = parseOrchestratorToolCall(
      {
        callId: 'call-2',
        name: 'speak_as_leia_2',
        arguments: '{"targetId":"customer","instruction":"Ask about pricing"}',
      },
      actors
    );

    expect(tools.map((tool) => tool.name)).toEqual([
      'speak_as_leia_1',
      'speak_as_leia_2',
      'speak_as_leia_3',
    ]);
    expect(action).toEqual({
      actorId: 'analyst',
      targetId: 'customer',
      instruction: 'Ask about pricing',
      callId: 'call-2',
      toolName: 'speak_as_leia_2',
    });
    expect(buildOrchestratorInstructions(actors, 'Task')).toContain(
      'asks who the LEIAs are'
    );
    expect(tools[1].parameters.required).toEqual(['targetId', 'instruction']);
  });

  it('keeps the addressee and intent in virtual tool calls', () => {
    expect(
      parseVirtualOrchestratorCall(
        {
          message:
            '{"toolName":"speak_as_leia_2","arguments":{"targetId":"customer","instruction":"Challenge the pricing assumption"}}',
        },
        actors,
        'customer'
      )
    ).toEqual(
      expect.objectContaining({
        actorId: 'analyst',
        targetId: 'customer',
        instruction: 'Challenge the pricing assumption',
      })
    );
  });

  it('instructs an agent to react directly to another LEIA', () => {
    const prompt = buildAgentTurnPrompt({
      actor: actors[1],
      target: actors[0],
      events: [
        {
          senderName: 'Customer',
          addressedToName: 'Analyst',
          text: 'The price depends on the room.',
        },
      ],
      sharedTask: 'Elicit requirements',
      isLast: null,
      instruction: 'Clarify the pricing rule with Customer',
    });

    expect(prompt).toContain('[Customer → Analyst]');
    expect(prompt).toContain('Address Customer primarily.');
    expect(prompt).toContain("React directly to Customer's actual contribution.");
    expect(prompt).toContain('Do not claim group consensus');
  });

  it('runs coordinator tools sequentially through the OpenAI Responses provider', async () => {
    const provider = new OpenAIResponsesProvider();
    const create = vi.fn().mockResolvedValue({
      id: 'response-1',
      output: [
        {
          type: 'function_call',
          call_id: 'call-1',
          name: 'speak_as_leia_1',
          arguments: '{"targetId":"participant","instruction":"Introduce yourself"}',
        },
      ],
    });
    provider.setApiKey('test-key');
    provider._client = { responses: { create } };

    const response = await provider.sendMessage({
      message: 'Coordinate the group',
      sessionData: {
        threadId: 'conv_test',
        providerState: { systemInstruction: 'Private coordinator instructions' },
      },
      tools: buildOrchestratorTools(actors),
      allowTools: true,
      internalTools: true,
      parallelToolCalls: false,
    });

    expect(response.toolCalls).toEqual([
      expect.objectContaining({
        callId: 'call-1',
        name: 'speak_as_leia_1',
      }),
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: 'Private coordinator instructions',
        parallel_tool_calls: false,
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'speak_as_leia_1' }),
        ]),
      })
    );
  });
});
