import { fileURLToPath } from 'url';
import pathModule from 'path';

export function resolvePath(localPath: string, targetPath: string) {
  const __filename = fileURLToPath(localPath);
  const __dirname = pathModule.dirname(__filename);
  return pathModule.join(__dirname, targetPath);
}
