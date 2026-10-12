/**
 * Compatibility guard for the retired V1 deployment entry point.
 * The active package script points to deploy-v2-studionet.mjs, which deploys
 * exactly one ReceiptV2 contract and never binds a ProofEngine callback.
 */
console.error('V1 two-contract deployment is retired. Use: npm run deploy:61999 -- --deploy');
process.exitCode = 1;
