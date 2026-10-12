import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const localBin = process.platform === 'win32'
  ? join(root, '.venv', 'Scripts', 'genvm-lint.exe')
  : join(root, '.venv', 'bin', 'genvm-lint');
const command = existsSync(localBin) ? localBin : 'genvm-lint';
const env = {
  ...process.env,
  GENVM_VERSION: process.env.GENVM_VERSION || 'v0.3.0-rc7',
  PYTHONIOENCODING: 'utf-8',
};

// V2 is the only active deployable contract. The V1 pair remains in the
// repository solely for historical source review and is intentionally not
// part of the current lint/deploy gate.
for (const contract of ['contracts/ReceiptV2.py']) {
  const result = spawnSync(command, ['check', contract], { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
