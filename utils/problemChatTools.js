const UNSUPPORTED_STRICT_SCHEMA_KEYWORDS = new Set(['$id', '$schema', 'uniqueItems']);

function toOpenAiStrictSchema(value) {
  if (Array.isArray(value)) return value.map(toOpenAiStrictSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED_STRICT_SCHEMA_KEYWORDS.has(key))
      .map(([key, child]) => [key, toOpenAiStrictSchema(child)]),
  );
}

function normalizeTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const out = [];
  for (const tool of tools) {
    if (!tool || typeof tool.name !== 'string') continue;
    out.push({
      type: 'function',
      name: tool.name,
      description: typeof tool.description === 'string' ? tool.description : '',
      ...(tool.strict === true ? { strict: true } : {}),
      parameters: tool.parameters && typeof tool.parameters === 'object'
        ? (tool.strict === true ? toOpenAiStrictSchema(tool.parameters) : tool.parameters)
        : { type: 'object', properties: {} },
    });
  }
  return out.length > 0 ? out : null;
}

module.exports = { normalizeTools, toOpenAiStrictSchema };
