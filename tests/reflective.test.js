import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { instantiateLeia, buildReflectiveInstructions } = require('../utils/reflective.cjs');

const template = () => ({ spec: { behaviour: { spec: {
  reflective: true,
  description: 'Conversation: {{reflectiveContext.previousConversation}}\nSolution: {{ reflectiveContext.previousSolution }}',
  evaluationPrompt: 'Explain the trade-offs.',
  stoppingPrompt: 'Stop after the student justifies two decisions.',
} } } });
const context = (solution) => ({ previousConversation: [{ role: 'user', content: 'My question' }], previousSolution: solution });

describe('Reflective LEIA instantiation', () => {
  test('resolves both variables and builds the interview and stopping instructions', () => {
    const result = instantiateLeia(template(), context('My submitted solution'));
    const prompt = buildReflectiveInstructions(result);
    expect(prompt).toContain('My question');
    expect(prompt).toContain('My submitted solution');
    expect(prompt).toContain('Explain the trade-offs.');
    expect(prompt).toContain('Stop after the student justifies two decisions.');
    expect(prompt).toContain('Do not request a new solution');
    expect(prompt).not.toContain('{{');
  });

  test('isolates students, preserves the template, and freezes the instance deeply', () => {
    const source = template();
    const first = instantiateLeia(source, context('Student A'));
    const second = instantiateLeia(source, context('Student B'));
    expect(buildReflectiveInstructions(first)).not.toContain('Student B');
    expect(buildReflectiveInstructions(second)).not.toContain('Student A');
    expect(source.spec.behaviour.spec.description).toContain('{{');
    expect(Object.isFrozen(first.spec.reflectiveContext.previousConversation[0])).toBe(true);
    expect(() => { first.spec.behaviour.spec.description = 'changed'; }).toThrow();
  });

  test('does not interpret replacement syntax or placeholders inside student text', () => {
    const text = '$& $` {{reflectiveContext.previousConversation}}';
    const result = instantiateLeia(template(), context(text));
    expect(result.spec.behaviour.spec.description).toContain(`Solution: ${text}`);
  });

  test('requires explicit context and both static prompts', () => {
    expect(() => instantiateLeia(template())).toThrow(/context/);
    for (const field of ['evaluationPrompt', 'stoppingPrompt']) {
      const source = template();
      source.spec.behaviour.spec[field] = '  ';
      expect(() => instantiateLeia(source, context('solution'))).toThrow(field);
    }
    const source = template();
    source.spec.behaviour.spec.description = '{{reflectiveContext.unknown}}';
    expect(() => instantiateLeia(source, context('solution'))).toThrow(/Unknown/);
  });

  test('keeps normal LEIA instructions unchanged and needs no previous session', () => {
    const source = { spec: { behaviour: { spec: { description: 'Normal LEIA' } } } };
    expect(buildReflectiveInstructions(instantiateLeia(source))).toBe('Normal LEIA');
  });
});
