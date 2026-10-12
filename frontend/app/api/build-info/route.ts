import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({
    project: 'RECEIPT!', chain_id: 61999,
    source_commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RECEIPT_SOURCE_COMMIT || null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
    receipt_v2: process.env.NEXT_PUBLIC_RECEIPT_V2_ADDRESS || null,
    historical_promise_vault: process.env.NEXT_PUBLIC_HISTORICAL_PROMISE_VAULT_ADDRESS || process.env.NEXT_PUBLIC_PROMISE_VAULT_ADDRESS || null,
    historical_proof_engine: process.env.NEXT_PUBLIC_HISTORICAL_PROOF_ENGINE_ADDRESS || process.env.NEXT_PUBLIC_PROOF_ENGINE_ADDRESS || null,
    provenance: 'environment-claimed; independently verify against deployment and repository',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
