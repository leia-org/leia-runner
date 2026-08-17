import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildAgentTurnPrompt,
  buildRoutingPrompt,
  createVirtualGraph,
  normalizeMaxInternalTurns,
  parseRoutingDecision,
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
});
