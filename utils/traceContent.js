const MAX_TEXT_LENGTH = 1600;
const SAFE_ROLES = new Set(['user', 'assistant', 'system', 'developer', 'tool']);

function redactText(text) {
  return text.slice(0, MAX_TEXT_LENGTH * 4)
    .replace(/-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\n]*PRIVATE KEY-----|$)/g, '[private key]')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[url]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._+\/=-]+/gi, '[authorization]')
    .replace(/\b(?:sk-|pk-lf-|AIza|gh[pousr]_|AKIA)[A-Za-z0-9_-]+/g, '[key]')
    .replace(/\b(?:api[_ -]?key|password|secret|(?:access[_ -]?)?token)\s*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '[credential]')
    .replace(/\b[A-Z0-9_-]{10,}\.[A-Z0-9_-]{10,}\.[A-Z0-9_-]{10,}\b/gi, '[token]')
    .slice(0, MAX_TEXT_LENGTH);
}

function textSummary(text, captureText) {
  if (typeof text !== 'string' || !text.length) return {};
  const preview = captureText ? redactText(text) : undefined;
  return {
    textCharacters: text.length,
    ...(captureText ? { text: preview, truncated: text.length > MAX_TEXT_LENGTH } : {}),
  };
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  return content.find((part) => ['input_text', 'output_text', 'text'].includes(part?.type)
    && typeof part.text === 'string')?.text;
}

function describeInput(input, captureText) {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const lastUser = messages.findLast((message) => message?.role === 'user' || message?.type === 'user_input');
  const text = input?.text ?? contentText(lastUser?.content);
  const counts = Object.fromEntries(
    ['attachments', 'tools', 'toolResults', 'cancelledCalls'].filter((key) => Number.isSafeInteger(input?.[key]))
      .map((key) => [key, input[key]]),
  );

  return {
    type: input?.type || 'request',
    ...(messages.length ? {
      messageCount: messages.length,
      roles: [...new Set(messages.map((message) => message?.role).filter((role) => SAFE_ROLES.has(role)))],
    } : {}),
    ...counts,
    ...textSummary(text, captureText && input?.includeText !== false),
  };
}

function describeOutput(response, captureText) {
  const outputs = Array.isArray(response?.output) ? response.output : [];
  const steps = Array.isArray(response?.steps) ? response.steps : [];
  const parts = response?.candidates?.[0]?.content?.parts;
  const text = typeof response === 'string' ? response
    : response?.output_text
      ?? (typeof response?.message === 'string' ? response.message : response?.message?.content)
      ?? response?.choices?.[0]?.message?.content
      ?? contentText(outputs.find((item) => item?.type === 'message')?.content)
      ?? contentText(steps.findLast((step) => step?.type === 'model_output')?.content)
      ?? (Array.isArray(parts) ? parts.find((part) => typeof part?.text === 'string')?.text : undefined)
      ?? response?.evaluation
      ?? response?.feedback;
  const toolCalls = response?.toolCalls ?? response?.choices?.[0]?.message?.tool_calls;
  const toolCount = Array.isArray(toolCalls) ? toolCalls.length
    : outputs.filter((item) => item?.type === 'function_call').length;
  const images = Array.isArray(parts) ? parts.filter((part) => part?.inlineData).length : 0;
  return {
    status: response?.error ? 'error' : 'ok',
    ...textSummary(text, captureText),
    ...(toolCount ? { toolCalls: toolCount } : {}),
    ...(images ? { images } : {}),
    ...(response?.output_parsed && { structured: true }),
    ...(Array.isArray(response?.messages) && { messageCount: response.messages.length }),
    ...(typeof response?.partial === 'boolean' && { partial: response.partial }),
    ...(typeof response?.replayed === 'boolean' && { replayed: response.replayed }),
    ...(Number.isFinite(response?.score) && { score: response.score }),
  };
}

module.exports = { describeInput, describeOutput };
