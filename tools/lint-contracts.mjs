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

for (const contract of ['contracts/ProofEngine.py', 'contracts/PromiseVault.py']) {
  const result = spawnSync(command, ['check', contract], { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
