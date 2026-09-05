import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const dev=process.argv.includes('--dev');
const children=[];
function run(args) {
  const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit'});children.push(child);
  child.on('exit',code => {if (code && !stopping) {process.exitCode=code;stop();}});return child;
}
let stopping=false;
function stop() {if (stopping) return;stopping=true;for (const child of children) child.kill('SIGTERM');}
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',stop);
run(dev ? ['--import','tsx','server/main.ts'] : ['server-dist/main.mjs']);
if (dev) run([resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173','--strictPort']);
