import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../materials_ui/ui_upload_progress.js', import.meta.url), 'utf8');
function load(overrides = {}) {
  const context = { module: { exports: {} }, clearTimeout, setTimeout, URL, TextDecoder,
    FormData, AbortController, ...overrides };
  vm.runInNewContext(source, context);
  return { ...context.module.exports, context };
}
const { UploadBatch, UploadTracker, filePaths, parseEvents } = load();
const files = [0, 1, 2, 3].map(index => ({ name: `${index}.pdf`, size: 100 }));
const paths = files.map(file => `/tmp/gradio/current/${file.name}`);

test('a complete upload response reconciles lost progress samples to 100% and four received files', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('four-pdfs', files);
  batch.receive('0.pdf', 148);
  batch.receive('1.pdf', 48);
  assert.equal(batch.percent, 37);
  assert.equal(batch.completed, 0);
  assert.equal(tracker.accepted(batch, paths), true);
  assert.equal(batch.percent, 100);
  assert.equal(batch.loaded, 400);
  assert.equal(batch.completed, 4);
  assert.equal(batch.state, 'adding');
  assert.equal(tracker.active, true);
  batch.receive('2.pdf', 20);
  assert.equal(batch.percent, 100);
});

test('same-name files remain separate in the returned full-path identity', () => {
  const batch = new UploadBatch('same-name', [{ name: 'paper.pdf', size: 100 }, { name: 'paper.pdf', size: 200 }]);
  batch.receive('paper.pdf', 300);
  assert.equal(batch.percent, 99);
  assert.equal(batch.completed, 0);
  assert.equal(batch.accepted(['/tmp/hash-one/paper.pdf', '/tmp/hash-two/paper.pdf']), true);
  assert.equal(batch.paths.size, 2);
  assert.equal(batch.completed, 2);
});

test('incomplete or malformed path responses cannot confirm an upload', () => {
  for (const result of [paths.slice(0, 3), [...paths.slice(0, 3), null], {}, null]) {
    const tracker = new UploadTracker();
    const batch = tracker.begin('bad-paths', files);
    assert.equal(tracker.accepted(batch, result), false);
    assert.equal(batch.transferComplete, false);
    assert.equal(batch.state, 'uploading');
  }
  assert.equal(filePaths([{ path: '/tmp/a.pdf' }, '/tmp/b.pdf']).size, 2);
  assert.equal(filePaths([{ url: '/tmp/a.pdf' }]), null);
});

test('only successful completion of the associated upload event marks attachments ready', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('queue-pdfs', files);
  tracker.accepted(batch, paths);
  const request = tracker.join(paths.map(path => ({ path })));
  tracker.register(request, 'own-event');
  tracker.complete('unrelated-event', true);
  assert.equal(batch.state, 'adding');
  tracker.complete('own-event', true);
  assert.equal(batch.state, 'ready');
  assert.equal(tracker.active, false);
});

test('queue completion arriving before its join response is buffered', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('early-completion', files);
  tracker.accepted(batch, paths);
  const request = tracker.join(paths);
  tracker.complete('fast-event', true);
  assert.equal(batch.state, 'adding');
  tracker.register(request, 'fast-event');
  assert.equal(batch.state, 'ready');
});

test('late upload metadata reconciles a completion already associated with the response', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('slow-json', files);
  tracker.received(batch);
  const request = tracker.join(paths);
  tracker.complete('fast-event', true);
  tracker.register(request, 'fast-event');
  assert.equal(batch.state, 'uploading');
  tracker.accepted(batch, paths);
  assert.equal(batch.state, 'ready');
});

test('a cumulative file input can acknowledge multiple concurrent batches', () => {
  const tracker = new UploadTracker();
  const first = tracker.begin('first', files.slice(0, 2));
  const second = tracker.begin('second', files.slice(2));
  tracker.accepted(first, paths.slice(0, 2));
  tracker.accepted(second, paths.slice(2));
  const request = tracker.join(paths);
  tracker.register(request, 'cumulative-event');
  tracker.complete('cumulative-event', true);
  assert.equal(first.state, 'ready');
  assert.equal(second.state, 'ready');
});

test('a queue request made before this transfer response cannot confirm a reused path', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('new-transfer', files);
  const older = tracker.join(paths);
  tracker.register(older, 'older-event');
  tracker.complete('older-event', true);
  tracker.accepted(batch, paths);
  assert.equal(batch.state, 'adding');
  const current = tracker.join(paths);
  tracker.register(current, 'current-event');
  tracker.complete('current-event', true);
  assert.equal(batch.state, 'ready');
});

