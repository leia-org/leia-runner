const { OpenAI, toFile } = require('openai');
const { redisClient } = require('../config/redis');
const apiKeyService = require('./apiKeyService');

// Same tool wire-format as the LEIA message flow: the FE sends tools as
// { name, description, parameters }; we return { toolCalls:[{callId,name,arguments}] }
// and accept { toolResults }. Kept self-contained here so the problem-chat does
// not depend on the openai-responses provider internals.
function normalizeTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const out = [];
  for (const t of tools) {
    if (!t || typeof t.name !== 'string') continue;
    out.push({
      type: 'function',
      name: t.name,
      description: typeof t.description === 'string' ? t.description : '',
      parameters:
        t.parameters && typeof t.parameters === 'object' ? t.parameters : { type: 'object', properties: {} },
    });
  }
  return out.length > 0 ? out : null;
}

function extractToolCalls(response) {
  if (!Array.isArray(response?.output)) return [];
  const calls = [];
  for (const item of response.output) {
    if (!item || item.type !== 'function_call') continue;
    calls.push({
      callId: item.call_id || item.id,
      name: item.name,
      arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
    });
  }
  return calls;
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }
  if (!Array.isArray(response?.output)) return '';
  return response.output
    .filter((item) => item?.type === 'message' && Array.isArray(item.content))
    .flatMap((item) => item.content)
    .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

const STORE_PREFIX = 'problemchat:';
const TTL_SECONDS = 6 * 60 * 60; // 6h — design-time assistant, ephemeral.

// Design-time assistant. The actual problem-editing tools (get_current_problem,
// apply_problem) are registered by the FRONTEND (same pattern as the widget
// tools); here we only describe how/when to use them.
const SYSTEM_PROMPT = [
  'You help an instructor design a LEIA problem for an educational platform where students practice by interacting with an AI that simulates a real-world scenario.',
  'A LEIA problem has these fields: description, personaBackground, details, solution, solutionFormat (one of: text, mermaid, yaml, markdown, html, json, xml), process.',
  'You have two tools, provided by the editor:',
  '- get_current_problem(): returns the problem currently in the editor. Call it before modifying an existing problem, or to match its style/solutionFormat.',
  '- apply_problem(spec): writes a COMPLETE problem spec into the editor. Call it once you have enough information (from the conversation and/or an attached PDF of a past exercise) to produce a coherent problem.',
  'Guidance:',
  '- If the user attaches a PDF and asks to convert it into a problem, read the PDF, reconstruct the scenario, and call apply_problem with a complete spec. If the solution should be a diagram, put valid mermaid in `solution` and set solutionFormat to "mermaid".',
  '- If the user asks to change the current problem, call get_current_problem first, then apply_problem with the updated spec.',
  '- Keep description/personaBackground/details/solution internally consistent. Template tags like {{persona.firstName}} may be used where natural.',
  '- After applying, briefly summarise what you created or changed. If you cannot produce a valid problem (e.g. the PDF is empty or unreadable), explain why instead of calling apply_problem.',
  'Always respond in the same language as the user or the attached document.',
].join('\n');

class ProblemChatService {
  _key(chatId) {
    return `${STORE_PREFIX}${chatId}`;
  }

  async _get(chatId) {
    const raw = await redisClient.get(this._key(chatId));
    return raw ? JSON.parse(raw) : null;
  }

  async _set(chatId, data) {
    await redisClient.set(this._key(chatId), JSON.stringify(data), { EX: TTL_SECONDS });
  }

  async openSession(chatId, runnerConfiguration = {}) {
    await this._set(chatId, { runnerConfiguration, fileIds: [], responseId: null });
    return { chatId };
  }

  // BYOK: resolve the instructor's OpenAI key (via the auth service) and build a
  // per-request client. The chat always runs on OpenAI (Responses API).
  async _client(runnerConfiguration) {
    const { apiKeyId, apiKeyRequesterId } = runnerConfiguration || {};
    const { keyValue, baseUrl } = await apiKeyService.getApiKeyData('openai', apiKeyId, apiKeyRequesterId);
    return new OpenAI({ apiKey: keyValue, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  }

  async uploadFile(chatId, buffer, filename) {
    const session = await this._get(chatId);
    if (!session) {
      const error = new Error('Problem-chat session not found');
      error.statusCode = 404;
      throw error;
    }
    const client = await this._client(session.runnerConfiguration);
    const file = await toFile(buffer, filename || 'document.pdf', { type: 'application/pdf' });
    const uploaded = await client.files.create({ file, purpose: 'user_data' });
    session.fileIds.push(uploaded.id);
    await this._set(chatId, session);
    return { fileId: uploaded.id, filename: filename || 'document.pdf', bytes: buffer.length };
  }

  async sendMessage(chatId, { message, tools, toolResults }) {
    const session = await this._get(chatId);
    if (!session) {
      const error = new Error('Problem-chat session not found');
      error.statusCode = 404;
      throw error;
    }

    const client = await this._client(session.runnerConfiguration);
    const model = session.runnerConfiguration?.modelName || process.env.OPENAI_MODEL || 'gpt-5.4-mini';
    const normalizedTools = normalizeTools(tools);

    let input;
    const hasToolResults = Array.isArray(toolResults) && toolResults.length > 0;
    if (hasToolResults) {
      input = toolResults.map((r) => ({
        type: 'function_call_output',
        call_id: r.callId,
        output: typeof r.output === 'string' ? r.output : JSON.stringify(r.output ?? null),
      }));
    } else {
      const content = [];
      // Attach uploaded PDFs only on the FIRST turn; later turns inherit them
      // through previous_response_id.
      if (!session.responseId && Array.isArray(session.fileIds)) {
        for (const fileId of session.fileIds) {
          content.push({ type: 'input_file', file_id: fileId });
        }
      }
      content.push({ type: 'input_text', text: message || '' });
      input = [{ role: 'user', content }];
    }

    const payload = {
      model,
      input,
      store: true,
      instructions: SYSTEM_PROMPT,
    };
    if (session.responseId) payload.previous_response_id = session.responseId;
    if (normalizedTools) payload.tools = normalizedTools;

    const response = await client.responses.create(payload);
    if (response?.error) {
      throw new Error(response.error.message || 'OpenAI response error');
    }

    session.responseId = response.id || session.responseId;
    await this._set(chatId, session);

    const toolCalls = extractToolCalls(response);
    if (toolCalls.length > 0) {
      return { toolCalls, responseId: response.id };
    }
    return { message: extractResponseText(response), responseId: response.id };
  }
}

module.exports = new ProblemChatService();
