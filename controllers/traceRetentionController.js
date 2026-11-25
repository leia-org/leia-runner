const { getLangfuseConfig, langfuseSessionId } = require('../services/langfuseTracing');

// Langfuse deletes asynchronously. The caller checks the first page again on
// its next scheduled pass until all traces for this session are gone.
exports.removeSessionTraces = async (req, res) => {
  const { sessionId } = req.params;
  const from = new Date(req.query.from);
  if (!/^[a-f\d]{24}$/i.test(sessionId) || !Number.isFinite(from.getTime())) {
    return res.status(400).json({ error: 'A Workbench session ID and start time are required' });
  }

  try {
    const config = getLangfuseConfig();
    if (!config) return res.status(503).json({ error: 'Langfuse is unavailable' });
    const traceSession = langfuseSessionId(sessionId, config);
    const url = `${config.apiUrl}/traces`;
    const query = new URLSearchParams({
      sessionId: traceSession,
      environment: config.environment,
      fromTimestamp: from.toISOString(),
      fields: 'core',
      limit: '100',
    });
    const options = { headers: { Authorization: config.authorization }, redirect: 'error' };
    const response = await fetch(`${url}?${query}`, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Langfuse trace lookup failed');
    const { data } = await response.json();
    if (!Array.isArray(data) || data.some((trace) => trace.sessionId !== traceSession
      || trace.environment !== config.environment || typeof trace.id !== 'string' || !trace.id)) {
      throw new Error('Unexpected Langfuse trace result');
    }
    if (data.length === 0) return res.json({ complete: true });

    const deletion = await fetch(url, {
      ...options,
      method: 'DELETE',
      headers: { ...options.headers, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ traceIds: [...new Set(data.map(({ id }) => id))] }),
    });
    if (!deletion.ok) throw new Error('Langfuse trace deletion failed');
    return res.status(202).json({ complete: false });
  } catch {
    return res.status(502).json({ error: 'Could not remove Langfuse traces' });
  }
};
