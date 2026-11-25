const { createHmac } = require('node:crypto');
const { context, createContextKey, SpanStatusCode } = require('@opentelemetry/api');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { BatchSpanProcessor, NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { describeInput, describeOutput } = require('../utils/traceContent');
const { usageDetails } = require('../utils/traceUsage');

const SERVICE_NAME = 'leia-runner';
const TRACE_SESSION = createContextKey('leia-runner.langfuse.session');
const PRIVATE_INPUT = createContextKey('leia-runner.langfuse.private-input');
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
    telemetry = {
      provider,
      tracer: provider.getTracer(SERVICE_NAME),
      environment,
      sessionKey: secretKey,
      captureText: process.env.LANGFUSE_TRACE_CONTENT === 'redacted',
    };
  } catch {
    console.warn('Langfuse tracing could not be initialized');
  }

  return telemetry;
}

function modelName(value) {
  return typeof value === 'string' && /^[\w./:-]{1,128}$/.test(value) ? value : undefined;
}

async function withTrace(name, operation, { generation, input, sessionId, hideChildInput = false } = {}) {
  const instance = getTelemetry();
  if (!instance) return operation();

  let activeContext = context.active();
  const captureInputText = instance.captureText && !activeContext.getValue(PRIVATE_INPUT);
  if (hideChildInput) activeContext = activeContext.setValue(PRIVATE_INPUT, true);
  let traceSession = activeContext.getValue(TRACE_SESSION);
  if (!traceSession && typeof sessionId === 'string' && sessionId) {
    traceSession = createHmac('sha256', instance.sessionKey)
      .update(instance.environment).update('\0').update(sessionId).digest('hex').slice(0, 32);
    activeContext = activeContext.setValue(TRACE_SESSION, traceSession);
  }
  const attributes = {
    'langfuse.environment': instance.environment,
    'langfuse.observation.input': JSON.stringify(describeInput(input, captureInputText)),
    ...(traceSession && { 'langfuse.session.id': traceSession }),
  };
  if (generation) {
    attributes['langfuse.observation.type'] = 'generation';
    attributes['gen_ai.provider.name'] = generation.provider;
    const model = modelName(generation.model);
    if (model) attributes['langfuse.observation.model.name'] = model;
  }

  return instance.tracer.startActiveSpan(name, { attributes }, activeContext, async (span) => {
    try {
      const response = await operation();
      span.setAttribute('langfuse.observation.output', JSON.stringify(describeOutput(response, instance.captureText)));
      if (generation) {
        const model = modelName(response?.model);
        if (model) span.setAttribute('langfuse.observation.model.name', model);
        const usage = usageDetails(response, generation.provider);
        if (Object.keys(usage).length) {
          span.setAttribute('langfuse.observation.usage_details', JSON.stringify(usage));
        }
        if (response?.error) span.setStatus({ code: SpanStatusCode.ERROR, message: 'Model call failed' });
      }
      return response;
    } catch (error) {
      // Provider exceptions can contain credentials, user data, and raw responses.
      span.setStatus({ code: SpanStatusCode.ERROR, message: generation ? 'Model call failed' : 'Runner operation failed' });
      const status = error?.statusCode ?? error?.status;
      span.setAttribute('langfuse.observation.output', JSON.stringify({
        status: 'error',
        ...(Number.isInteger(status) && status >= 400 && status <= 599 ? { httpStatus: status } : {}),
      }));
      throw error;
    } finally {
      span.end();
    }
  });
}

function withGeneration(name, provider, model, operation, options) {
  return withTrace(name, operation, { ...options, generation: { provider, model } });
}

async function shutdownTracing() {
  await telemetry?.provider.shutdown();
}

module.exports = { withTrace, withGeneration, shutdownTracing };
