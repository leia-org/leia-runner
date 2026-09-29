// Kept identical to Workbench's runtime utility: these are independently deployed repositories.
function fail(message) {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function instantiateLeia(template, context) {
  const instance = structuredClone(template);
  const behaviour = instance.spec?.behaviour?.spec;
  if (!behaviour) return deepFreeze(instance);
  const dynamics = behaviour.conversationDynamics || {};
  const activeBehaviour = {
    ...behaviour,
    conversationDynamics: Object.fromEntries(
      Object.entries(dynamics).filter(([, dynamic]) => dynamic?.enabled)
    ),
  };
  const usesContext = /{{\s*(?:reflectiveContext|previousStage)\./.test(JSON.stringify(activeBehaviour));
  if (!usesContext) return deepFreeze(instance);
  const values = context || instance.spec.previousStage || instance.spec.reflectiveContext;
  if (!values || typeof values !== 'object') {
    fail('LEIA requires the previous conversation context');
  }
  const replace = (value) => {
    if (typeof value === 'string') {
      return value.replace(/{{\s*(?:reflectiveContext|previousStage)\.([\w]+)\s*}}/g, (_, key) => {
        if (!Object.hasOwn(values, key) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
          fail(`Unknown reflective context field: ${key}`);
        }
        return typeof values[key] === 'string' ? values[key] : JSON.stringify(values[key]);
      });
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
    }
    return value;
  };
  // Resolve authored behaviour only, once. Student text is data, never a template.
  instance.spec.behaviour.spec = replace(activeBehaviour);
  instance.spec.behaviour.spec.conversationDynamics = {
    ...dynamics, ...instance.spec.behaviour.spec.conversationDynamics,
  };
  instance.spec.previousStage = structuredClone(values);
  instance.spec.reflectiveContext = structuredClone(values);
  return deepFreeze(instance);
}

function buildReflectiveInstructions(leia, { completionTool = false } = {}) {
  const behaviour = leia.spec?.behaviour?.spec || {};
  const { stoppingCondition, speaksFirst } = behaviour.conversationDynamics || {};
  return [
    behaviour.description,
    stoppingCondition?.enabled && stoppingCondition.prompt?.trim() && `Stopping instructions: ${stoppingCondition.prompt}`,
    stoppingCondition?.enabled && stoppingCondition.prompt?.trim() && (completionTool
      ? 'When the stopping instructions are satisfied, call finish_conversation exactly once. Use this tool only after you have decided that the conversation is complete. Then give a final reply to the participant.'
      : 'When the stopping instructions are satisfied, conclude the conversation. Append [LEIA_CONVERSATION_ENDED] at the very end of that final reply only. Never include this marker before the conversation is over.'),
    speaksFirst?.enabled && `Start the conversation yourself. ${speaksFirst.prompt || ''}`,
  ].filter(Boolean).join('\n\n');
}

function extractConversationEnd(message) {
  if (typeof message !== 'string') return { message, conversationEnded: false };
  const marker = /\s*\[LEIA_CONVERSATION_ENDED\]\s*$/;
  return marker.test(message)
    ? { message: message.replace(marker, '').trimEnd(), conversationEnded: true }
    : { message, conversationEnded: false };
}

module.exports = { instantiateLeia, buildReflectiveInstructions, extractConversationEnd, deepFreeze };
