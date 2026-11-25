import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

describe('Langfuse tracing', () => {
  it('exports nested observations and usage without leaking messages or provider errors', async () => {
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
    const { withTrace, withGeneration, shutdownTracing } = require('../services/langfuseTracing');

    try {
      const providerError = new Error('Private raw provider error with learner information');
      const modelOutput = {
        model: 'gemini-test',
        usage: { total_input_tokens: 17, total_output_tokens: 5, total_tokens: 22 },
        text: 'Private learner response',
      };
      const result = await withTrace('runner.chat', async () => {
        await expect(withGeneration('runner.model.error', 'openai', 'gpt-test', async () => {
          throw providerError;
        })).rejects.toBe(providerError);
        return withGeneration('runner.model.generate', 'gemini', 'gemini-test', async () => modelOutput);
      });
      expect(result).toBe(modelOutput);
      await shutdownTracing();

      expect(requests).toHaveLength(1);
      const [request] = requests;
      expect(request.path).toBe('/api/public/otel/v1/traces');
      expect(request.authorization).toBe(`Basic ${Buffer.from('fixture-public-key:fixture-secret-key').toString('base64')}`);
      expect(request.payload).not.toMatch(/Private (raw|learner)|fixture-secret-key/);
      const spans = JSON.parse(request.payload).resourceSpans[0].scopeSpans[0].spans;
      const root = spans.find(({ name }) => name === 'runner.chat');
      const generation = spans.find(({ name }) => name === 'runner.model.generate');
      const failure = spans.find(({ name }) => name === 'runner.model.error');
      expect(generation.traceId).toBe(root.traceId);
      expect(generation.parentSpanId).toBe(root.spanId);
      expect(failure.status).toMatchObject({ code: 2, message: 'Model call failed' });
      const attributes = Object.fromEntries(generation.attributes.map(({ key, value }) => [key, value.stringValue]));
      expect(attributes['langfuse.environment']).toBe('integration-test');
      expect(attributes['langfuse.observation.type']).toBe('generation');
      expect(attributes['langfuse.observation.model.name']).toBe('gemini-test');
      expect(JSON.parse(attributes['langfuse.observation.usage_details'])).toEqual({ input: 17, output: 5, total: 22 });
    } finally {
      vi.unstubAllEnvs();
      await new Promise((resolve) => listener.close(resolve));
    }
  });
});
