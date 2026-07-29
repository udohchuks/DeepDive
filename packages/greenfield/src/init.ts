import fs from 'fs';
import path from 'path';

export interface GreenfieldConfig {
  mode: 'greenfield';
  projectId: string;
  projectName: string;
  createdAt: string;
}

export function initializeGreenfieldWorkspace(workspacePath: string, projectId: string, projectName: string): GreenfieldConfig {
  const dotDir = path.join(workspacePath, '.deepdive');
  if (!fs.existsSync(dotDir)) {
    fs.mkdirSync(dotDir, { recursive: true });
  }

  const config: GreenfieldConfig = {
    mode: 'greenfield',
    projectId,
    projectName,
    createdAt: new Date().toISOString(),
  };

  const configPath = path.join(dotDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  return config;
}
