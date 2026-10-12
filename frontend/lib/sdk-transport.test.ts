import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const endpoint = '/api/genlayer-rpc';
const sender = `0x${'1'.repeat(40)}` as `0x${string}`;
const receiver = `0x${'2'.repeat(40)}` as `0x${string}`;
const transactionHash = `0x${'a'.repeat(64)}`;

function chainWithProxy() {
  return {
    ...studionet,
    rpcUrls: {
      ...studionet.rpcUrls,
      default: { ...studionet.rpcUrls.default, http: [endpoint] },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pinned GenLayer SDK transport', () => {
  it('sends a real SDK read through the same-origin endpoint', async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input: String(input), init });
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { status: { code: 0, message: '' }, data: '0x00' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const client = createClient({ chain: chainWithProxy(), endpoint });
    const result = await client.request({ method: 'gen_call', params: [] } as never);

    expect(result).toEqual({ status: { code: 0, message: '' }, data: '0x00' });
    expect(requests).toHaveLength(1);
    expect(requests[0].input).toBe(endpoint);
    expect(requests[0].init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({ jsonrpc: '2.0', method: 'gen_call', params: [] });
  });

  it('routes wallet transaction submission to injected EIP-1193 and never to fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const methods: string[] = [];
    const provider = {
      request: vi.fn(async ({ method }: { method: string; params?: unknown[] }) => {
        methods.push(method);
        if (/^wallet_|personal_sign|eth_sign/i.test(method)) {
          throw new Error(`Snap or signing RPC is forbidden: ${method}`);
        }
        if (method === 'eth_sendTransaction') return transactionHash;
        throw new Error(`Unexpected provider RPC: ${method}`);
      }),
    };

    const client = createClient({
      chain: chainWithProxy(),
      endpoint,
      account: sender,
      provider,
    });
    const result = await client.request({
      method: 'eth_sendTransaction',
      params: [{ from: sender, to: receiver, value: '0x0', data: '0x' }],
    });

    expect(result).toBe(transactionHash);
    expect(methods).toEqual(['eth_sendTransaction']);
    expect(provider.request).toHaveBeenCalledWith({
      method: 'eth_sendTransaction',
      params: [{ from: sender, to: receiver, value: '0x0', data: '0x' }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not mutate the shared Studionet chain definition while configuring a client', () => {
    const originalEndpoint = studionet.rpcUrls.default.http[0];
    createClient({ chain: chainWithProxy(), endpoint });
    expect(studionet.rpcUrls.default.http[0]).toBe(originalEndpoint);
  });
});
