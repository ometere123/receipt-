'use client';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant, TransactionStatus } from 'genlayer-js/types';
import { CHAIN_ID, VAULT, ENGINE, isAddress, hasDeployment, type ReceiptCase, type ReceiptAttempt } from './domain';

export interface InjectedProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
}
declare global { interface Window { ethereum?: InjectedProvider } }
export function injected(): InjectedProvider | null { return typeof window === 'undefined' ? null : window.ethereum || null; }
export const publicClient = createClient({ chain: studionet });
export function assertDeployed() { if (!hasDeployment()) throw new Error('Deployment addresses are not configured. Set both NEXT_PUBLIC_*_ADDRESS values.'); }
export async function read(method: string, args: unknown[] = [], address: `0x${string}` = VAULT) {
  assertDeployed();
  return publicClient.readContract({ address, functionName: method, args: args as [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
}
function parseJSON<T>(response: unknown): T {
  if (typeof response === 'string') return JSON.parse(response) as T;
  if (typeof response === 'object' && response !== null) return response as T;
  throw new Error('Unexpected contract read response.');
}
export async function caseCounts() { return parseJSON<{ cases: number; attempts: number }>(await read('get_counts')); }
export async function vaultConfig() { return parseJSON<{ engine_ready?: boolean; funding_enabled?: boolean; withdrawal_status?: string }>(await read('get_config')); }
export async function casesPage(offset = 0, limit = 24) { return parseJSON<ReceiptCase[]>(await read('list_cases', [offset, limit])); }
export async function caseById(id: number) { const r = await read('get_case', [id]); return r ? parseJSON<ReceiptCase>(r) : null; }
export async function attemptById(id: number) { const r = await read('get_attempt', [id]); return r ? parseJSON<ReceiptAttempt>(r) : null; }
export async function creditOf(addr: string) { return BigInt(String(await read('get_credit', [addr]))); }
export async function engineVerdict(id: number) { return String(await read('get_verdict', [id], ENGINE)); }
export async function walletAddress(): Promise<string> {
  const p = injected(); if (!p) throw new Error('No injected EIP-1193 wallet found. Install or open a compatible wallet.');
  const accounts = await p.request({ method: 'eth_requestAccounts' });
  const list = Array.isArray(accounts) ? accounts : [];
  const address = String(list[0] || '');
  if (!isAddress(address)) throw new Error('Wallet did not provide a valid address.');
  await assertNetwork(p);
  return address;
}
export async function assertNetwork(p: InjectedProvider) {
  const chain = await p.request({ method: 'eth_chainId' });
  if (Number(chain) !== CHAIN_ID) throw new Error(`Wrong network (${String(chain)}). Switch your wallet to Studionet (61999).`);
}
export async function write(
  method: string, args: unknown[], sender: string,
  value: bigint = 0n,
  onStatus?: (status: string, hash?: string) => void,
  address: `0x${string}` = VAULT,
) {
  assertDeployed();
  const p = injected(); if (!p) throw new Error('Injected wallet unavailable.');
  await assertNetwork(p);
  if (!isAddress(sender)) throw new Error('Connect a valid wallet first.');
  const client = createClient({ chain: studionet, account: sender as `0x${string}`, provider: p });
  await client.connect('studionet');
  await assertNetwork(p);
  const call = { address, functionName: method, args: args as [], value };
  onStatus?.('Awaiting wallet signature…');
  // Never blindly retry once writeContract returns a tx hash.
  const hash = await client.writeContract(call);
  onStatus?.('Submitted · awaiting FINALIZED and GenVM success', hash);
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED });
  if (String(receipt.statusName).toUpperCase() !== 'FINALIZED' || String(receipt.txExecutionResultName) !== 'FINISHED_WITH_RETURN') {
    throw new Error(`No verified GenVM success: ${receipt.statusName} / ${receipt.txExecutionResultName}. Inspect ${hash}; do NOT resubmit blindly.`);
  }
  onStatus?.('Finalized with successful execution', hash);
  return hash;
}
export async function attemptsPage(offset = 0, limit = 24) { return parseJSON<ReceiptAttempt[]>(await read('list_attempts', [offset, limit])); }
