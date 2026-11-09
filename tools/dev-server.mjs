// Servidor estático mínimo apenas para desenvolvimento local (ES Modules exigem http(s), não
// funcionam abrindo o index.html via file://). Não é usado em produção: a publicação final é
// estática (GitHub Pages).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const port = Number(process.env.PORT) || 5173;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(url.split('?')[0]);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  return join(rootDir, safePath === '/' ? 'index.html' : safePath);
}

const server = createServer(async (request, response) => {
  try {
    let filePath = resolveRequestPath(request.url || '/');
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat?.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`LEDGER dev server rodando em http://localhost:${port}`);
});