test('reset isolates delayed upload, join and completion callbacks from the next page', () => {
  const tracker = new UploadTracker();
  const previous = tracker.begin('reused-id', files);
  tracker.accepted(previous, paths);
  const oldRequest = tracker.join(paths);
  tracker.clear();
  const current = tracker.begin('reused-id', files);
  tracker.accepted(current, paths);
  tracker.register(oldRequest, 'old-event');
  tracker.complete('old-event', true);
  assert.equal(tracker.accepted(previous, paths), false);
  assert.equal(current.state, 'adding');
  const request = tracker.join(paths);
  tracker.register(request, 'new-event');
  tracker.complete('new-event', true);
  assert.equal(current.state, 'ready');
});

test('settled feedback and old completion events cannot confirm a fresh same-path batch', () => {
  const tracker = new UploadTracker();
  const first = tracker.begin('old', files);
  tracker.accepted(first, paths);
  const oldRequest = tracker.join(paths);
  tracker.register(oldRequest, 'old-event');
  tracker.complete('old-event', true);
  const next = tracker.begin('new', files);
  tracker.accepted(next, paths);
  tracker.complete('old-event', true);
  assert.equal(next.state, 'adding');
  assert.equal(tracker.current(first), false);
  assert.doesNotMatch(source, /matagent-upload-ready|crypto\.subtle|pathDigest/);
});

test('an attachment callback failure preserves complete transfer counts and permits a clean retry', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('failed-queue', files);
  tracker.accepted(batch, paths);
  const request = tracker.join(paths);
  tracker.register(request, 'failed-event');
  tracker.complete('failed-event', false);
  assert.equal(batch.state, 'failed');
  assert.equal(batch.percent, 100);
  assert.equal(batch.completed, 4);
  assert.equal(tracker.active, false);
  const retry = tracker.begin('retry', files);
  tracker.accepted(retry, paths);
  tracker.register(request, 'failed-event');
  assert.equal(retry.state, 'adding');
});

test('failed join responses and malformed event IDs cannot mark a batch ready', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('join-error', files);
  tracker.accepted(batch, paths);
  const request = tracker.join(paths);
  tracker.register(request, null);
  assert.equal(batch.state, 'failed');
  assert.equal(tracker.pending, false);
  assert.match(batch.error, /响应不完整/);
  for (let index = 0; index < 100; index++) tracker.complete(`unrelated-${index}`, true);
  assert.equal(tracker.earlyCompletions.size, 64);
});

test('all in-flight upload callbacks finish before feedback becomes idle', () => {
  const tracker = new UploadTracker();
  const batch = tracker.begin('two-callbacks', files);
  tracker.accepted(batch, paths);
  const first = tracker.join(paths);
  const second = tracker.join(paths);
  tracker.register(first, 'first-event');
  tracker.register(second, 'second-event');
  tracker.complete('first-event', true);
  assert.equal(batch.state, 'ready');
  assert.equal(tracker.active, true);
  tracker.complete('second-event', true);
  assert.equal(tracker.active, false);
});

test('SSE parsing retains split frames and supports CRLF and multiple data lines', () => {
  const first = parseEvents('data: {"msg":"process_com');
  assert.equal(first.events.length, 0);
  const next = parseEvents(first.rest + 'pleted",\r\ndata: "success":true}\r\n\r\ndata: invalid\n\n');
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].msg, 'process_completed');
  assert.equal(next.events[0].success, true);
  assert.equal(next.rest, '');
});

