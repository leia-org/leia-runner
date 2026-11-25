import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

describe('Langfuse tracing', () => {
  it('exports organized observations, exclusive usage and redacted previews without leaking secrets', async () => {
    const requests = [];
    const listener = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push({
        path: request.url,
        authorization: request.headers.authorization,
        payload: Buffer.concat(chunks).toString('utf8'),
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });

    await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
    vi.stubEnv('LANGFUSE_BASE_URL', `http://127.0.0.1:${listener.address().port}/`);
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'fixture-public-key');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'fixture-secret-key');
    vi.stubEnv('LANGFUSE_TRACING_ENVIRONMENT', 'integration-test');
    vi.stubEnv('LANGFUSE_TRACE_CONTENT', 'redacted');
    const { withTrace, withGeneration, shutdownTracing } = require('../services/langfuseTracing');

    try {
      const providerError = Object.assign(new Error('Private raw provider error with learner information'), { status: 503 });
      const modelOutput = {
        model: 'gemini-test',
        usage: { total_input_tokens: 17, total_cached_tokens: 4, total_output_tokens: 5, total_thought_tokens: 2, total_tokens: 24 },
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Contact student@example.test for the answer' }] }],
      };
      const result = await withTrace('runner.chat', async () => {
        await expect(withGeneration('runner.model.error', 'openai', 'gpt-test', async () => {
          throw providerError;
        })).rejects.toBe(providerError);
        return withGeneration('runner.model.generate', 'gemini', 'gemini-test', async () => modelOutput, {
          sessionId: 'raw-child-session',
          input: { type: 'structured-generation', text: 'Private child instructions' },
        });
      }, {
        sessionId: 'raw-parent-session',
        hideChildInput: true,
        input: { type: 'message', text: 'Please debug token=public secret=private-value and sk-lf-example-private' },
      });
      expect(result).toBe(modelOutput);
      await withTrace('runner.finished.private', () =>
        withGeneration('runner.finished.private.child', 'openai', 'gpt-test', async () => modelOutput), {
        sessionId: 'raw-parent-session',
        suppressTracing: true,
      });
      await shutdownTracing();

      expect(requests).toHaveLength(1);
      const [request] = requests;
      expect(request.path).toBe('/api/public/otel/v1/traces');
      expect(request.authorization).toBe(`Basic ${Buffer.from('fixture-public-key:fixture-secret-key').toString('base64')}`);
      expect(request.payload).not.toMatch(/Private (raw|child)|fixture-secret-key|private-value|sk-lf-example-private|student@example|raw-(parent|child)-session/);
      const spans = JSON.parse(request.payload).resourceSpans[0].scopeSpans[0].spans;
      expect(spans.map(({ name }) => name)).not.toContain('runner.finished.private.child');
      expect(spans.map(({ name }) => name)).not.toContain('runner.finished.private');
      const root = spans.find(({ name }) => name === 'runner.chat');
      const generation = spans.find(({ name }) => name === 'runner.model.generate');
      const failure = spans.find(({ name }) => name === 'runner.model.error');
      expect(generation.traceId).toBe(root.traceId);
      expect(generation.parentSpanId).toBe(root.spanId);
      expect(failure.status).toMatchObject({ code: 2, message: 'Model call failed' });
      const attributes = Object.fromEntries(generation.attributes.map(({ key, value }) => [key, value.stringValue]));
      const rootAttributes = Object.fromEntries(root.attributes.map(({ key, value }) => [key, value.stringValue]));
      const failureAttributes = Object.fromEntries(failure.attributes.map(({ key, value }) => [key, value.stringValue]));
      expect(attributes['langfuse.session.id']).toMatch(/^[a-f0-9]{32}$/);
      expect(rootAttributes['langfuse.session.id']).toBe(attributes['langfuse.session.id']);
      expect(attributes['langfuse.environment']).toBe('integration-test');
      expect(attributes['langfuse.observation.type']).toBe('generation');
      expect(attributes['langfuse.observation.model.name']).toBe('gemini-test');
      expect(JSON.parse(attributes['langfuse.observation.usage_details'])).toEqual({ input: 13, input_cached_tokens: 4, output: 7, total: 24 });
      expect(JSON.parse(rootAttributes['langfuse.observation.input']).text).toContain('[credential] and [key]');
      expect(JSON.parse(attributes['langfuse.observation.input'])).toEqual({ type: 'structured-generation', textCharacters: 26 });
      expect(JSON.parse(attributes['langfuse.observation.output']).text).toBe('Contact [email] for the answer');
      expect(JSON.parse(failureAttributes['langfuse.observation.output'])).toEqual({ status: 'error', httpStatus: 503 });
    } finally {
      vi.unstubAllEnvs();
      await new Promise((resolve) => listener.close(resolve));
    }
  });

  it('keeps text out of summaries and does not count OpenAI reasoning twice', () => {
    const { describeInput, describeOutput } = require('../utils/traceContent');
    const { usageDetails } = require('../utils/traceUsage');
    expect(describeInput({ text: 'Private text', attachments: 2 }, false))
      .toEqual({ type: 'request', textCharacters: 12, attachments: 2 });
    expect(describeOutput({ message: 'Private answer' }, false))
      .toEqual({ status: 'ok', textCharacters: 14 });
    expect(usageDetails({
      usage: {
        input_tokens: 100, input_tokens_details: { cached_tokens: 60 },
        output_tokens: 40, output_tokens_details: { reasoning_tokens: 10 }, total_tokens: 140,
      },
    }, 'openai')).toEqual({ input: 40, input_cached_tokens: 60, output: 40, total: 140 });
  });
});

describe('Langfuse session trace removal', () => {
  const id = 'abcdef1234567890abcdef12';
  const from = '2026-11-25T08:00:00.000Z';

  it('only deletes traces that match both the hashed session and the environment', async () => {
    vi.stubEnv('LANGFUSE_BASE_URL', 'http://127.0.0.1:12345');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'fixture-public-key');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'fixture-secret-key');
    vi.stubEnv('LANGFUSE_TRACING_ENVIRONMENT', 'integration-test');
    const { langfuseSessionId, getLangfuseConfig } = require('../services/langfuseTracing');
    const { removeSessionTraces } = require('../controllers/traceRetentionController');
    const sessionId = langfuseSessionId(id, getLangfuseConfig());
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'other', sessionId, environment: 'production' }] }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'trace-a', sessionId, environment: 'integration-test' }] }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { params: { sessionId: id }, query: { from } };
    try {
      await removeSessionTraces(req, response);
      expect(response.status).toHaveBeenLastCalledWith(502);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await removeSessionTraces(req, response);
      const lookup = new URL(fetchMock.mock.calls[1][0]);
      expect(Object.fromEntries(lookup.searchParams)).toMatchObject({
        sessionId, fromTimestamp: from, environment: 'integration-test', fields: 'core',
      });
      expect(fetchMock.mock.calls[2][1]).toMatchObject({
        method: 'DELETE', body: JSON.stringify({ traceIds: ['trace-a'] }),
      });
      expect(response.status).toHaveBeenLastCalledWith(202);
      expect(response.json).toHaveBeenLastCalledWith({ complete: false });
      await removeSessionTraces(req, response);
      expect(response.json).toHaveBeenLastCalledWith({ complete: true });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
