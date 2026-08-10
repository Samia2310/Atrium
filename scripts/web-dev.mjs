import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const explicitPortIndex = process.argv.findIndex((arg) => arg === '-p' || arg === '--port');
const explicitPort = explicitPortIndex >= 0 ? process.argv[explicitPortIndex + 1] : undefined;
const preferredPort = Number(explicitPort || process.env.WEB_PORT || process.env.PORT || '3000');
const next = process.platform === 'win32' ? 'next.cmd' : 'next';

const port = await findOpenPort(preferredPort);
if (port !== preferredPort) {
  console.log(`Port ${preferredPort} is busy; starting web on ${port} instead.`);
}

const child = spawn(next, ['dev', '-p', String(port)], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

function isOpen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findOpenPort(start) {
  for (let port = start; port <= start + 10; port += 1) {
    if (await isOpen(port)) return port;
  }
  return start;
}
