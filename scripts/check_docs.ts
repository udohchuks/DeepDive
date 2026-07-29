import fs from 'fs';
import path from 'path';

const REQUIRED_SECTIONS = [
  '## What it does',
  '## How it works',
  '## How to use it',
  '## Constraints & gotchas',
  '## Tests',
];

export function checkDocs(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const rootDir = process.cwd();
  const indexMdPath = path.join(rootDir, 'docs', 'index.md');

  if (!fs.existsSync(indexMdPath)) {
    errors.push('Missing root docs/index.md');
  }

  // Find all doc.md files across packages and apps
  function findDocFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
        findDocFiles(fullPath, fileList);
      } else if (stat.isFile() && entry === 'doc.md') {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const docFiles = findDocFiles(path.join(rootDir, 'packages')).concat(
    findDocFiles(path.join(rootDir, 'apps'))
  );

  for (const docFile of docFiles) {
    const relPath = path.relative(rootDir, docFile);
    const content = fs.readFileSync(docFile, 'utf-8');

    for (const section of REQUIRED_SECTIONS) {
      if (!content.includes(section)) {
        errors.push(`${relPath} missing required section: "${section}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check_docs.ts')) {
  const result = checkDocs();
  if (!result.valid) {
    console.error('Doc lint check failed:');
    result.errors.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  } else {
    console.log('Doc lint check passed successfully.');
  }
}
