'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, Check,
  CheckCircle2, CircleAlert, Clock3, Code2, Copy, Download,
  ExternalLink, FileSearch2, Fingerprint, FolderSearch,
  Gift, Github, History, KeyRound, LockKeyhole, PartyPopper,
  Plus, RefreshCcw, ScanEye, Search, ShieldCheck, Sparkles, Ticket, UnlockKeyhole,
  Wallet, X, ZoomIn
} from 'lucide-react';
import {
  addrShort, bondFor, CaseDraft, CHAIN_ID, commitHash, EXPLORER,
  FUNDING_ENABLED,
  genToWei, hasDeployment, hasHistoricalDeployment, HISTORICAL_ENGINE,
  HISTORICAL_VAULT, loadEvidence, ReceiptAttempt, ReceiptCase,
  relativeDate, statusLabel, validateDraft, VAULT, weiToGen,
} from '@/lib/domain';
import {
  attemptById, attemptsPage, caseById, caseCounts, casesPage, creditOf, dispatchById, historicalConfig,
  historicalCounts, historicalCreditOf, historicalTreasuryStatus, injected, treasuryStatus, vaultConfig, walletAddress, write,
} from '@/lib/chain';
import type { DispatchRecord, TreasuryStatus } from '@/lib/chain';
import { dropReveal, getReveals, saveReveal } from '@/lib/local';

