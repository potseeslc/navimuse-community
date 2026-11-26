import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.env.NAVIMUSE_AUDIO_FIXTURE_DIRECTORY || '.scratch/m8-playback-fixtures');
const port = Math.max(1024, Math.min(65535, Number(process.env.NAVIMUSE_AUDIO_FIXTURE_PORT) || 8791));
const mime = Object.freeze({ '.aac': 'audio/aac', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.opus': 'audio/ogg', '.wav': 'audio/wav' });

const server = createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url || '/', `http://127.0.0.1:${port}`).pathname).replace(/^\/+/, '');
  const path = resolve(root, requested);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (!path.startsWith(`${root}${sep}`) || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.setHeader('Content-Type', mime[extname(path).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Content-Length', statSync(path).size);
  response.writeHead(200);
  createReadStream(path).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`M8 audio fixtures: http://127.0.0.1:${port} (${root})`);
});
