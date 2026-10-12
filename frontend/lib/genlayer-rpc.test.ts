import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/genlayer-rpc/route';

const rpcRequest = (body: unknown, headers: Record<string, string> = {}) => new Request('http://localhost/api/genlayer-rpc', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('same-origin GenLayer RPC route', () => {
  it('forwards an allowlisted read to the fixed upstream and preserves the response', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://studio.genlayer.com/api');
      expect(init?.method).toBe('POST');
      expect(init?.cache).toBe('no-store');
      expect(init?.body).toBe(JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'gen_call', params: [] }));
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 42, result: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(rpcRequest({ jsonrpc: '2.0', id: 42, method: 'gen_call', params: [] }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ jsonrpc: '2.0', id: 42, result: { ok: true } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects signing, wallet and transaction broadcast methods before upstream access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const method of ['wallet_getSnaps', 'wallet_requestSnaps', 'personal_sign', 'eth_sendTransaction', 'eth_sendRawTransaction']) {
      const response = await POST(rpcRequest({ jsonrpc: '2.0', id: method, method, params: [] }));
      expect(response.status, method).toBe(403);
      expect((await response.json()).id, method).toBe(method);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported fields so the route cannot accept arbitrary destinations', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(rpcRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'gen_call',
      params: [],
      url: 'https://example.invalid',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ id: 9, error: { code: -32600 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves an upstream JSON-RPC rate-limit response and HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32005, message: 'rate limit' },
    }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })));

    const response = await POST(rpcRequest({ jsonrpc: '2.0', id: 7, method: 'gen_call', params: [] }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32005, message: 'rate limit' },
    });
  });

  it('keeps a non-JSON upstream 429 diagnosable without retrying or masking it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Too Many Requests', { status: 429 })));

    const response = await POST(rpcRequest({ jsonrpc: '2.0', id: 8, method: 'gen_call', params: [] }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ id: 8, error: { code: -32098, message: 'GenLayer RPC upstream returned HTTP 429.' } });
  });

  it('reports an unreachable upstream as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const response = await POST(rpcRequest({ jsonrpc: '2.0', id: 11, method: 'gen_call', params: [] }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ id: 11, error: { code: -32098, message: 'GenLayer RPC upstream is unreachable.' } });
  });

  it('rejects malformed and oversized payloads', async () => {
    const malformed = new Request('http://localhost/api/genlayer-rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const malformedResponse = await POST(malformed);
    expect(malformedResponse.status).toBe(400);

    const oversizedResponse = await POST(rpcRequest({ jsonrpc: '2.0', id: 12, method: 'gen_call', params: [] }, { 'content-length': '65537' }));
    expect(oversizedResponse.status).toBe(413);
  });
});
