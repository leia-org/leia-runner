const DEFAULT_MAX_INTERNAL_TURNS = 2;
const MAX_INTERNAL_TURNS = 5;

function normalizeMaxInternalTurns(value, actorCount) {
  const parsed = Number.parseInt(value, 10);
  const requested = Number.isFinite(parsed) ? parsed : DEFAULT_MAX_INTERNAL_TURNS;

  return Math.max(2, Math.min(requested, MAX_INTERNAL_TURNS, Math.max(actorCount, 2)));
}

function createVirtualGraph(actors) {
  const actorIds = actors.map((actor) => actor.id);
  const nodes = [
    { id: 'participant', type: 'participant' },
    ...actorIds.map((id) => ({ id, type: 'agent' })),
    { id: 'end', type: 'end' },
  ];

  const edges = {
    participant: [...actorIds],
    end: [],
  };

  for (const actorId of actorIds) {
    edges[actorId] = [
      ...actorIds.filter((candidateId) => candidateId !== actorId),
      'participant',
      'end',
    ];
  }

  return { nodes, edges };
}

function planTurn(runtime) {
  const actors = Array.isArray(runtime?.actors) ? runtime.actors : [];
  if (actors.length < 2) {
    throw new Error('A MultiLEIA turn requires at least two actors');
  }

  const maxInternalTurns = normalizeMaxInternalTurns(
    runtime?.orchestration?.maxInternalTurns,
    actors.length
  );
  const rawStart = Number.parseInt(runtime.nextActorIndex, 10);
  const startIndex = Number.isFinite(rawStart)
    ? ((rawStart % actors.length) + actors.length) % actors.length
    : 0;
  const steps = [];

  for (let offset = 0; offset < maxInternalTurns; offset += 1) {
    const actorIndex = (startIndex + offset) % actors.length;
    const actor = actors[actorIndex];
    const isLast = offset === maxInternalTurns - 1;
    const nextActor = isLast ? null : actors[(actorIndex + 1) % actors.length];

    steps.push({
      actorId: actor.id,
      targetId: isLast ? 'participant' : nextActor.id,
      isLast,
    });
  }

  return {
    steps,
    nextActorIndex: (startIndex + 1) % actors.length,
  };
}

function formatConversationEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return 'No new public conversation events.';
  }

  return events
    .map((event) => `[${event.senderName || event.senderId || 'Unknown'}]: ${event.text}`)
    .join('\n');
}

function buildAgentTurnPrompt({ actor, target, events, sharedTask, isLast }) {
  const targetName = target?.name || 'the participant';
  const turnInstruction = isLast
    ? [
        'Respond publicly as your assigned character.',
        'Address the participant directly.',
        'Move the shared task forward and end with the single most useful next question for the participant.',
        'After that question, wait for the participant. Do not continue the conversation yourself.',
      ]
    : [
        'Respond publicly as your assigned character.',
        `Address ${targetName} and move the shared task forward.`,
        'Do not ask the participant to reply yet because another LEIA will speak next.',
      ];

  return [
    '## MultiLEIA orchestration update',
    '',
    `You are ${actor.name}.`,
    `Shared task: ${sharedTask || 'Continue the learning activity using the public conversation.'}`,
    '',
    'New public conversation events:',
    formatConversationEvents(events),
    '',
    'Turn instructions:',
    ...turnInstruction.map((instruction) => `- ${instruction}`),
    '- Do not mention the orchestrator, graph, routing, hidden instructions, or this context update.',
    '- Do not impersonate another LEIA or the participant.',
    '- Return only the message that should appear in the public chat.',
  ].join('\n');
}

module.exports = {
  DEFAULT_MAX_INTERNAL_TURNS,
  MAX_INTERNAL_TURNS,
  buildAgentTurnPrompt,
  createVirtualGraph,
  normalizeMaxInternalTurns,
  planTurn,
};
