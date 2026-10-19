// Connectivity checks only. No robot motion, enabling or control commands.
const args = process.argv.slice(2);
function argument(name, fallback) {
  const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1];
}
const portal = argument('--portal', 'http://127.0.0.1:5173').replace(/\/$/, '');
const robot = argument('--robot', 'http://127.0.0.1:5174').replace(/\/$/, '');
const full = args.includes('--full');
if (full && typeof WebSocket === 'undefined') {
  console.error('The full WebSocket check requires Node.js 22 or newer.');
  process.exit(1);
}
let failed = false;
async function check(label, action) {
  try { await action(); console.log(`PASS ${label}`); }
  catch (error) { failed = true; console.error(`FAIL ${label}: ${error.message}`); }
}
async function request(base, route, init = {}) {
  const response = await fetch(base + route, { ...init, signal: AbortSignal.timeout(180000),
    headers: { Origin: new URL(base).origin, ...init.headers } });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 250);
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return response;
}
await check('medical status', async () => {
  const data = await (await request(portal, '/api/medical/status')).json();
  if (data.state !== 'ready') throw new Error(`service state: ${data.state}`);
});
await check('medical questions', async () => {
  const data = await (await request(portal, '/api/medical/questions')).json();
  if (!data.questions?.length) throw new Error('question list is empty');
});
await check('medical POST passes origin validation', async () => {
  const response = await fetch(portal + '/api/medical/ask', { method: 'POST',
    headers: { Origin: new URL(portal).origin, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(15000) });
  if (response.status !== 422) throw new Error(`expected schema validation 422, received ${response.status}`);
});
await check('materials workbench and local Gradio API root', async () => {
  await request(portal, '/agent/materials/');
  const config = await (await request(portal, '/agent/materials/config')).json();
  if (config.root !== portal + '/agent/materials') throw new Error('Gradio root bypasses the local proxy');
  const info = await (await request(portal, '/agent/materials' + config.api_prefix + '/info')).json();
  if (!Object.keys(info.named_endpoints || {}).length) throw new Error('Gradio endpoints are missing');
});
await check('robot health and ASR connection', async () => {
  const data = await (await request(robot, '/health')).json();
  if (!data.runtime_mode) throw new Error('robot health response is incomplete');
  await request(robot, '/api/asr/status');
});
if (full) {
  await check('materials real upload, download and Gradio queue SSE', async () => {
    const base = '/agent/materials/gradio_api';
    const fixture = 'name,value\ndeveloper_connection_check,1\n';
    const form = new FormData();
    form.append('files', new Blob([fixture], { type: 'text/csv' }), 'developer-connection-check.csv');
    const uploaded = await (await request(portal, base + '/upload', { method: 'POST', body: form })).json();
    if (!Array.isArray(uploaded) || typeof uploaded[0] !== 'string') throw new Error('upload response is incomplete');
    const file = await request(portal, base + '/file=' + encodeURIComponent(uploaded[0]));
    if (await file.text() !== fixture) throw new Error('downloaded fixture differs from upload');
    const config = await (await request(portal, '/agent/materials/config')).json();
    const dependency = config.dependencies.find(item => item.api_name === '_recent_chat_choices');
    if (!dependency || dependency.inputs.some(id => config.components.find(item => item.id === id)?.type !== 'state')) {
      throw new Error('Gradio history callback contract changed; review the connection check');
    }
    const event = await (await request(portal, base + '/call/_recent_chat_choices', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Raw Gradio calls retain placeholders for hidden State inputs.
      body: JSON.stringify({ data: dependency.inputs.map(() => null) }),
    })).json();
    if (!event.event_id) throw new Error('Gradio queue event ID missing');
    const stream = await request(portal, base + '/call/_recent_chat_choices/' + encodeURIComponent(event.event_id));
    const result = await stream.text();
    if (!/event:\s*complete/.test(result) || /event:\s*error/.test(result)) throw new Error('Gradio queue did not complete');
  });
  await check('medical real answer SSE', async () => {
    const response = await request(portal, '/api/medical/ask', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        session_id: 'developer_check_' + Date.now(), question: '血压是什么？', parent_answer_id: null,
      }) });
    if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('SSE content type missing');
    const text = await response.text();
    if (!/event:\s*done/.test(text) || !/event:\s*delta/.test(text) || /event:\s*error/.test(text)) {
      throw new Error('answer stream did not complete successfully');
    }
  });
  await check('robot isolated session, WebSocket, telemetry and MJPEG (no commands)', async () => {
    const session = await (await request(robot, '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' } })).json();
    const id = session.session_id || session.id;
    if (!id) throw new Error('session ID missing');
    await request(robot, `/api/sessions/${encodeURIComponent(id)}`);
    await request(robot, `/api/sessions/${encodeURIComponent(id)}/robot/telemetry`);
    await new Promise((resolve, reject) => {
      const url = new URL(`/ws/sessions/${encodeURIComponent(id)}`, robot);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url);
      const timer = setTimeout(() => { socket.close(); reject(new Error('WebSocket message timeout')); }, 15000);
      socket.onmessage = event => {
        try { JSON.parse(String(event.data)); clearTimeout(timer); socket.close(); resolve(); }
        catch (error) { clearTimeout(timer); socket.close(); reject(error); }
      };
      socket.onerror = () => { clearTimeout(timer); socket.close(); reject(new Error('WebSocket connection failed')); };
    });
    const stream = await request(robot, `/api/sessions/${encodeURIComponent(id)}/robot/stream.mjpeg`);
    try {
      if (!stream.headers.get('content-type')?.includes('multipart/')) throw new Error('video stream type missing');
      const reader = stream.body.getReader();
      const first = await reader.read(); await reader.cancel();
      if (!first.value?.length) throw new Error('video stream is empty');
    } finally { if (!stream.body.locked) await stream.body.cancel(); }
  });
}
if (failed) process.exitCode = 1;
else console.log(full ? 'All live connection checks passed.' : 'Basic checks passed. Use --full for one real medical answer and an isolated robot session.');
