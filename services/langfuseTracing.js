const { SpanStatusCode } = require('@opentelemetry/api');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { BatchSpanProcessor, NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

const SERVICE_NAME = 'leia-runner';
let telemetry;

function getTelemetry() {
  if (telemetry !== undefined) return telemetry;
  telemetry = null;

  const { LANGFUSE_BASE_URL: baseUrl, LANGFUSE_PUBLIC_KEY: publicKey, LANGFUSE_SECRET_KEY: secretKey } = process.env;
  if (!baseUrl || !publicKey || !secretKey) return null;

  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid Langfuse base URL');
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/public/otel/v1/traces`;

    const environment = process.env.LANGFUSE_TRACING_ENVIRONMENT || process.env.NODE_ENV || 'development';
    const exporter = new OTLPTraceExporter({
      url: url.href,
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
      },
      timeoutMillis: 3000,
    });
    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ 'service.name': SERVICE_NAME, 'deployment.environment.name': environment }),
      spanProcessors: [
        new BatchSpanProcessor(exporter, {
          maxQueueSize: 512,
          maxExportBatchSize: 64,
          scheduledDelayMillis: 1000,
          exportTimeoutMillis: 3000,
        }),
      ],
    });
    provider.register();
    telemetry = { provider, tracer: provider.getTracer(SERVICE_NAME), environment };
  } catch {
    console.warn('Langfuse tracing could not be initialized');
  }

  return telemetry;
}

function modelName(value) {
  return typeof value === 'string' && /^[\w./:-]{1,128}$/.test(value) ? value : undefined;
}

function usageDetails(response) {
  const usage = response?.usage ?? response?.usageMetadata;
  const counts = {
    input: usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.total_input_tokens ?? usage?.promptTokenCount ?? response?.prompt_eval_count,
    output: usage?.output_tokens ?? usage?.completion_tokens ?? usage?.total_output_tokens ?? usage?.candidatesTokenCount ?? response?.eval_count,
    total: usage?.total_tokens ?? usage?.totalTokenCount,
  };
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => Number.isSafeInteger(count) && count >= 0));
}

async function withTrace(name, operation, generation) {
  const instance = getTelemetry();
  if (!instance) return operation();

  const attributes = { 'langfuse.environment': instance.environment };
  if (generation) {
    attributes['langfuse.observation.type'] = 'generation';
    attributes['gen_ai.provider.name'] = generation.provider;
    const model = modelName(generation.model);
    if (model) attributes['langfuse.observation.model.name'] = model;
  }

  return instance.tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const response = await operation();
      if (generation) {
        const model = modelName(response?.model);
        if (model) span.setAttribute('langfuse.observation.model.name', model);
        const usage = usageDetails(response);
        if (Object.keys(usage).length) {
          span.setAttribute('langfuse.observation.usage_details', JSON.stringify(usage));
        }
        if (response?.error) span.setStatus({ code: SpanStatusCode.ERROR, message: 'Model call failed' });
      }
      return response;
    } catch (error) {
      // Provider exceptions can contain credentials, user data, and raw responses.
      span.setStatus({ code: SpanStatusCode.ERROR, message: generation ? 'Model call failed' : 'Runner operation failed' });
      throw error;
    } finally {
      span.end();
    }
  });
}

function withGeneration(name, provider, model, operation) {
  return withTrace(name, operation, { provider, model });
}

async function shutdownTracing() {
  await telemetry?.provider.shutdown();
}

module.exports = { withTrace, withGeneration, shutdownTracing };
