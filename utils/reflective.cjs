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
  const usesContext = /{{\s*reflectiveContext\./.test(JSON.stringify(activeBehaviour));
  if (!usesContext) return deepFreeze(instance);
  const values = context || instance.spec.reflectiveContext;
  if (!values || !Array.isArray(values.previousConversation) ||
      typeof values.previousSolution !== 'string') {
    fail('LEIA requires the previous conversation context');
  }
  const replace = (value) => {
    if (typeof value === 'string') {
      return value.replace(/{{\s*reflectiveContext\.([\w]+)\s*}}/g, (_, key) => {
        if (!['previousConversation', 'previousSolution'].includes(key)) {
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
  instance.spec.behaviour.spec = replace(behaviour);
  instance.spec.reflectiveContext = structuredClone(values);
  return deepFreeze(instance);
}

function buildReflectiveInstructions(leia) {
  const behaviour = leia.spec?.behaviour?.spec || {};
  const { stoppingCondition, speaksFirst } = behaviour.conversationDynamics || {};
  return [
    behaviour.description,
    stoppingCondition?.enabled && stoppingCondition.prompt?.trim() && `Stopping instructions: ${stoppingCondition.prompt}`,
    stoppingCondition?.enabled && stoppingCondition.prompt?.trim() && 'When the stopping instructions are satisfied, conclude the conversation.',
    speaksFirst?.enabled && `Start the conversation yourself. ${speaksFirst.prompt || ''}`,
  ].filter(Boolean).join('\n\n');
}

module.exports = { instantiateLeia, buildReflectiveInstructions, deepFreeze };
