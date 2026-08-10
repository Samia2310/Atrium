import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let stopping = false;

const processes = [
  ['api', ['--workspace', 'api', 'run', 'dev']],
  ['web', ['--workspace', 'web', 'run', 'dev']]
].map(([name, args]) => {
  const child = spawn(npm, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (signal) {
      process.stderr.write(`[${name}] stopped by ${signal}\n`);
    } else if (code !== 0) {
      process.stderr.write(`[${name}] exited with code ${code}\n`);
      stopAll(code ?? 1);
    }
  });

  return child;
});

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 100);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
