import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { port: 5174, target: 'http://localhost:4023', apiPrefix: '/api', staticDir: 'dist' };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--port') args.port = Number(argv[++i]);
    else if (v === '--target') args.target = argv[++i];
    else if (v === '--apiPrefix') args.apiPrefix = argv[++i];
    else if (v === '--staticDir') args.staticDir = argv[++i];
  }
  return args;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.woff') return 'font/woff';
  if (ext === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

function pipeProxy(req, res, target, apiPrefix) {
  const targetUrl = new URL(target);
  const incomingUrl = new URL(req.url || '/', 'http://localhost');
  const forwardPath = incomingUrl.pathname.slice(apiPrefix.length) + incomingUrl.search;

  const opts = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: forwardPath.startsWith('/') ? forwardPath : `/${forwardPath}`,
    headers: {
      ...req.headers,
      host: targetUrl.host
    }
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    res.statusCode = proxyRes.statusCode || 502;
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (v !== undefined) res.setHeader(k, v);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ message: 'API proxy error' }));
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res, staticRoot) {
  const incomingUrl = new URL(req.url || '/', 'http://localhost');
  const pathnameSafe = decodeURIComponent(incomingUrl.pathname);

  const filePath =
    pathnameSafe === '/' ? path.join(staticRoot, 'index.html') : path.join(staticRoot, pathnameSafe.replace(/^\//, ''));

  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(staticRoot)) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }

  let toServe = normalized;
  if (!fs.existsSync(toServe) || fs.statSync(toServe).isDirectory()) {
    toServe = path.join(staticRoot, 'index.html');
  }

  try {
    const buf = fs.readFileSync(toServe);
    res.statusCode = 200;
    res.setHeader('content-type', contentTypeFor(toServe));
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

const args = parseArgs(process.argv);
const staticRoot = path.resolve(process.cwd(), args.staticDir);

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0] || '/';
  if (urlPath.startsWith(args.apiPrefix + '/')) {
    return pipeProxy(req, res, args.target, args.apiPrefix);
  }
  return serveStatic(req, res, staticRoot);
});

server.listen(args.port, '0.0.0.0', () => {
  process.stdout.write(`Sutra POS server running: http://localhost:${args.port}/\n`);
  process.stdout.write(`API proxy: ${args.apiPrefix} -> ${args.target}\n`);
});

