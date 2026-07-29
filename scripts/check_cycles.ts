import fs from 'fs';
import path from 'path';

const PACKAGES_DIR = path.resolve(process.cwd(), 'packages');
const APPS_DIR = path.resolve(process.cwd(), 'apps');

interface PackageInfo {
  name: string;
  dirName: string;
  fullPath: string;
  deps: Set<string>;
}

function getPackageDirs(): string[] {
  const dirs: string[] = [];
  if (fs.existsSync(PACKAGES_DIR)) {
    for (const entry of fs.readdirSync(PACKAGES_DIR)) {
      const full = path.join(PACKAGES_DIR, entry);
      if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'package.json'))) {
        dirs.push(full);
      }
    }
  }
  if (fs.existsSync(APPS_DIR)) {
    for (const entry of fs.readdirSync(APPS_DIR)) {
      const full = path.join(APPS_DIR, entry);
      if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'package.json'))) {
        dirs.push(full);
      }
    }
  }
  return dirs;
}

function scanImports(dir: string, deps: Set<string>): void {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanImports(full, deps);
    } else if (stat.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      const content = fs.readFileSync(full, 'utf-8');
      const matches = content.matchAll(/from\s+['"](@deepdive\/[^'"]+)['"]/g);
      for (const match of matches) {
        deps.add(match[1]);
      }
    }
  }
}

export function checkDependencyCycles(): { hasCycles: boolean; cycleDetails: string[] } {
  const pkgDirs = getPackageDirs();
  const pkgMap = new Map<string, PackageInfo>();

  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const pkgName = pkgJson.name as string;
    const info: PackageInfo = {
      name: pkgName,
      dirName: path.basename(dir),
      fullPath: dir,
      deps: new Set<string>(),
    };

    // Include package.json dependencies
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    for (const depKey of Object.keys(allDeps)) {
      if (depKey.startsWith('@deepdive/')) {
        info.deps.add(depKey);
      }
    }

    // Include source code imports
    const srcDir = path.join(dir, 'src');
    if (fs.existsSync(srcDir)) {
      scanImports(srcDir, info.deps);
    }

    pkgMap.set(pkgName, info);
  }

  // Core requirement: core imports nothing internal
  const coreInfo = pkgMap.get('@deepdive/core');
  if (coreInfo && coreInfo.deps.size > 0) {
    return {
      hasCycles: true,
      cycleDetails: [`@deepdive/core violates rule: imports internal package(s): ${Array.from(coreInfo.deps).join(', ')}`],
    };
  }

  // Cycle detection via DFS
  const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
  const cycleDetails: string[] = [];

  for (const pkgName of pkgMap.keys()) {
    visited.set(pkgName, 'unvisited');
  }

  function dfs(curr: string, pathStack: string[]): boolean {
    visited.set(curr, 'visiting');
    pathStack.push(curr);

    const info = pkgMap.get(curr);
    if (info) {
      for (const dep of info.deps) {
        if (!pkgMap.has(dep)) continue; // external or unresolved
        const state = visited.get(dep);
        if (state === 'visiting') {
          const cyclePath = [...pathStack.slice(pathStack.indexOf(dep)), dep].join(' -> ');
          cycleDetails.push(`Dependency cycle detected: ${cyclePath}`);
          return true;
        }
        if (state === 'unvisited') {
          if (dfs(dep, pathStack)) return true;
        }
      }
    }

    pathStack.pop();
    visited.set(curr, 'visited');
    return false;
  }

  let hasCycles = false;
  for (const pkgName of pkgMap.keys()) {
    if (visited.get(pkgName) === 'unvisited') {
      if (dfs(pkgName, [])) {
        hasCycles = true;
      }
    }
  }

  return { hasCycles, cycleDetails };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check_cycles.ts')) {
  const result = checkDependencyCycles();
  if (result.hasCycles) {
    console.error('Cycle check failed:');
    result.cycleDetails.forEach((d) => console.error(`  ${d}`));
    process.exit(1);
  } else {
    console.log('Dependency cycle check passed successfully (zero cycles).');
  }
}
