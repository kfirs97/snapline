import { runTests } from '@vscode/test-electron';
import { mkdtempSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

(async () => {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'snapline-e2e-')));
  writeFileSync(join(ws, 'a.ts'), 'function greet(name: string) {\n  return `hi ${name}`;\n}\n');
  await runTests({
    extensionDevelopmentPath: resolve(__dirname, '../..'),
    extensionTestsPath: resolve(__dirname, 'suite.js'),
    launchArgs: [ws, join(ws, 'a.ts'), '--disable-extensions', '--skip-welcome', '--skip-release-notes'],
  });
})().catch(err => {
  console.error(err);
  process.exit(1);
});
