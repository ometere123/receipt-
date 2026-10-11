import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...nextVitals,
  ...nextTypescript,
  {
    // These effects intentionally synchronize async wallet/chain state and
    // cancellable RPC reads into React state; Next 16's heuristic flags the
    // legitimate external-store updates as cascading renders.
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
];
export default config;
