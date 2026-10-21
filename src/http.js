// Mend over Streamable HTTP (MCP 2025-11-25). Stateful sessions, so the server
// can ask the person directly (elicitation) in the middle of a tool call.
//   npm start                 → http://127.0.0.1:8787/mcp
//   PORT, HOST, MEND_DATA, MEND_OFFLINE=1, MEND_SEED=0, MEND_ALLOW_ANY_HOST=1

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { NodeStreamableHTTPServerTransport, localhostHostValidation } from '@modelcontextprotocol/node';
import { createMendServer, VERSION } from './server.js';
import { createFileStore } from './store.js';
import { createGuideSource } from './ifixit.js';
import { seedDemo } from './seed.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const IDLE_MS = 30 * 60000;

const store = createFileStore(process.env.MEND_DATA || join(ROOT, 'data', 'households'));
const guides = createGuideSource({ cacheDir: join(ROOT, 'data', 'cache'), offline: process.env.MEND_OFFLINE === '1' });
if (process.env.MEND_SEED !== '0') await seedDemo(store, 'demo');

const sessions = new Map();
const validateHost = localhostHostValidation();
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(HOST) && process.env.MEND_ALLOW_ANY_HOST !== '1';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id, x-mend-household');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
}

const householdOf = (req, url) => String(req.headers['x-mend-household'] || url.searchParams.get('household') || process.env.MEND_HOUSEHOLD || 'demo');

async function handleMcp(req, res, url) {
  const sid = req.headers['mcp-session-id'];
  if (sid) {
    const s = sessions.get(sid);
    if (!s) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found. Initialize a new session.' }, id: null }));
      return;
    }
    s.last = Date.now();
    await s.transport.handleRequest(req, res);
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Start a session with an initialize request.' }, id: null }));
    return;
  }
  const household = householdOf(req, url);
  const server = createMendServer({ store, guides, household });
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => sessions.set(id, { transport, server, household, last: Date.now() }),
    onsessionclosed: (id) => sessions.delete(id),
  });
  transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

const LANDING = `<!doctype html><meta charset="utf-8"><title>Mend MCP server</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;color:#13212e}code{background:#eef3f7;padding:2px 6px;border-radius:6px}h1{margin-bottom:0}</style>
<h1>Mend</h1><p>Hands-free repair copilot for Alexa+. MCP server, protocol <code>2025-11-25</code>, Streamable HTTP.</p>
<p>Endpoint: <code>POST /mcp</code> · Health: <a href="/health">/health</a></p>
<p>Tools: find_repair_guides, start_repair, repair_step, finish_repair, add_part_to_cart, view_cart, register_appliance, appliance_passport, maintenance_due, mark_maintenance_done.</p>`;

const http = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (loopback && !validateHost(req, res)) return;
  try {
    if (url.pathname === '/mcp') return await handleMcp(req, res, url);
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: 'mend', version: VERSION, protocol: '2025-11-25', sessions: sessions.size }));
      return;
    }
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(LANDING); return; }
    res.writeHead(404).end('Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
  }
});

setInterval(() => {
  const cutoff = Date.now() - IDLE_MS;
  for (const [id, s] of sessions) if (s.last < cutoff) { s.transport.close?.(); sessions.delete(id); }
}, 5 * 60000).unref();

http.listen(PORT, HOST, () => console.log(`Mend MCP server on http://${HOST}:${PORT}/mcp (protocol 2025-11-25)`));
