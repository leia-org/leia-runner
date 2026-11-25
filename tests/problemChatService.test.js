import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const problemChatService = require('../services/problemChatService');

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
