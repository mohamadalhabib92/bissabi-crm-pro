import { start } from './server';
import { log } from './log';

start().catch((error) => {
  log('error', 'arrêt du gateway', { error: error instanceof Error ? error.message : 'inconnu' });
  process.exit(1);
});
