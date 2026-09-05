import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { LocalStore } from './store';
import { createApp } from './http';

const root=process.env.JUMPCHAIN_DATA_DIR ?? (process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? homedir(),'Jumpchain','ai') : join(homedir(),'.local','share','jumpchain','ai'));
const port=Number(process.env.JUMPCHAIN_AI_PORT ?? 4317);
const store=new LocalStore(resolve(root));
await store.init();
const {server,gm}=createApp(store,{port,staticDir:resolve('dist'),allowedOrigins:process.env.JUMPCHAIN_ALLOWED_ORIGINS?.split(',').filter(Boolean)});
server.on('error',async e => {console.error(e.message);await store.close();process.exitCode=1;});
server.listen(port,'127.0.0.1',() => {console.log(`Jumpchain AI: http://127.0.0.1:${port}\nCampaign data: ${store.root}\nCtrl+C stops the service. Sheet Only remains available without it.`);});
let stopping=false;
async function stop() {
  if (stopping) return;stopping=true;
  for (const controller of gm.running.values()) controller.abort();
  server.close(async () => {await store.close();process.exit(0);});
  setTimeout(() => server.closeAllConnections(),5000).unref();
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