type Tab = 'explore' | 'create' | 'desk' | 'wall' | 'history' | 'about';
interface TxEntry { id: string; label: string; state: string; hash?: string; at: number; }
const EMPTY_DRAFT: CaseDraft = { title: '', owner: '', repo: '', commit: '', doc_path: '', source_path: '', claim: '', duration_hours: 72, bounty: '1' };
const fmt = (n: string | number) => weiToGen(n);
const toExplorer = (hash: string) => `${EXPLORER}/tx/${hash}`;
const toSource = (c: ReceiptCase, p: string) => `https://github.com/${c.owner}/${c.repo}/blob/${c.commit}/${p}`;
function Stamp({ status }: { status: string }) {
  return <span className={`stamp stamp-${status.toLowerCase().replaceAll('_', '-')}`}><span className="stamp-dot" />{statusLabel(status)}</span>;
}
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    function esc(ev: KeyboardEvent) { if (ev.key === 'Escape') onClose(); }
    document.addEventListener('keydown', esc); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation"><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><span className="eyebrow">RECEIPT! CASE FILE</span><h2>{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></div>{children}</div></div>;
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Snippet({ code, highlight, maxLines = 32 }: { code: string; highlight?: string; maxLines?: number }) {
  const lines = code.split('\n').slice(0, maxLines);
  return <div className="snippet" aria-label="Pinned source text">{lines.map((line, idx) => {
    const active = Boolean(highlight && line.includes(highlight));
    return <div className={`code-line ${active ? 'highlight' : ''}`} key={idx}><span className="line-no">{idx + 1}</span><code>{line || ' '}</code></div>;
  })}{code.split('\n').length > maxLines && <div className="code-truncated">+ More lines in the source link above</div>}</div>;
}
function CaseCard({ c, onSelect, now, large = false }: { c: ReceiptCase; onSelect: () => void; now: number; large?: boolean }) {
  const isEnded = c.deadline * 1000 < now && c.status === 'OPEN';
  return <button type="button" className={`case-card ${large ? 'case-card-big' : ''}`} onClick={onSelect}>
    <div className="case-top"><div className="case-icon"><FileSearch2 size={27} strokeWidth={1.9}/></div><ArrowUpRight size={21}/></div>
    <span className="case-kind">{c.owner}/{c.repo}</span><h3>{c.title}</h3>
    <p className="case-excerpt">{c.claim}</p>
    <div className="case-bottom"><div><small>THE BOUNTY</small><strong>{fmt(c.bounty)} <em>GEN</em></strong></div><Stamp status={isEnded ? 'EXPIRED' : c.status}/></div>
  </button>;
}
function WalletBadge({ account, connect, disconnect, pending }: { account: string; connect: () => void; disconnect: () => void; pending: boolean }) {
  return account ? <div className="wallet-group"><span className="wallet-connected"><span className="green-dot" />{addrShort(account)}</span><button className="disconnect" onClick={disconnect} title="Disconnect locally">Disconnect</button></div>
    : <button className="btn btn-dark btn-small" disabled={pending} onClick={connect}><Wallet size={16}/>Connect wallet</button>;
}
export default function ReceiptApp() {
  const [tab, setTab] = useState<Tab>('explore');
  const [cases, setCases] = useState<ReceiptCase[]>([]);
  const [attempts, setAttempts] = useState<ReceiptAttempt[]>([]);
  const [count, setCount] = useState({ cases: 0, attempts: 0 });
  const [account, setAccount] = useState('');
  const [chain, setChain] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<ReceiptCase | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [txs, setTxs] = useState<TxEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    try {
      const existing = JSON.parse(localStorage.getItem('receipt-tx-trail-v1') || '[]');
      if (Array.isArray(existing)) {
        // Local storage is an external hydration source; this update is intentional.
        setTxs(existing.slice(0, 16));
      }
    } catch { /* storage may be blocked or unavailable */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('receipt-tx-trail-v1', JSON.stringify(txs)); }
    catch { /* noncritical device storage */ }
  }, [txs]);
  const [credit, setCredit] = useState<bigint>(0n);
  const [treasury, setTreasury] = useState<TreasuryStatus | null>(null);
  const [fundingEnabled, setFundingEnabled] = useState(false);
  const refreshSeq = useRef(0);
  const networkReady = chain === CHAIN_ID;
  const loadAll = useCallback(async () => {
    if (!hasDeployment()) { setFundingEnabled(false); setTreasury(null); return; }
    const seq = ++refreshSeq.current;
    setLoading(true);
    try {
      const [config, totals, treasuryState] = await Promise.all([vaultConfig(), caseCounts(), treasuryStatus()]);
      const caseChunks = await Promise.all(Array.from({length: Math.min(8, Math.ceil(totals.cases / 24))}, (_, i) => casesPage(Math.max(0, totals.cases - (i+1) * 24), Math.min(24, totals.cases - Math.max(0, totals.cases - (i+1) * 24)) )));
      const attemptChunks = await Promise.all(Array.from({length: Math.min(8, Math.ceil(totals.attempts / 24))}, (_, i) => attemptsPage(Math.max(0, totals.attempts - (i+1) * 24), Math.min(24, totals.attempts - Math.max(0, totals.attempts - (i+1) * 24)) )));
      if (seq !== refreshSeq.current) return;
      setCases(caseChunks.flat().sort((a,b) => b.id - a.id));
      setAttempts(attemptChunks.flat().sort((a,b) => b.id - a.id));
      setCount(totals);
      setTreasury(treasuryState);
      setFundingEnabled(FUNDING_ENABLED && config.funding_enabled === true);
      if (account) setCredit(await creditOf(account));
      setError('');
    } catch (e) { if (seq === refreshSeq.current) setError((e as Error).message); }
    finally { if (seq === refreshSeq.current) setLoading(false); }
  }, [account]);
  const loadOlder = useCallback(async () => {
    if (!hasDeployment() || loading) return;
    const seq = ++refreshSeq.current;
    setLoading(true);
    try {
      const oldestCase = cases.length ? Math.min(...cases.map(c => c.id)) : count.cases + 1;
      const oldestAttempt = attempts.length ? Math.min(...attempts.map(a => a.id)) : count.attempts + 1;
      const caseLimit = Math.min(24, Math.max(0, oldestCase - 1));
      const attemptLimit = Math.min(24, Math.max(0, oldestAttempt - 1));
      const [olderCases, olderAttempts] = await Promise.all([
        caseLimit ? casesPage(oldestCase - caseLimit - 1, caseLimit) : Promise.resolve([] as ReceiptCase[]),
        attemptLimit ? attemptsPage(oldestAttempt - attemptLimit - 1, attemptLimit) : Promise.resolve([] as ReceiptAttempt[]),
      ]);
      if (seq !== refreshSeq.current) return;
      setCases(old => [...old, ...olderCases.filter(c => !old.some(existing => existing.id === c.id))].sort((a, b) => b.id - a.id));
      setAttempts(old => [...old, ...olderAttempts.filter(a => !old.some(existing => existing.id === a.id))].sort((a, b) => b.id - a.id));
    } catch (e) { if (seq === refreshSeq.current) setError((e as Error).message); }
    finally { if (seq === refreshSeq.current) setLoading(false); }
  }, [attempts, cases, count.attempts, count.cases, loading]);
  useEffect(() => { void loadAll(); const timer = setInterval(() => { void loadAll(); }, 30000); return () => clearInterval(timer); }, [loadAll]);
  useEffect(() => {
    const p = injected(); if (!p) return;
    let cancelled = false;
    const accountsChanged = (...args: unknown[]) => { const a = Array.isArray(args[0]) ? String((args[0] as string[])[0] || '') : ''; if (!cancelled) setAccount(a); };
    const chainChanged = (...args: unknown[]) => { if (!cancelled) setChain(Number(args[0])); };
    p.request({ method: 'eth_accounts' }).then(a => { if (!cancelled && Array.isArray(a)) setAccount(String(a[0] || '')); }).catch(() => {});
    p.request({ method: 'eth_chainId' }).then(c => { if (!cancelled) setChain(Number(c)); }).catch(() => {});
    p.on?.('accountsChanged', accountsChanged); p.on?.('chainChanged', chainChanged);
    return () => { cancelled = true; p.removeListener?.('accountsChanged', accountsChanged); p.removeListener?.('chainChanged', chainChanged); };
  }, []);
  useEffect(() => { if (account && hasDeployment()) void creditOf(account).then(setCredit).catch(() => setCredit(0n)); else setCredit(0n); }, [account]);
  const connect = async () => {
    setWalletBusy(true); setError('');
    try { const a = await walletAddress(); setAccount(a); setChain(CHAIN_ID); }
    catch (e) { setError((e as Error).message); const p = injected(); if (p) p.request({method: 'eth_chainId'}).then(id => setChain(Number(id))).catch(()=>{}); }
    finally { setWalletBusy(false); }
  };
  const disconnect = () => { setAccount(''); setCredit(0n); /* No wallet permission revocation is implied. */ };
  const switchNetwork = async () => {
    const p = injected(); if (!p) { setError('No injected wallet found.'); return; }
    try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xf22f' }] }); setChain(CHAIN_ID); }
    catch { setError('Add or switch to Studionet 61999 in your wallet, then retry.'); }
  };
  const runTx = async (label: string, fn: (update: (state: string, hash?: string) => void) => Promise<string>) => {
    setError(''); setDrawerOpen(true);
    const id = `${Date.now()}-${Math.random()}`;
    const update = (state: string, hash?: string) => setTxs(old => [{ id, label, state, hash: hash || old.find(x => x.id === id)?.hash, at: Date.now() }, ...old.filter(x => x.id !== id)].slice(0, 16));
    update('Preparing…');
    try { const h = await fn(update); update('Finalized, execution verified', h); await loadAll(); return h; }
    catch (e) { update(`Needs attention: ${(e as Error).message}`); setError((e as Error).message); throw e; }
  };
  const visible = useMemo(() => cases.filter(c => (statusFilter === 'ALL' || c.status === statusFilter) &&
    `${c.title} ${c.owner} ${c.repo} ${c.claim}`.toLowerCase().includes(query.toLowerCase())), [cases, query, statusFilter]);
  const won = cases.filter(c => c.status === 'WON');
  useEffect(() => {
    const caseId = new URLSearchParams(window.location.search).get('case');
    if (!caseId || !/^\d{1,10}$/.test(caseId) || selected) return;
    const found = cases.find(c => c.id === Number(caseId));
    if (found) { setSelected(found); return; }
    if (hasDeployment()) void caseById(Number(caseId)).then(c => { if (c) setSelected(c); }).catch(() => {});
  }, [cases, selected]);
  const closeDetail = useCallback(() => {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('case');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);
  const nav: { id: Tab; label: string }[] = [{id:'explore',label:'Explore cases'},{id:'create',label:fundingEnabled ? 'Fund a claim' : 'Review configuration'},{id:'desk',label:'My desk'},{id:'wall',label:'Receipt wall'},{id:'history',label:'V1 history'},{id:'about',label:'How it works'}];
  return <>
    <div className="site-shell">
      <div className="marquee"><span><Sparkles size={14}/> CODE TALKS. RECEIPTS PROVE. <span className="ticker-star">✳</span> NO MYSTERY VERDICTS. <span className="ticker-star">✳</span> INDEPENDENT GENLAYER CONSENSUS. <Sparkles size={14}/></span></div>
      <header className="header container"><button className="wordmark" onClick={() => setTab('explore')} aria-label="Receipt home"><span className="mark"><Ticket size={26} strokeWidth={2.6}/></span>receipt<span className="exclaim">!</span></button>
        <nav className="desktop-nav" aria-label="Main navigation">{nav.map(item=><button className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
        <div className="header-actions"><button className="icon-btn tx-button" onClick={() => setDrawerOpen(v=>!v)} title="Transactions"><History size={21}/>{txs.length > 0 && <span className="count-bubble">{txs.length}</span>}</button><WalletBadge account={account} connect={connect} disconnect={disconnect} pending={walletBusy}/></div>
      </header>
      <nav className="mobile-nav container" aria-label="Mobile navigation">{nav.map(item=><button className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <main className="container main">
        {!hasDeployment() && <div className="notice notice-warn"><CircleAlert size={19}/><span><strong>V2 deployment not configured.</strong> This is the real application, not a simulated chain. Supply the finalized single-contract address in <code>NEXT_PUBLIC_RECEIPT_V2_ADDRESS</code>.</span></div>}
        {account && !networkReady && <div className="notice notice-warn"><CircleAlert size={19}/><span>Wallet connected to chain {chain ?? 'unknown'}. Writes are blocked until Studionet 61999 is selected.</span><button onClick={switchNetwork} className="btn btn-ink btn-small">Switch network</button></div>}
        {hasDeployment() && !fundingEnabled && <div className="notice notice-warn"><CircleAlert size={19}/><span><strong>V2 funding is unavailable.</strong> The frontend configuration does not currently agree with the funded ReceiptV2 deployment, so value-bearing writes are blocked.</span></div>}
        {error && <div role="alert" className="notice notice-error"><CircleAlert size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={17}/></button></div>}
        {tab === 'explore' && <>
          <section className="hero">
            <div className="hero-copy"><div className="hero-kicker"><span className="pulse-disc"/><span>THE OPEN-SOURCE PROOF CLUB</span><Sparkles size={15}/></div><h1>Big promises.<br/><span>Real proof.</span><br/>No excuses<span className="punct">.</span></h1><p>{fundingEnabled ? 'Software projects make claims. We put those claims under a magnifying glass—and put real GEN behind the truth.' : 'The live contract is configured, but this frontend is not yet enabled for value-bearing writes.'}</p><div className="hero-buttons"><button className="btn btn-ink" onClick={()=>document.querySelector('#browse-cases')?.scrollIntoView({behavior:'smooth'})}><Search size={18}/> Find a case <ArrowUpRight size={18}/></button><button className="btn btn-outline" onClick={()=>setTab('create')}>{fundingEnabled ? 'Fund a promise' : 'Review configuration'} <ArrowRight size={18}/></button></div><div className="hero-notes"><span><BadgeCheck size={17}/> Exact commits</span><span><ShieldCheck size={17}/> Independent verdicts</span><span><Wallet size={17}/> {fundingEnabled ? 'GEN rewards' : 'Read-only until configured'}</span></div></div>
            <div className="hero-art" aria-label="Illustrated receipt and investigator"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="sparkle-shape spark-a">✳</div><div className="sparkle-shape spark-b">✦</div><div className="art-receipt"><div className="receipt-top">RECEIPT! <span>№ 001</span></div><div className="receipt-logo">CASE <span>FILE</span></div><div className="receipt-lines"><i/><i/><i/></div><div className="receipt-highlight"><Check size={19}/> SOURCE VERIFIED</div><div className="receipt-bottom">PROMISE ≠ PROOF</div></div><div className="art-glass"><Search size={100} strokeWidth={2.8}/></div><span className="art-sticker sticker-one">100%<br/>CURIOUS</span><span className="art-sticker sticker-two">✴ PROOF<br/>PLEASE!</span><div className="art-shadow"/></div>
          </section>
          <section className="steps-strip" aria-label="Three simple steps"><div><span className="step-num">01</span><strong>{fundingEnabled ? 'Find the claim' : 'Read the claim'}</strong><small>{fundingEnabled ? 'Pick an open case' : 'Inspect a finalized case'}</small></div><div className="steps-arrow"><ArrowRight/></div><div><span className="step-num">02</span><strong>{fundingEnabled ? 'Bring the code' : 'Trace the code'}</strong><small>{fundingEnabled ? 'Pin down the contradiction' : 'Review the frozen evidence'}</small></div><div className="steps-arrow"><ArrowRight/></div><div><span className="step-num">03</span><strong>{fundingEnabled ? 'Get the receipt' : 'Read the verdict'}</strong><small>{fundingEnabled ? 'Validators decide, you collect' : 'Read the configured deployment state'}</small></div></section>
          <section id="browse-cases" className="cases-section"><div className="section-head"><div><span className="eyebrow">PICK YOUR NEXT INVESTIGATION</span><h2>Cases worth <span className="scribble">cracking.</span></h2><p>Each case is directly sourced from the finalized on-chain registry.</p></div><div className="case-count"><span>{count.cases}</span><small>funded cases</small></div></div>
            <div className="toolbar"><div className="search-box"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search claims, repositories…" aria-label="Search cases"/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="PENDING">Reviewing</option><option value="WON">Verified</option><option value="EXPIRED">Expired</option></select><button className="square-btn" onClick={()=>void loadAll()} title="Refresh finalized state" disabled={loading}><RefreshCcw size={19} className={loading?'spin':''}/></button></div>
            {loading && cases.length === 0 ? <div className="empty-state"><RefreshCcw className="spin" size={31}/><h3>Loading finalized cases…</h3></div> : visible.length ? <div className="case-grid">{visible.map((c,i)=><div key={c.id} className={`case-hue hue-${i%4}`}><CaseCard c={c} now={now} onSelect={()=>setSelected(c)}/></div>)}</div> : <div className="empty-state"><FolderSearch size={50}/><h3>No cases on the board yet.</h3><p>{query || statusFilter !== 'ALL' ? 'Try another search or filter.' : 'The first funded, verified case will appear here. No demo data pretending to be real.'}</p><button className="btn btn-ink" onClick={()=>setTab('create')}><Plus size={17}/> {fundingEnabled ? 'Fund the first claim' : 'Review funding gate'}</button></div>}
            {count.cases > 192 && <p className="footnote">Showing the 192 newest cases. Older cases remain available through direct contract pagination.</p>}
          </section>
          <section className="bottom-banner"><div><span className="eyebrow">HAVE A PROMISE WORTH TESTING?</span><h2>{fundingEnabled ? 'Put your GEN where your docs are.' : 'Check the live configuration.'}</h2><p>{fundingEnabled ? 'Anyone can sponsor a challenge. The source and reward get locked before the investigation begins.' : 'The contract stays readable while the frontend and on-chain funding flags are reconciled.'}</p></div><button className="btn btn-dark" onClick={()=>setTab('create')}>{fundingEnabled ? 'Start a case' : 'Review configuration'} <ArrowUpRight size={18}/></button><span className="banner-star">✱</span></section>
        </>}
        {tab === 'create' && <CreateView account={account} canWrite={hasDeployment() && networkReady} fundingEnabled={fundingEnabled} connect={connect} runTx={runTx} refresh={loadAll} openExplore={()=>setTab('explore')}/>}
        {tab === 'desk' && <DeskView account={account} attempts={attempts} cases={cases} credit={credit} treasury={treasury} canWrite={hasDeployment() && networkReady} runTx={runTx} connect={connect} loadOlder={loadOlder} hasOlder={cases.length < count.cases || attempts.length < count.attempts} select={setSelected}/>}
        {tab === 'wall' && <section className="content-section"><div className="section-head"><div><span className="eyebrow">PUBLICLY VERIFIABLE OUTCOMES</span><h2>The receipt <span className="scribble">wall.</span></h2><p>No popularity scores or unverified badges. Only genuine settlement results.</p></div><div className="floating-icon"><BadgeCheck size={33}/></div></div>{won.length ? <div className="case-grid">{won.map((c,i)=><div className={`case-hue hue-${i%4}`} key={c.id}><CaseCard c={c} now={now} onSelect={()=>setSelected(c)}/></div>)}</div> : <div className="empty-state"><BadgeCheck size={50}/><h3>Waiting for the first verified receipt.</h3><p>The wall fills only after a challenge is finalized as CONTRADICTED.</p></div>}</section>}
        {tab === 'history' && <HistoricalView account={account} connect={connect}/>}
        {tab === 'about' && <AboutView fundingEnabled={fundingEnabled} openCreate={()=>setTab('create')} />}
      </main>
      <footer className="footer"><div className="container footer-inside"><div className="footer-logo">receipt<span>!</span><small>BIG PROMISES. REAL PROOF.</small></div><p>A claim-specific, source-grounded GenLayer experiment. No security certification implied.</p><div className="footer-links"><a href="https://docs.genlayer.com" target="_blank" rel="noreferrer">GenLayer docs <ArrowUpRight size={14}/></a><span>Studionet · 61999</span></div></div></footer>
    </div>
    {selected && <CaseDetail key={selected.id} c={selected} now={now} account={account} canWrite={hasDeployment() && networkReady} fundingEnabled={fundingEnabled} connect={connect} runTx={runTx} refresh={loadAll} onClose={closeDetail} />}
    {drawerOpen && <aside className="tx-drawer" aria-label="Transaction activity"><div className="drawer-head"><h3>Transaction trail</h3><button className="icon-btn" onClick={()=>setDrawerOpen(false)} aria-label="Close transaction trail"><X size={18}/></button></div><p>Finalized means consensus is finished; child messages may still be processing. Read the case again for settlement.</p>{!txs.length ? <div className="drawer-empty">Your real contract interactions show up here.</div> : txs.map(t=><div className="tx-item" key={t.id}><strong>{t.label}</strong><small>{t.state}</small>{t.hash && <a href={toExplorer(t.hash)} target="_blank" rel="noreferrer">{addrShort(t.hash)} <ExternalLink size={13}/></a>}</div>)}<button className="btn btn-outline full" onClick={()=>void loadAll()}><RefreshCcw size={16}/> Re-read finalized contract state</button></aside>}
  </>;
}

function CreateView({account,canWrite,fundingEnabled,connect,runTx,refresh,openExplore}: {account:string;canWrite:boolean;fundingEnabled:boolean;connect:()=>void;runTx:(label:string,fn:(u:(s:string,h?:string)=>void)=>Promise<string>)=>Promise<string>;refresh:()=>Promise<void>;openExplore:()=>void}) {
  const [draft, setDraft] = useState<CaseDraft>(EMPTY_DRAFT);
  const [verified, setVerified] = useState<{ doc_digest:string;source_digest:string; doc:string; source:string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(1);
  const invalid = validateDraft(draft);
  const set = (k:keyof CaseDraft, v:string|number) => { setDraft(d=>({...d,[k]:v})); setVerified(null); };
  const verify = async () => {
    setError(''); const err = validateDraft(draft); if (err) return setError(err);
    setChecking(true);
    try { const e = await loadEvidence(draft); if (!e.doc.includes(draft.claim)) throw new Error('Claim must appear verbatim in the pinned documentation.'); setVerified(e); setPhase(3); }
    catch(e){setError((e as Error).message);} finally{setChecking(false);}
  };
  const publish = async () => {
    if (!fundingEnabled) { setError('Funding is unavailable until the frontend configuration matches the funded ReceiptV2 deployment.'); return; }
    if (!verified || !canWrite || !account) return;
    setBusy(true); setError('');
    try { await runTx('Fund documentation promise', u => write('create_case', [draft.title,draft.owner,draft.repo,draft.commit,draft.doc_path,draft.source_path,draft.claim,verified.doc_digest,verified.source_digest,draft.duration_hours],account,genToWei(draft.bounty),u));
      await refresh(); setDraft(EMPTY_DRAFT); setVerified(null); setPhase(1); openExplore();
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="content-section create-layout"><div className="create-intro"><span className="eyebrow">THE PROMISE WORKSHOP</span><h1>{fundingEnabled ? <>Put a promise<br/><span className="scribble">on the record.</span></> : <>Inspect a promise<br/><span className="scribble">until configured.</span></>}</h1><p>{fundingEnabled ? 'Lock the exact documentation claim, its source files and the GEN bounty. Independent challengers will bring receipts.' : 'Inspect the exact documentation claim and source evidence. Value-bearing writes are unavailable until the frontend configuration matches the funded ReceiptV2 deployment.'}</p><div className="guide-card"><div className="guide-icon"><Fingerprint size={30}/></div><h3>Immutable means immutable.</h3><p>No branches, moving tags or pasted snippets. Every claim is pinned to the exact 40-character Git commit and SHA-256 fingerprints for both files.</p></div></div>
    <div className="form-card"><div className="form-steps"><span className={phase>=1?'current':''}>1. The claim</span><ArrowRight size={16}/><span className={phase>=2?'current':''}>2. Git evidence</span><ArrowRight size={16}/><span className={phase>=3?'current':''}>{fundingEnabled ? '3. Fund' : '3. Review'}</span></div><div className="form-body">
    {!fundingEnabled && <div className="notice notice-warn"><CircleAlert size={19}/><span><strong>Funding is not enabled in this frontend.</strong> You can inspect the workflow, but the app will not submit value-bearing writes until <code>NEXT_PUBLIC_FUNDING_ENABLED=true</code> matches the funded V2 deployment.</span></div>}
    <h2>{phase===1?'What promise are we testing?':phase===2?'Pin the actual release.':'One last evidence check.'}</h2>
    {phase===1 && <div className="form-grid"><Field label="Case name"><input placeholder="The fee ceiling" maxLength={88} value={draft.title} onChange={e=>set('title',e.target.value)}/></Field><Field label="Exact published claim" hint="Copy the exact statement, including punctuation, from the documentation."><textarea rows={5} maxLength={480} placeholder="The protocol cannot charge users more than 2%..." value={draft.claim} onChange={e=>set('claim',e.target.value)}/></Field><Field label="Bounty in GEN"><input value={draft.bounty} inputMode="decimal" onChange={e=>set('bounty',e.target.value)} /></Field><Field label="Challenge duration (hours)"><input type="number" min={6} max={720} value={draft.duration_hours} onChange={e=>set('duration_hours',Number(e.target.value))}/></Field><button className="btn btn-dark full" onClick={()=>setPhase(2)} disabled={draft.title.trim().length < 8 || draft.claim.length < 25}>Next: Git evidence <ArrowRight size={18}/></button></div>}
    {phase===2 && <div className="form-grid"><div className="two-fields"><Field label="GitHub owner"><input value={draft.owner} placeholder="example-org" onChange={e=>set('owner',e.target.value)}/></Field><Field label="Repository"><input value={draft.repo} placeholder="example-protocol" onChange={e=>set('repo',e.target.value)}/></Field></div><Field label="Full Git commit (40 lowercase hex)"><input className="mono-input" spellCheck={false} value={draft.commit} maxLength={40} placeholder="a123... exact 40-character SHA" onChange={e=>set('commit',e.target.value.toLowerCase())}/></Field><Field label="Documentation path"><input value={draft.doc_path} placeholder="docs/fees.md" onChange={e=>set('doc_path',e.target.value)}/></Field><Field label="Source code path"><input value={draft.source_path} placeholder="src/fees.py" onChange={e=>set('source_path',e.target.value)}/></Field><div className="button-row"><button className="btn btn-outline" onClick={()=>setPhase(1)}><ArrowLeft size={16}/> Back</button><button className="btn btn-dark" disabled={Boolean(invalid)||checking} onClick={()=>void verify()}>{checking?'Reading pinned files…':'Verify source files'} <ScanEye size={18}/></button></div>{invalid && <small className="validation-tip">{invalid}</small>}</div>}
    {phase===3 && verified && <div className="form-grid"><div className="verified-box"><BadgeCheck size={25}/><div><strong>Files verified in this browser</strong><p>The claim was found verbatim. Digests will be re-checked independently by GenLayer validators during any challenge.</p></div></div><div className="digest-line"><span>Documentation SHA-256</span><code>{verified.doc_digest}</code></div><div className="digest-line"><span>Source SHA-256</span><code>{verified.source_digest}</code></div><div className="summary-grid"><div><small>REWARD</small><strong>{draft.bounty} GEN</strong></div><div><small>CHALLENGE WINDOW</small><strong>{draft.duration_hours} hours</strong></div></div><p className="help-text">{fundingEnabled ? 'Publishing sends the bounty into ReceiptV2. If no qualifying challenge wins, it becomes refundable after expiry. While a submitted challenge is pending, the funds remain reserved.' : 'The evidence is ready for inspection, but this frontend is not enabled for funding writes.'}</p><div className="button-row"><button className="btn btn-outline" onClick={()=>setPhase(2)}>Edit source</button>{fundingEnabled ? (account?<button className="btn btn-dark" disabled={busy||!canWrite} onClick={()=>void publish()}><LockKeyhole size={16}/>{busy?'Submitting…':'Fund & publish'}</button>:<button className="btn btn-dark" onClick={connect}><Wallet size={16}/>Connect to fund</button>) : <button className="btn btn-outline" disabled><LockKeyhole size={16}/>Funding unavailable</button>}</div></div>}
    {error && <div className="form-error" role="alert"><CircleAlert size={17}/>{error}</div>}
    </div></div>
  </section>;
}

function CaseDetail({c,now,account,canWrite,fundingEnabled,connect,runTx,refresh,onClose}: {c:ReceiptCase; now:number; account:string;canWrite:boolean;fundingEnabled:boolean;connect:()=>void;runTx:(label:string,fn:(u:(s:string,h?:string)=>void)=>Promise<string>)=>Promise<string>;refresh:()=>Promise<void>;onClose:()=>void}) {
  const [live, setLive] = useState<ReceiptCase>(c);
  const [attempt,setAttempt] = useState<ReceiptAttempt|null>(null);
  const [source,setSource] = useState('');const [doc,setDoc] = useState('');const [verified,setVerified] = useState(false);
  const [fetchError,setFetchError] = useState('');const [loading,setLoading] = useState(false);
  const [anchor,setAnchor] = useState('');const [thesis,setThesis] = useState('');
  const [busy,setBusy] = useState(false);const [error,setError]=useState('');
  const [backupRevision,setBackupRevision] = useState(0);
  const saved = useMemo(()=>{ void backupRevision; return getReveals().find(x=>x.case_id===live.id&&x.address.toLowerCase()===account.toLowerCase()); },[live.id,account,backupRevision]);
  const sync = useCallback(async()=>{try{const fresh=await caseById(c.id);if(fresh){setLive(fresh);const id=fresh.active_attempt||fresh.won_attempt;if(id)setAttempt(await attemptById(id));else setAttempt(null);}}catch(e){setError((e as Error).message);}},[c.id]);
  useEffect(()=>{void sync();const interval=setInterval(()=>{void sync();},15000);return()=>clearInterval(interval);},[sync]);
  useEffect(()=>{let cancelled=false;setLoading(true);loadEvidence(c).then(e=>{if(cancelled)return;setDoc(e.doc);setSource(e.source);setVerified(e.doc_digest===c.doc_digest && e.source_digest===c.source_digest);if(e.doc_digest!==c.doc_digest||e.source_digest!==c.source_digest)setFetchError('Pinned content differs from the locked SHA-256 fingerprints. Do not treat it as proven.');}).catch(e=>{if(!cancelled)setFetchError((e as Error).message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[c]);
  const begin = async()=>{
    if (!account || !canWrite) return;
    if (!fundingEnabled) { setError('Challenger funding is unavailable until the frontend configuration matches the funded ReceiptV2 deployment.'); return; }
    if (!anchor.trim() || anchor.length<12 || anchor.length>260 || !source.includes(anchor)) {setError('Use an exact 12–260 character snippet found in the pinned source.');return;}
    if (thesis.length<40||thesis.length>1200) {setError('Write a concrete 40–1200 character argument.');return;}
    if (!/^[\x00-\x7f]*$/.test(anchor+thesis) || anchor.includes('|') || thesis.includes('|')){setError('For canonical commitments use ASCII text, without the | character.');return;}
    setBusy(true);setError('');
    const salt=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
    try{const hash=await commitHash(VAULT,live.id,account,salt,anchor,thesis);
      saveReveal({case_id:live.id,address:account.toLowerCase(),salt,anchor,thesis,commitment:hash,created_at:Date.now()});
      setBackupRevision(v=>v+1);
      await runTx('Commit evidence (bond)',u=>write('commit_attempt',[live.id,hash],account,bondFor(live.bounty),u));
      await sync();await refresh();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const reveal=async()=>{
    if(!saved||!account||!attempt)return;
    setBusy(true);setError('');
    try{await runTx('Reveal frozen contradiction',u=>write('reveal_attempt',[attempt.id,saved.salt,saved.anchor,saved.thesis],account,0n,u));dropReveal(live.id,account.toLowerCase());setBackupRevision(v=>v+1);await sync();await refresh();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const action=async(method:string,args:unknown[],label:string,addr: `0x${string}`=VAULT)=>{
    if(!account||!canWrite)return;setBusy(true);setError('');
    try{await runTx(label,u=>write(method,args,account,0n,u,addr));await sync();await refresh();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const challenger = attempt && attempt.claimant.toLowerCase()===account.toLowerCase();
  const expiredNow = live.deadline*1000 <= now;
  return <Modal title={live.title} onClose={onClose} wide><div className="case-modal-body"><div className="case-modal-top"><div><Stamp status={live.status}/><div className="prize-label">FUNDED PRIZE <strong>{fmt(live.bounty)} GEN</strong></div></div><div className="copyable"><Github size={17}/><a target="_blank" rel="noreferrer" href={`https://github.com/${live.owner}/${live.repo}/tree/${live.commit}`}>{live.owner}/{live.repo} <ExternalLink size={13}/></a></div></div>
    <div className="claim-callout"><span className="eyebrow">THE EXACT PUBLISHED PROMISE</span><blockquote>{live.claim}</blockquote><small>Locked Git commit: <code>{live.commit}</code></small></div>
    <div className="detail-meta"><span><Clock3 size={15}/>Deadline {relativeDate(live.deadline)}</span><span><Fingerprint size={15}/> SHA-256 locked</span><span><Ticket size={15}/>Case #{live.id}</span></div>
    <div className="source-grid"><div className="evidence-panel"><div className="evidence-panel-head"><div><BookOpen size={18}/>Published docs</div><a href={toSource(live,live.doc_path)} target="_blank" rel="noreferrer">View source <ArrowUpRight size={14}/></a></div><span className="file-path">{live.doc_path}</span>{loading?<p>Fetching…</p>:doc?<Snippet code={doc} maxLines={25}/>:<div className="evidence-unavailable">Documentation unavailable.</div>}</div>
    <div className="evidence-panel"><div className="evidence-panel-head"><div><Code2 size={18}/>Released code</div><a href={toSource(live,live.source_path)} target="_blank" rel="noreferrer">View source <ArrowUpRight size={14}/></a></div><span className="file-path">{live.source_path}</span>{loading?<p>Fetching…</p>:source?<Snippet code={source} highlight={anchor||attempt?.anchor} maxLines={25}/>:<div className="evidence-unavailable">Source unavailable.</div>}</div></div>
    {verified?<div className="source-verified"><CheckCircle2 size={18}/>Browser-fetched files match both on-chain SHA-256 commitments. This alone does not prove a contradiction.</div>:<div className="source-warning"><CircleAlert size={18}/>{fetchError||'Files have not been verified yet. Do not submit without source integrity.'}</div>}
    {attempt && <div className="attempt-summary"><div className="section-title-row"><h3>Active / winning attempt #{attempt.id}</h3><Stamp status={attempt.status}/></div><p><strong>Challenger:</strong> {addrShort(attempt.claimant)} {attempt.verdict && <>· <strong>Verdict:</strong> {attempt.verdict}</>}</p>{attempt.anchor && <p><strong>Anchor:</strong> <code>{attempt.anchor}</code></p>}{attempt.thesis && <p><strong>Argument:</strong> {attempt.thesis}</p>}{attempt.reason && <p><strong>Validator explanation:</strong> {attempt.reason}</p>}{attempt.evidence_digest && <p className="small-mono">Evidence: {attempt.evidence_digest}</p>}</div>}
    {live.status==='OPEN'&&!expiredNow && !attempt && (fundingEnabled ? <div className="challenge-form"><div className="section-title-row"><div><span className="eyebrow">GOT A LEAD?</span><h3>Bring your evidence.</h3></div><span className="bond-pill">Bond {fmt(bondFor(live.bounty).toString())} GEN</span></div><Field label="Exact source-code anchor" hint="A literal 12–260 character excerpt present in the locked source file."><textarea rows={2} maxLength={260} value={anchor} onChange={e=>setAnchor(e.target.value)} placeholder="Copy the exact line or expression from the source…"/></Field><Field label="Explain the real contradiction" hint="Show how this exact released code path contradicts the locked claim. Missing paths result in NOT_ESTABLISHED."><textarea rows={4} minLength={40} maxLength={1200} value={thesis} onChange={e=>setThesis(e.target.value)} placeholder="The published claim says… However the implemented execution path…"/></Field><button type="button" className="source-selection" onClick={()=>{const t=window.getSelection()?.toString() || '';if(t.length>0 && t.length<=260)setAnchor(t);else setError('Select an exact snippet from the source above (maximum 260 characters).');}}><ScanEye size={15}/> Use selected code as anchor</button><p className="help-text">A commitment is written first, then revealed in a second transaction. The salt and evidence are saved in this browser; export a backup in My Desk. Valid challenges return the bond plus bounty. Invalid ones forfeit the bond to the sponsor.</p>{account?<button className="btn btn-dark" disabled={!canWrite||busy||!verified} onClick={()=>void begin()}><LockKeyhole size={18}/>{busy?'Waiting…':'Commit challenge'}</button>:<button className="btn btn-dark" onClick={connect}><Wallet size={17}/>Connect to challenge</button>}</div> : <div className="notice notice-warn"><CircleAlert size={19}/><span><strong>New challenges are unavailable in this frontend.</strong> Evidence remains readable, but the app will not submit a challenger bond until its funding configuration matches V2.</span></div>)}
    {attempt?.status==='COMMITTED' && <div className="next-action"><KeyRound size={24}/><div><h3>Evidence committed. Now reveal it.</h3><p>Deadline: {relativeDate(attempt.reveal_by)}. Only the challenger can reveal the matching salt and argument.</p>{challenger&&saved&&<button className="btn btn-dark" disabled={!canWrite||busy} onClick={()=>void reveal()}><UnlockKeyhole size={17}/>Reveal evidence</button>}{challenger&&!saved&&<p className="source-warning">This browser has no matching reveal backup. Import your previously exported draft in My Desk before the deadline.</p>}{now>attempt.reveal_by*1000&&<button className="btn btn-outline" disabled={!canWrite||busy} onClick={()=>void action('settle_unrevealed',[attempt.id],'Forfeit unrevealed challenge')}>Settle expired commitment</button>}</div></div>}
    {attempt?.status==='PENDING' && <div className="next-action"><RefreshCcw size={24}/><div><h3>Evidence is ready for single-contract adjudication.</h3><p>The revealed evidence is frozen. Any Studionet wallet may ask this same ReceiptV2 contract to fetch the pinned files, run independent validator checks and settle the result atomically.</p><div className="button-row"><button className="btn btn-outline" onClick={()=>void sync()}><RefreshCcw size={16}/>Refresh case</button><button className="btn btn-dark" disabled={!canWrite||busy} onClick={()=>void action('adjudicate_attempt',[attempt.id],'Adjudicate frozen evidence')}>Adjudicate evidence</button>{now>(attempt.revealed_at+604800)*1000&&<button className="btn btn-outline" disabled={!canWrite||busy} onClick={()=>void action('recover_pending',[attempt.id],'Recover stalled evidence')}>Recover stalled evidence</button>}</div></div></div>}
    {live.status==='OPEN'&&expiredNow&&!attempt&&<div className="next-action"><Clock3 size={25}/><div><h3>This case has passed its deadline.</h3><p>Anyone can finalize expiry, making the unfunded winner&apos;s bounty refundable to the sponsor.</p><button className="btn btn-outline" disabled={!canWrite||busy} onClick={()=>void action('expire_case',[live.id],'Close expired case')}>Finalize expiry</button></div></div>}
    {live.status==='WON'&&<div className="won-banner"><PartyPopper size={28}/><div><h3>That&apos;s a receipt!</h3><p>Validators confirmed the bounded contradiction. The winning wallet has a contract-level payout entitlement.</p></div></div>}
    {error&&<div className="form-error" role="alert"><CircleAlert size={17}/>{error}</div>}
    <div className="detail-links"><a href={`https://github.com/${live.owner}/${live.repo}/tree/${live.commit}`} target="_blank" rel="noreferrer"><Github size={16}/> Pinned Git snapshot <ArrowUpRight size={15}/></a><button onClick={()=>navigator.clipboard.writeText(`${window.location.origin}/?case=${live.id}`)}><Copy size={15}/> Copy case link</button><button onClick={()=>void sync()}><RefreshCcw size={15}/>Refresh status</button></div>
  </div></Modal>;
}

function HistoricalView({account,connect}:{account:string;connect:()=>void}) {
  const [summary,setSummary] = useState<{cases:number;attempts:number;outstanding:string;dispatches:number;funding:boolean}|null>(null);
  const [credit,setCredit] = useState<bigint|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    if (!hasHistoricalDeployment()) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([historicalConfig(), historicalCounts(), historicalTreasuryStatus()]).then(([config,counts,treasury]) => {
      if (!cancelled) setSummary({cases:counts.cases, attempts:counts.attempts, outstanding:treasury.outstanding_wei, dispatches:treasury.dispatch_count, funding:config.funding_enabled === true});
    }).catch(e => { if (!cancelled) setError((e as Error).message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!account || !hasHistoricalDeployment()) { setCredit(null); return; }
    let cancelled = false;
    historicalCreditOf(account).then(value => { if (!cancelled) setCredit(value); }).catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [account]);
  return <section className="content-section"><div className="section-head"><div><span className="eyebrow">ARCHIVED V1 RECORDS</span><h2>History stays <span className="scribble">honest.</span></h2><p>Read-only access to the original two-contract deployment. V1 cases and credits were not migrated into V2.</p></div><div className="floating-icon"><History size={32}/></div></div>
    {!hasHistoricalDeployment() ? <div className="notice notice-warn"><CircleAlert size={19}/><span><strong>Historical V1 viewer is not configured.</strong> Supply both historical contract addresses to inspect the old records.</span></div> : <>
      {error && <div className="notice notice-error"><CircleAlert size={18}/><span>{error}</span></div>}
      <div className="notice notice-warn"><ShieldCheck size={19}/><span><strong>Read-only history.</strong> This page exposes no V1 write or withdrawal controls. V1 credits remain at the historical PromiseVault and are never represented as V2 balances.</span></div>
      {loading ? <div className="empty-state"><RefreshCcw className="spin" size={31}/><h3>Reading finalized V1 state…</h3></div> : summary && <div className="desk-two"><div className="desk-list"><h3>Historical registry</h3><div className="detail-meta"><span>{summary.cases} cases</span><span>{summary.attempts} attempts</span><span>{summary.funding ? 'funding was enabled' : 'funding disabled'}</span></div><p className="help-text">These records belong to the historical PromiseVault. They are not proof that V2 can safely move funds.</p></div><div className="desk-list"><h3>Historical treasury</h3><p><strong>{fmt(summary.outstanding)} GEN</strong> recorded as outstanding in V1.</p><p className="help-text">Observed V1 dispatch records: {summary.dispatches}. A dispatch record is not treated as an authenticated external receipt.</p></div></div>}
      <div className="desk-list" style={{marginTop: '22px'}}><h3>Your historical credit</h3>{account ? <p><strong>{credit === null ? 'Reading…' : `${fmt(credit.toString())} GEN`}</strong><br/><span className="help-text">Queried from the historical PromiseVault for {addrShort(account)}. This value is separate from the active V2 credit.</span></p> : <><p className="help-text">Connect a wallet to read its historical PromiseVault credit. Connecting does not authorize any V1 write.</p><button className="btn btn-outline btn-small" onClick={connect}><Wallet size={16}/>Connect wallet to inspect credit</button></>}</div>
      <div className="detail-links"><a href={`${EXPLORER}/address/${HISTORICAL_VAULT}`} target="_blank" rel="noreferrer">Historical PromiseVault {addrShort(HISTORICAL_VAULT)} <ExternalLink size={13}/></a><a href={`${EXPLORER}/address/${HISTORICAL_ENGINE}`} target="_blank" rel="noreferrer">Historical ProofEngine {addrShort(HISTORICAL_ENGINE)} <ExternalLink size={13}/></a></div>
    </>}
  </section>;
}

function DeskView({account,attempts,cases,credit,treasury,canWrite,runTx,connect,loadOlder,hasOlder,select}: {account:string;attempts:ReceiptAttempt[];cases:ReceiptCase[];credit:bigint;treasury:TreasuryStatus|null;canWrite:boolean;runTx:(label:string,fn:(u:(s:string,h?:string)=>void)=>Promise<string>)=>Promise<string>;connect:()=>void;loadOlder:()=>Promise<void>;hasOlder:boolean;select:(c:ReceiptCase)=>void}) {
  const [importText,setImportText]=useState('');const [warning,setWarning]=useState('');const [backupVersion,setBackupVersion]=useState(0);const [lastDispatch,setLastDispatch]=useState<DispatchRecord|null>(null);
  const mine=attempts.filter(a=>a.claimant.toLowerCase()===account.toLowerCase());
  const funded=cases.filter(c=>c.sponsor.toLowerCase()===account.toLowerCase());
  const backups=useMemo(()=>{ void backupVersion; return account?getReveals().filter(x=>x.address.toLowerCase()===account.toLowerCase()):[]; },[account,backupVersion]);
  useEffect(()=>{let cancelled=false;if(!treasury?.dispatch_count){setLastDispatch(null);return;}void dispatchById(treasury.dispatch_count).then(value=>{if(!cancelled)setLastDispatch(value);}).catch(()=>{if(!cancelled)setLastDispatch(null);});return()=>{cancelled=true;};},[treasury?.dispatch_count]);
  const withdraw=async()=>{if(!account||credit<=0n)return;await runTx('Withdraw claimable GEN',u=>write('withdraw',[],account,0n,u));setWarning('Withdrawal dispatch finalized. Verify the external child receipt independently before treating the GEN as received.');};
  const exportBackup=(id:number)=>{const d=backups.find(x=>x.case_id===id);if(d){const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`receipt-case-${id}-reveal.json`;a.click();URL.revokeObjectURL(url);}};
  const importBackup=()=>{try{const parsed=JSON.parse(importText);if(!parsed||!Number.isInteger(parsed.case_id)||!/^0x[0-9a-fA-F]{40}$/.test(parsed.address)||!(/^[0-9a-f]{64}$/.test(parsed.salt))||!(/^[0-9a-f]{64}$/.test(parsed.commitment))||typeof parsed.anchor!=='string'||typeof parsed.thesis!=='string')throw Error('Invalid backup');if(parsed.address.toLowerCase()!==account.toLowerCase())throw Error('Backup wallet differs from connected account');saveReveal(parsed);setBackupVersion(v=>v+1);setImportText('');setWarning('Reveal backup imported. Open its case and reveal before the deadline.');}catch(e){setWarning((e as Error).message);}};
  return <section className="content-section"><div className="section-head"><div><span className="eyebrow">YOUR INVESTIGATOR&apos;S DESK</span><h2>The case <span className="scribble">files.</span></h2><p>Real finalized wallet entitlements, cases you sponsor and evidence you have committed.</p></div><div className="floating-icon"><Wallet size={32}/></div></div>
    {!account?<div className="empty-state"><Wallet size={48}/><h3>Connect your investigator wallet.</h3><p>Your credits and attempts are determined by the on-chain address.</p><button className="btn btn-dark" onClick={connect}>Connect wallet</button></div>:<>
    <div className="desk-top"><div className="credit-card"><small>CLAIMABLE CONTRACT CREDIT</small><h3>{fmt(credit.toString())}<span> GEN</span></h3><p>Finalized outcomes create internal entitlements.</p><button className="btn btn-ink" disabled={!canWrite||credit<=0n} onClick={()=>void withdraw()}><ArrowDown size={17}/>{credit>0n?'Withdraw GEN':'No claimable GEN'}</button><small className="credit-warning">Withdrawal dispatches the full credit to this connected wallet through the native GEN EVM interface. The contract records the dispatch as EMITTED_UNCONFIRMED; verify the external child receipt separately, with no automatic retry or re-credit.</small></div><div className="desk-stat"><FileSearch2 size={28}/><strong>{mine.length}</strong><span>Your recent challenges</span></div><div className="desk-stat"><Gift size={28}/><strong>{funded.length}</strong><span>Your recent funded cases</span></div></div>
     <div className="desk-two"><div className="desk-list"><h3>My investigations</h3>{mine.length?mine.map(a=><div className="desk-item" key={a.id}><div><span className="tiny-id">ATTEMPT #{a.id} · CASE #{a.case_id}</span><strong>{cases.find(c=>c.id===a.case_id)?.title||'Older case'}</strong><small>{a.verdict||statusLabel(a.status)}</small></div><button className="icon-btn" aria-label="Open case" onClick={()=>{const c=cases.find(c=>c.id===a.case_id);if(c)select(c);}}><ArrowUpRight size={19}/></button></div>):<p className="placeholder">No challenges found in the loaded on-chain history.</p>}</div><div className="desk-list"><h3>Funded by me</h3>{funded.length?funded.map(c=><div className="desk-item" key={c.id}><div><span className="tiny-id">CASE #{c.id}</span><strong>{c.title}</strong><small>{fmt(c.bounty)} GEN · {statusLabel(c.status)}</small></div><button className="icon-btn" onClick={()=>select(c)} aria-label="Open funded case"><ArrowUpRight size={19}/></button></div>):<p className="placeholder">No funded cases found in the loaded on-chain history.</p>}</div><div className="desk-list withdrawal-list"><h3>Withdrawal status</h3>{lastDispatch?<><p><strong>Dispatch #{lastDispatch.id}</strong> · {lastDispatch.status}</p><p className="help-text">{fmt(lastDispatch.amount_wei)} GEN addressed to {addrShort(lastDispatch.recipient)} on {relativeDate(lastDispatch.created_at)}.</p></>:<><p className="help-text">No withdrawal dispatch has been recorded for this deployment yet.</p><p className="placeholder">Claimable credit remains available above.</p></>}{warning&&<p className="help-text">{warning}</p>}</div></div>
    {hasOlder&&<button className="btn btn-outline" onClick={()=>void loadOlder()}><History size={16}/>Load older on-chain history</button>}
    <div className="backup-box"><div className="section-title-row"><div><span className="eyebrow">DO NOT LOSE YOUR COMMITMENT SECRET</span><h3>Reveal backups</h3></div><KeyRound size={24}/></div><p>Commit/reveal salts are saved only on this device. Export each draft and keep it private until reveal. Losing a salt may forfeit the challenge bond.</p>{backups.map(b=><div className="backup-item" key={b.case_id}><span>Case #{b.case_id} · {b.commitment.slice(0,12)}…</span><button className="btn btn-outline btn-small" onClick={()=>exportBackup(b.case_id)}><Download size={16}/>Export JSON</button></div>)}<Field label="Restore a JSON backup"><textarea rows={3} placeholder="Paste an exported reveal JSON object…" value={importText} onChange={e=>setImportText(e.target.value)}/></Field><button className="btn btn-outline" onClick={importBackup} disabled={!importText.trim()}>Import backup</button>{warning&&<div className="form-error">{warning}</div>}</div></>}
  </section>;
}
function AboutView({fundingEnabled,openCreate}:{fundingEnabled:boolean;openCreate:()=>void}){
  return <section className="content-section about"><div className="about-hero"><span className="eyebrow">OUR ENTIRE INVESTIGATION METHOD</span><h1>Don&apos;t just trust it.<br/><span className="scribble">Receipt it.</span></h1><p>RECEIPT! lets anyone inspect a narrowly-scoped documentation claim. {fundingEnabled ? 'Sponsors fund claims and challengers bring exact pinned source evidence.' : 'The app remains read-only until its funding flag matches the live V2 deployment.'} GenLayer&apos;s validators determine whether the claimed behavior is actually contradicted.</p></div><div className="about-cards"><div><span className="about-index">01</span><BookOpen size={32}/><h3>Pin the promise</h3><p>{fundingEnabled ? 'Fund a public claim with GEN. Freeze the entire Git commit, documentation path, source path and SHA-256 content fingerprints.' : 'Inspect the exact Git commit, documentation path, source path and SHA-256 content fingerprints.'}</p></div><div><span className="about-index">02</span><ZoomIn size={32}/><h3>Trace the code</h3><p>{fundingEnabled ? 'A challenger stakes a bond, commits a hidden argument, and then reveals an exact code anchor with a detailed counterexample.' : 'Review the frozen source and documentation evidence while the frontend configuration is reconciled.'}</p></div><div><span className="about-index">03</span><ShieldCheck size={32}/><h3>Independent judgment</h3><p>GenLayer fetches pinned files, verifies content, and has validators independently interpret whether the bounded claim is contradicted.</p></div><div><span className="about-index">04</span><Gift size={32}/><h3>Settle the case</h3><p>{fundingEnabled ? 'The final verdict controls bounty and bond entitlements. The sponsor cannot rewrite the rules or override a valid contradiction.' : 'Read the configured deployment state and its finalized entitlements without submitting value-bearing writes.'}</p></div></div><div className="about-bottom"><div><h2>What it doesn&apos;t claim.</h2><p>A successful receipt proves a specific documented contradiction under the frozen file scope. It is not a general security audit, full program execution, author identity proof or deployed-bytecode certification.</p><p>Technical failures are INCONCLUSIVE—not automatic wins. Bounded source files must be independently fetched during adjudication.</p></div><button className="btn btn-dark" onClick={openCreate}>{fundingEnabled ? 'Fund a claim' : 'Review configuration'} <ArrowUpRight size={17}/></button></div></section>;
}
