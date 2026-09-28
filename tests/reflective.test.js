import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { instantiateLeia, buildReflectiveInstructions, extractConversationEnd } = require('../utils/reflective.cjs');

const template = () => ({ spec: { behaviour: { spec: {
  description: 'Conversation: {{reflectiveContext.previousConversation}}\nSolution: {{ reflectiveContext.previousSolution }}',
  conversationDynamics: {
    stoppingCondition: { enabled: true, prompt: 'Stop after two answers.' },
    speaksFirst: { enabled: true, prompt: 'Ask about the first decision.' },
  },
} } } });
const context = (solution) => ({ previousConversation: [{ role: 'user', content: 'My question' }], previousSolution: solution });

describe('Contextual LEIA instantiation', () => {
  test('resolves context and composes optional stopping and opening instructions', () => {
    const result = instantiateLeia(template(), context('My submitted solution'));
    const prompt = buildReflectiveInstructions(result);
    expect(prompt).toContain('My question');
    expect(prompt).toContain('My submitted solution');
    expect(prompt).toContain('Stop after two answers.');
    expect(prompt).toContain('[LEIA_CONVERSATION_ENDED]');
    const toolPrompt = buildReflectiveInstructions(result, { completionTool: true });
    expect(toolPrompt).toContain('call finish_conversation');
    expect(toolPrompt).not.toContain('[LEIA_CONVERSATION_ENDED]');
    expect(prompt).toContain('Ask about the first decision.');
    expect(prompt).not.toContain('Evaluation objective');
    expect(prompt).not.toContain('{{');
  });

  test('recognizes only a final completion marker and hides it from the student', () => {
    expect(extractConversationEnd('Goodbye. [LEIA_CONVERSATION_ENDED]')).toEqual({
      message: 'Goodbye.', conversationEnded: true,
    });
    expect(extractConversationEnd('The marker [LEIA_CONVERSATION_ENDED] is only an example.'))
      .toEqual({ message: 'The marker [LEIA_CONVERSATION_ENDED] is only an example.', conversationEnded: false });
  });

  test('isolates students and does not reinterpret their text', () => {
    const source = template();
    const first = instantiateLeia(source, context('$& $\x60 {{reflectiveContext.previousConversation}}'));
    const second = instantiateLeia(source, context('Student B'));
    expect(buildReflectiveInstructions(first)).not.toContain('Student B');
    expect(first.spec.behaviour.spec.description).toContain('$& $\x60 {{reflectiveContext.previousConversation}}');
    expect(source.spec.behaviour.spec.description).toContain('{{');
    expect(Object.isFrozen(first.spec.reflectiveContext.previousConversation[0])).toBe(true);
    expect(buildReflectiveInstructions(second)).toContain('Student B');
  });

  test('requires context only when referenced', () => {
    expect(() => instantiateLeia(template())).toThrow(/context/);
    const plain = { spec: { behaviour: { spec: { description: 'Normal', conversationDynamics: { stoppingCondition: { enabled: true, prompt: 'When done' } } } } } };
    expect(buildReflectiveInstructions(instantiateLeia(plain))).toContain('When done');
    plain.spec.behaviour.spec.conversationDynamics.stoppingCondition.enabled = false;
    expect(buildReflectiveInstructions(instantiateLeia(plain))).not.toContain('When done');
    plain.spec.behaviour.spec.conversationDynamics.stoppingCondition.prompt = '{{reflectiveContext.previousConversation}}';
    expect(() => instantiateLeia(plain)).not.toThrow();
    const invalid = template();
    invalid.spec.behaviour.spec.description = '{{reflectiveContext.unknown}}';
    expect(() => instantiateLeia(invalid, context('solution'))).toThrow(/Unknown/);
  });
});
