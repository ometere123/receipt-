const STUDIONET_RPC = 'https://studio.genlayer.com/api';
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

const READ_METHODS = new Set([
  'gen_call',
  'gen_getContractCode',
  'gen_getContractSchema',
  'gen_getContractSchemaForCode',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_estimateGas',
  'eth_gasPrice',
]);

const FORBIDDEN_METHODS = new Set([
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_sign',
  'eth_signTransaction',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'personal_sign',
]);

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc: '2.0'; id: JsonRpcId; method: string; params?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, status: number) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function isJsonRpcResponse(text: string) {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) && value.jsonrpc === '2.0' && ('result' in value || 'error' in value);
  } catch {
    return false;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonRpcError(null, -32600, 'Content-Type must be application/json.', 415);
  }

  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonRpcError(null, -32600, 'JSON-RPC payload is too large.', 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonRpcError(null, -32600, 'Unable to read JSON-RPC payload.', 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonRpcError(null, -32600, 'JSON-RPC payload is too large.', 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonRpcError(null, -32700, 'Invalid JSON.', 400);
  }

  const id = isRecord(body) && isId(body.id) ? body.id : null;
  if (!isRecord(body) || body.jsonrpc !== '2.0' || !isId(body.id) || typeof body.method !== 'string' || body.method.length === 0 || body.method.length > 80) {
    return jsonRpcError(id, -32600, 'Invalid JSON-RPC request.', 400);
  }
  const allowedKeys = new Set(['jsonrpc', 'id', 'method', 'params']);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return jsonRpcError(id, -32600, 'JSON-RPC request contains unsupported fields.', 400);
  }
  const rpcRequest = body as unknown as JsonRpcRequest;
  if (rpcRequest.params !== undefined && !Array.isArray(rpcRequest.params) && !isRecord(rpcRequest.params)) {
    return jsonRpcError(id, -32602, 'JSON-RPC params must be an array or object.', 400);
  }
  if (FORBIDDEN_METHODS.has(rpcRequest.method) || rpcRequest.method.startsWith('wallet_')) {
    return jsonRpcError(id, -32601, `RPC method is not permitted through this read-only proxy: ${rpcRequest.method}.`, 403);
  }
  if (!READ_METHODS.has(rpcRequest.method)) {
    return jsonRpcError(id, -32601, `RPC method is not allowlisted: ${rpcRequest.method}.`, 403);
  }

  try {
    const upstream = await fetch(STUDIONET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: rawBody,
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const upstreamBody = await upstream.text();
    if (!upstream.ok && !isJsonRpcResponse(upstreamBody)) {
      return jsonRpcError(id, -32098, `GenLayer RPC upstream returned HTTP ${upstream.status}.`, upstream.status);
    }
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return jsonRpcError(id, -32098, 'GenLayer RPC upstream is unreachable.', 503);
  }
}
