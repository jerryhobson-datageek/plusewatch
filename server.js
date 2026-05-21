'use strict';

const http  = require('http');
const https = require('https');
const net   = require('net');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

// ── Config ────────────────────────────────────────────────────────────────────

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PORT         = process.env.PORT || config.port || 3000;
const GLOBAL_INTERVAL = (config.interval || 30) * 1000;
const HISTORY_SIZE = 60;
const DEFAULT_TIMEOUT = 5000;

// ── In-memory state ───────────────────────────────────────────────────────────

const state = {};
for (const svc of config.services) {
  state[svc.id] = {
    id:      svc.id,
    name:    svc.name,
    url:     svc.url,
    type:    svc.type || 'HTTP',
    status:  'pending',
    rt:      null,
    history: [],
    lastCheck: null,
  };
}

// ── Checkers ──────────────────────────────────────────────────────────────────

function checkHTTP(svc) {
  return new Promise((resolve) => {
    const start = Date.now();
    let parsed;
    try {
      parsed = new URL(svc.url);
    } catch {
      return resolve({ status: 'down', rt: 0 });
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const timeout = svc.timeout || DEFAULT_TIMEOUT;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        timeout,
        headers:  { 'User-Agent': 'PulseWatch/1.0', Connection: 'close' },
      },
      (res) => {
        res.resume();
        const rt  = Date.now() - start;
        const ok  = res.statusCode >= 200 && res.statusCode < 400;
        resolve({ status: ok ? 'up' : 'down', rt });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'down', rt: timeout });
    });

    req.on('error', () => resolve({ status: 'down', rt: Date.now() - start }));
    req.end();
  });
}

function checkTCP(svc) {
  return new Promise((resolve) => {
    const start   = Date.now();
    const timeout = svc.timeout || DEFAULT_TIMEOUT;
    const raw     = svc.url.replace(/^tcp:\/\//i, '');
    const colon   = raw.lastIndexOf(':');
    const host    = colon === -1 ? raw : raw.slice(0, colon);
    const port    = colon === -1 ? 80  : parseInt(raw.slice(colon + 1), 10);

    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      const rt = Date.now() - start;
      socket.destroy();
      resolve({ status: 'up', rt });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'down', rt: timeout });
    });

    socket.on('error', () => resolve({ status: 'down', rt: Date.now() - start }));
  });
}

// ── Check runner ──────────────────────────────────────────────────────────────

async function runCheck(svc) {
  let result;
  try {
    result = svc.type === 'TCP' ? await checkTCP(svc) : await checkHTTP(svc);
  } catch {
    result = { status: 'down', rt: 0 };
  }

  // Mark as degraded if response time exceeds threshold
  if (
    result.status === 'up'   &&
    svc.degradedThreshold    &&
    result.rt > svc.degradedThreshold
  ) {
    result.status = 'degraded';
  }

  const d = state[svc.id];
  d.status    = result.status;
  d.rt        = result.rt;
  d.lastCheck = new Date().toISOString();
  d.history.push({ status: result.status, rt: result.rt, ts: Date.now() });
  if (d.history.length > HISTORY_SIZE) d.history.shift();

  const icon = result.status === 'up' ? '✓' : result.status === 'degraded' ? '⚠' : '✗';
  console.log(`[${d.lastCheck}] ${icon} ${svc.name.padEnd(20)} ${result.status.padEnd(8)} ${result.rt}ms`);
}

// ── Monitoring loop ───────────────────────────────────────────────────────────

function startMonitoring() {
  config.services.forEach((svc, i) => {
    const interval = (svc.interval || config.interval || 30) * 1000;
    // Stagger initial checks by 600 ms each to avoid bursts
    setTimeout(() => {
      runCheck(svc);
      setInterval(() => runCheck(svc), interval);
    }, i * 600);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const INDEX_PATH = path.join(__dirname, 'index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

  // ── API ──
  if (pathname === '/api/status') {
    const payload = JSON.stringify({ services: Object.values(state) });
    res.writeHead(200, {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(payload);
    return;
  }

  // ── Static files ──
  const filePath = pathname === '/' ? INDEX_PATH : path.join(__dirname, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\nPulseWatch running → http://localhost:${PORT}\n`);
  startMonitoring();
});
