'use client';
import { type RevealDraft } from './domain';
const KEY = 'receipt-pending-reveals-v1';
export function getReveals(): RevealDraft[] {
  if (typeof localStorage === 'undefined') return [];
  try { const data = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
export function saveReveal(d: RevealDraft) {
  const old = getReveals().filter(x => !(x.case_id === d.case_id && x.address === d.address));
  localStorage.setItem(KEY, JSON.stringify([...old, d]));
}
export function dropReveal(caseId: number, address: string) {
  localStorage.setItem(KEY, JSON.stringify(getReveals().filter(x => !(x.case_id === caseId && x.address === address))));
}
