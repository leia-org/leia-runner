const Prompts = {
  evaluation: (solution, result, solutionFormat, evaluationPrompt) => [
    'Evaluate the following solution for a problem:',
    '',
    'Expected solution:',
    solution,
    '',
    'Provided solution:',
    result,
    '',
    'The Format to compare is:',
    solutionFormat,
    '',
    'Evaluate the provided solution by comparing it with the expected solution.',
    'Assign a score between 0 and 10, where:',
    '- 10 means the solution is perfect',
    '- 0 means the solution is completely incorrect',
    'Provide a detailed evaluation in Markdown format.',
    '',
    'Respond ONLY with a JSON object in the following format:',
    '{',
    '  "score": [score between 0 and 10],',
    '  "evaluation": "[detailed evaluation in Markdown format]"',
    '}',
    ...(evaluationPrompt ? ['', evaluationPrompt] : []),
  ].join('\n'),

  multiLeiaSystemPrompt: (leiaName, leiaId, participants, behaviourDescription) => ([
    `You are ${leiaName}.`,
    `Your internal LEIA id is ${leiaId}, but you identify yourself to other participants as ${leiaName}.`,
    participants ? `The LEIAs participating in this conversation are: ${participants}.` : '',
    'Keep this identity and behavior consistently throughout the conversation.',
    'You can see the shared conversation history, including what the user and other LEIAs have said.',
    'Use that shared history as context, but answer only as your own LEIA identity.',
    '',
    behaviourDescription,
  ].join('\n').trim()),

  multiLeiaTranscriptInput: (conversationMessages, leiaName, participants) => {
    const newEvents = (conversationMessages || [])
      .filter(({ role }) => role !== 'system')
      .map(({ content }) => content)
      .join('\n\n');
    const currentLeia = leiaName ? String(leiaName) : 'the selected LEIA';

    return [
      `Current responding LEIA: ${currentLeia}`,
      participants ? `Conversation participants: User, ${participants}` : 'Conversation participants: User and the LEIAs in this session.',
      '',
      'New shared conversation events since your LEIA thread was last synchronized. Treat speaker attributes as the source of truth:',
      newEvents || '(No new messages.)',
      '',
      'Attribution rules:',
      `- You may say "I said it" only when the relevant message has speaker="${currentLeia}".`,
      `- If the relevant message has any other speaker, name that speaker and do not claim it as ${currentLeia}.`,
      '- When asked who said something, answer from the speaker attribute, not from semantic similarity or your persona.',
      'Respond now as your own LEIA identity.',
    ].join('\n');
  },
};

module.exports = Prompts;
