import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { defaultPreferences, validatePreferences } from '../shared/model.mjs';

const location = join(process.env.LOCALAPPDATA || homedir(), 'TicketAssistant', 'settings.json');
let queue = Promise.resolve();

export async function loadPreferences(path = location) {
  try { return validatePreferences(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return defaultPreferences();
    throw new Error('저장된 설정을 읽지 못했습니다. 기존 파일을 덮어쓰지 않았습니다. ' + error.message);
  }
}

export function savePreferences(input, path = location) {
  const operation = queue.catch(() => {}).then(async () => {
    const settings = validatePreferences(input);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path + '.tmp', JSON.stringify(settings, null, 2), 'utf8');
    await rename(path + '.tmp', path);
    return settings;
  });
  queue = operation;
  return operation;
}
