const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const apiHandler = require('./api/index');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendStatic(pathname, res) {
  const route = pathname === '/' ? '/web/index.html' : pathname;
  const filePath = path.join(ROOT, path.normalize(route).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      req.query = Object.fromEntries(url.searchParams.entries());
      req.body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await parseBody(req) : {};
      res.status = (statusCode) => { res.statusCode = statusCode; return res; };
      res.json = (body) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
      req.url = url.pathname;
      return apiHandler(req, res);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
  }
  sendStatic(url.pathname, res);
});

server.listen(PORT, () => {
  console.log(`VIP app running at http://127.0.0.1:${PORT}`);
});
