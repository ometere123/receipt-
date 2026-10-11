import { describe, expect, it } from 'vitest';
import { bondFor, commitHash, genToWei, sha256Hex, statusLabel, validateDraft, validPath, validRepo, weiToGen, type CaseDraft } from './domain';
const sample: CaseDraft = { title:'The documented ceiling',owner:'acme',repo:'protocol',commit:'a'.repeat(40),doc_path:'docs/policy.md',source_path:'src/policy.py',claim:'The service never exceeds a 2% distribution fee.',duration_hours:72,bounty:'1.25' };
describe('money and evidence integrity', () => {
  it('converts exact wei without float rounding',()=>expect(genToWei('1.25')).toBe(1250000000000000000n));
  it('rejects malformed monetary values',()=>expect(()=>genToWei('1e18')).toThrow());
  it('rejects imprecise decimals',()=>expect(()=>genToWei('0.0000000000000000001')).toThrow());
  it('uses the exact five percent bond',()=>expect(bondFor((10n**18n).toString())).toBe(50000000000000000n));
  it('enforces minimum bond',()=>expect(bondFor('1000000000000000')).toBe(100000000000000n));
  it('formats GEN without scientific notation',()=>expect(weiToGen('1250000000000000000')).toBe('1.25'));
  it('rejects path traversal and encoded attacks',()=>{for(const p of ['../a','docs//b','docs/%2e%2e/b','https://evil.test','/etc/passwd'])expect(validPath(p)).toBe(false);});
  it('validates GitHub owner and repository names',()=>{expect(validRepo('acme','protocol')).toBe(true);expect(validRepo('-acme','repo')).toBe(false);});
  it('requires a full immutable Git commit',()=>expect(validateDraft({...sample,commit:'main'})).toMatch(/40-character/));
  it('rejects too-short claims',()=>expect(validateDraft({...sample,claim:'safe'})).toMatch(/25/));
  it('accepts bounded complete claim forms',()=>expect(validateDraft(sample)).toBe(null));
  it('computes standard SHA-256',async()=>expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
  it('binds commitments to case, wallet and salt',async()=>{
    const vault='0x'+'a'.repeat(40),wallet='0x'+'2'.repeat(40);
    const x=await commitHash(vault,1,wallet,'f'.repeat(64),'MAX_FEE_BPS = 500','A'.repeat(40));
    const y=await commitHash(vault,2,wallet,'f'.repeat(64),'MAX_FEE_BPS = 500','A'.repeat(40));
    expect(x).not.toBe(y);
    expect(x).toMatch(/^[a-f0-9]{64}$/);
  });
  it('exposes recovery and unconfirmed dispatch as distinct on-chain states',()=>{expect(statusLabel('RECOVERY_REQUESTED')).toBe('Recovery requested');expect(statusLabel('EMITTED_UNCONFIRMED')).toMatch(/receipt unconfirmed/);});
});
