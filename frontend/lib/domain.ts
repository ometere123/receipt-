export type CaseStatus = 'OPEN' | 'PENDING' | 'WON' | 'EXPIRED';
export type AttemptStatus = 'COMMITTED' | 'PENDING' | 'RECOVERY_REQUESTED' | 'SETTLED' | 'FORFEITED' | 'RECOVERED';
export type Verdict = 'CONTRADICTED' | 'NOT_ESTABLISHED' | 'OUT_OF_SCOPE' | 'INCONCLUSIVE';

export interface ReceiptCase {
  id: number; title: string; owner: string; repo: string; commit: string;
  doc_path: string; source_path: string; claim: string;
  doc_digest: string; source_digest: string; sponsor: string;
  bounty: string; created_at: number; deadline: number;
  status: CaseStatus; active_attempt: number; winner: string;
  won_attempt: number; attempts: number;
}
export interface ReceiptAttempt {
  id: number; case_id: number; claimant: string; commitment: string;
  bond: string; status: AttemptStatus; committed_at: number; reveal_by: number;
  revealed_at: number; verdict: Verdict | ''; reason: string;
  evidence_digest: string; anchor: string; thesis: string;
}
export interface CaseDraft {
  title: string; owner: string; repo: string; commit: string;
  doc_path: string; source_path: string; claim: string;
  duration_hours: number; bounty: string;
}
export interface RevealDraft {
  case_id: number; address: string; salt: string; anchor: string; thesis: string;
  commitment: string; created_at: number;
}
export const CHAIN_ID = 61999;
export const VAULT = (process.env.NEXT_PUBLIC_PROMISE_VAULT_ADDRESS || '').trim() as `0x${string}`;
export const ENGINE = (process.env.NEXT_PUBLIC_PROOF_ENGINE_ADDRESS || '').trim() as `0x${string}`;
export const EXPLORER = (process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://explorer-studio.genlayer.com').replace(/\/$/, '');
// Funding is opt-in even when addresses are configured. The replacement
// vault also reports this gate on-chain; both must explicitly allow funding.
export const FUNDING_ENABLED = process.env.NEXT_PUBLIC_FUNDING_ENABLED === 'true';
export const isAddress = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(s);
export const hasDeployment = () => isAddress(VAULT) && isAddress(ENGINE);
export const addrShort = (s: string) => s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '—';
export const weiToGen = (wei: string | bigint | number) => {
  const v = BigInt(wei || '0');
  const whole = v / (10n ** 18n); const tail = (v % (10n ** 18n)).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
  return `${whole}${tail ? `.${tail}` : ''}`;
};
export function genToWei(raw: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(raw.trim())) throw new Error('Enter a valid positive GEN amount (up to 18 decimals).');
  const [a, b = ''] = raw.trim().split('.');
  return BigInt(a) * 10n ** 18n + BigInt(b.padEnd(18, '0'));
}
export const bondFor = (wei: string) => {
  const v = BigInt(wei); return v / 20n > 10n ** 14n ? v / 20n : 10n ** 14n;
};
export const relativeDate = (stamp: number) => new Date(stamp * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const validPath = (p: string) => p.length >= 1 && p.length <= 140 && /^[a-zA-Z0-9._/+\-]+$/.test(p) && p.split('/').every(x => x !== '..' && x !== '.' && x !== '');
export const validRepo = (o: string, r: string) => /^[a-zA-Z0-9-]{1,39}$/.test(o) && !o.startsWith('-') && !o.endsWith('-') && /^[a-zA-Z0-9_.-]{1,90}$/.test(r) && r !== '.' && r !== '..';
export function validateDraft(d: CaseDraft): string | null {
  if (d.title.trim().length < 8 || d.title.length > 88) return 'Title must be 8–88 characters.';
  if (!validRepo(d.owner, d.repo)) return 'Enter a valid public GitHub repository owner and name.';
  if (!/^[0-9a-f]{40}$/.test(d.commit)) return 'Use the full 40-character lowercase commit SHA, not a branch or tag.';
  if (!validPath(d.doc_path) || !validPath(d.source_path)) return 'Enter relative documentation and source paths without traversal.';
  if (d.claim.length < 25 || d.claim.length > 480) return 'Exact published claim must be 25–480 characters.';
  if (!Number.isInteger(d.duration_hours) || d.duration_hours < 6 || d.duration_hours > 720) return 'Challenge duration must be 6–720 hours.';
  try { const amount = genToWei(d.bounty); if (amount < 10n ** 15n || amount > 10n ** 24n) return 'Bounty must be between 0.001 and 1,000,000 GEN.'; }
  catch (e) { return (e as Error).message; }
  return null;
}
export function rawUrl(d: { owner: string; repo: string; commit: string }, path: string) {
  if (!validRepo(d.owner, d.repo) || !/^[0-9a-f]{40}$/.test(d.commit) || !validPath(path)) throw new Error('Invalid immutable GitHub file locator.');
  return `https://raw.githubusercontent.com/${d.owner}/${d.repo}/${d.commit}/${path}`;
}
export function utf8Bytes(value: string) { return new TextEncoder().encode(value); }
export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? utf8Bytes(value) : value;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function commitHash(vault: string, caseId: number, address: string, salt: string, anchor: string, thesis: string) {
  const canonical = JSON.stringify([String(CHAIN_ID), vault.toLowerCase(), String(caseId), address.toLowerCase(), salt, anchor, thesis]);
  return sha256Hex(canonical);
}
export const EVIDENCE_MAX = { doc: 18000, source: 20000 };
export async function loadEvidence(d: CaseDraft | ReceiptCase) {
  const [docRes, srcRes] = await Promise.all([fetch(rawUrl(d, d.doc_path), { cache: 'no-store' }), fetch(rawUrl(d, d.source_path), { cache: 'no-store' })]);
  if (!docRes.ok || !srcRes.ok) throw new Error(`Pinned file could not be fetched (HTTP ${docRes.status} / ${srcRes.status}).`);
  const [db, sb] = await Promise.all([docRes.arrayBuffer(), srcRes.arrayBuffer()]);
  if (db.byteLength > EVIDENCE_MAX.doc || sb.byteLength > EVIDENCE_MAX.source) throw new Error('Files exceed GenVM adjudication budget (18KB docs / 20KB source).');
  const doc = new TextDecoder('utf-8', { fatal: true }).decode(db);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(sb);
  return { doc, source, doc_digest: await sha256Hex(new Uint8Array(db)), source_digest: await sha256Hex(new Uint8Array(sb)) };
}
export const statusLabel = (s: string) => ({ OPEN: 'Open case', PENDING: 'Under review', WON: 'Receipt found', EXPIRED: 'Expired', COMMITTED: 'Reveal needed', RECOVERY_REQUESTED: 'Recovery requested', SETTLED: 'Settled', FORFEITED: 'Bond forfeited', RECOVERED: 'Bond recovered' }[s] || s);
