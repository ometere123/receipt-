import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InjectedProvider } from './chain';

const sdk = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('genlayer-js', () => ({ createClient: sdk.createClient }));

const sender = `0x${'1'.repeat(40)}`;
const transactionHash = `0x${'a'.repeat(64)}`;

describe('injected write path', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses eth_sendTransaction without the SDK connect or Snap handshake', async () => {
    const methods: string[] = [];
    const requests: Array<{ method: string; params?: unknown[] | object }> = [];
    const provider: InjectedProvider = {
      request: vi.fn(async (request) => {
        methods.push(request.method);
        requests.push(request);
        if (/^wallet_.*snap/i.test(request.method) || /snap/i.test(request.method)) {
          throw new Error(`Snap RPC is forbidden in this regression test: ${request.method}`);
        }
        if (request.method === 'eth_chainId') return '0xf22f';
        if (request.method === 'eth_sendTransaction') return transactionHash;
        throw new Error(`Unexpected provider RPC: ${request.method}`);
      }),
    };

    const connect = vi.fn(async () => {
      throw new Error('client.connect must not be called by the frontend write path');
    });
    const writeContract = vi.fn(async () => {
      await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: sender, value: '0x0' }],
      });
      return transactionHash;
    });
    const waitForTransactionReceipt = vi.fn(async () => ({
      statusName: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
    }));
    const injectedClient = { connect, writeContract, waitForTransactionReceipt };

    sdk.createClient.mockImplementation((config?: { provider?: InjectedProvider }) => (
      config?.provider ? injectedClient : { readContract: vi.fn() }
    ));
    vi.stubEnv('NEXT_PUBLIC_RECEIPT_V2_ADDRESS', `0x${'2'.repeat(40)}`);
    vi.stubGlobal('window', { ethereum: provider });

    const { write } = await import('./chain');
    await expect(write('expire_case', [1], sender)).resolves.toBe(transactionHash);

    expect(connect).not.toHaveBeenCalled();
    expect(writeContract).toHaveBeenCalledOnce();
    expect(waitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(methods).toEqual(['eth_chainId', 'eth_chainId', 'eth_sendTransaction']);
    expect(methods.some((method) => /snap/i.test(method))).toBe(false);
    expect(requests.at(-1)?.method).toBe('eth_sendTransaction');
  });

  it('blocks writes when the injected wallet is on the wrong network', async () => {
    const provider: InjectedProvider = {
      request: vi.fn(async ({ method }) => {
        if (method === 'eth_chainId') return '0x1';
        throw new Error(`Unexpected provider RPC: ${method}`);
      }),
    };
    const { assertNetwork } = await import('./chain');

    await expect(assertNetwork(provider)).rejects.toThrow('Wrong network (0x1). Switch your wallet to Studionet (61999).');
    expect(provider.request).toHaveBeenCalledWith({ method: 'eth_chainId' });
  });
});