function fakeDocument() {
  const nodes = new Map();
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.attributes = new Map(); this.classList = { toggle() {} }; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    before(child) { nodes.set(child.id, child); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    querySelector(selector) {
      if (selector === 'progress') return this.children.find(child => child.tag === 'progress');
      const part = selector.match(/data-part="([^"]+)"/)?.[1];
      return this.children.find(child => child.dataset.part === part);
    }
  }
  const controls = ['send-button', 'clear-upload', 'new-chat'].map(id => { const node = new Element(); node.id = id; return node; });
  const attachments = new Element();
  const listeners = new Map();
  return { nodes, controls, listeners,
    head: new Element(), documentElement: new Element(),
    createElement: tag => new Element(tag),
    getElementById: id => nodes.get(id),
    querySelector: selector => selector === '.attachment-status' ? attachments : null,
    querySelectorAll: selector => selector === '#send-button,#clear-upload,#new-chat' ? controls : [],
    addEventListener: (type, handler) => listeners.set(type, handler) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('HTTP fetch wrapper registers paths before returning and uses queue completion without WebCrypto', async () => {
  const document = fakeDocument();
  let resolveUpload;
  let uploadResponse = { ok: true, clone: () => ({ json: () => new Promise(resolve => { resolveUpload = resolve; }) }) };
  const originalResponse = uploadResponse;
  const queueResponse = { ok: true, clone: () => ({ json: async () => ({ event_id: 'actual-event' }) }) };
  const calls = [];
  const window = { gradio_config: { components: [{ id: 8, props: { elem_id: 'pdf-upload' } }],
    dependencies: [{ id: 12, targets: [[8, 'upload']] }] },
    fetch: async (input, options) => {
      calls.push([input, options]);
      if (String(input).includes('/upload?')) return uploadResponse;
      if (String(input).includes('/queue/join')) return queueResponse;
      return new Response('data: {"msg":"process_completed","event_id":"actual-event","success":true}\n\n');
    } };
  const { install } = load({ window, document, location: { origin: 'http://public.example', href: 'http://public.example/agent/materials/' },
    MutationObserver: class { observe() {} } });
  install();
  assert.equal(window.crypto, undefined);
  const body = new FormData();
  files.forEach(file => body.append('files', new Blob([new Uint8Array(file.size)]), file.name));
  const headers = { 'X-Test': 'unchanged' };
  const pending = window.fetch('/agent/materials/gradio_api/upload?upload_id=batch', { method: 'POST', body, headers });
  let returned = false;
  pending.then(() => { returned = true; });
  await tick();
  assert.equal(returned, false);
  resolveUpload(paths);
  assert.equal(await pending, originalResponse);
  const feedback = document.nodes.get('matagent-upload-feedback');
  assert.match(feedback.querySelector('[data-part="title"]').textContent, /传输完成/);
  assert.match(feedback.querySelector('[data-part="details"]').textContent, /100%.*4\/4/);
  assert.equal(document.controls[0].getAttribute('aria-disabled'), 'true');
  // Gradio's stream helper passes a Request, not a URL/options pair.
  await window.fetch(new Request('http://public.example/agent/materials/gradio_api/queue/data?session_hash=test'));
  await tick();
  assert.match(feedback.querySelector('[data-part="title"]').textContent, /正在加入/);
  await window.fetch('/agent/materials/gradio_api/queue/join', { method: 'POST', body: JSON.stringify({ fn_index: 12, data: [paths.map(path => ({ path }))] }) });
  assert.equal(feedback.querySelector('[data-part="title"]').textContent, '上传完成，待发送');
  assert.equal(document.controls[0].getAttribute('aria-disabled'), null);
  assert.equal(calls[0][1].headers, headers);
  assert.equal(calls[0][1].body, body);

  document.listeners.get('click')({ target: { closest: () => document.controls[1] } });
  assert.equal(feedback.hidden, true);
  uploadResponse = { ok: false, status: 413 };
  await window.fetch('/agent/materials/gradio_api/upload?upload_id=failed', { method: 'POST', body });
  assert.match(feedback.querySelector('[data-part="title"]').textContent, /上传失败.*413/);
  assert.equal(document.controls[0].getAttribute('aria-disabled'), 'true');
  assert.equal(document.controls[1].getAttribute('aria-disabled'), null);
  let blocked = false;
  document.listeners.get('click')({ target: { closest: () => document.controls[0] },
    preventDefault() { blocked = true; }, stopImmediatePropagation() {} });
  assert.equal(blocked, true);
  document.listeners.get('click')({ target: { closest: () => document.controls[2] } });
  assert.equal(feedback.hidden, true);

  uploadResponse = { ok: true, clone: () => ({ json: async () => paths.slice(0, 3) }) };
  await window.fetch('/agent/materials/gradio_api/upload?upload_id=partial', { method: 'POST', body });
  assert.match(feedback.querySelector('[data-part="title"]').textContent, /服务器未确认全部附件/);
  assert.equal(document.controls[0].getAttribute('aria-disabled'), 'true');
});
