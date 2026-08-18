const configuredApiBase = import.meta.env.VITE_API_BASE || '';

export const API_BASE = configuredApiBase.trim().replace(/\/+$/, '');

export function apiUrl(endpoint: string): string {
  const normalizedEndpoint = `/${endpoint}`.replace(/\/{2,}/g, '/');
  return `${API_BASE}${normalizedEndpoint}`;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

export interface RechargeRecord {
  time: string;
  amountKwh: number;
  beforeKwh: number;
  afterKwh: number;
  meter_name?: string;
  previousRechargeTime?: string | null;
  intervalSincePreviousMs?: number | null;
  cycleConsumedKwh?: number | null;
  cycleDailyUsageKwh?: number | null;
}

export interface RechargeHistoryData {
  total: number;
  totalRechargeKwh: number;
  records: RechargeRecord[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function messageForStatus(status: number): string {
  if (status === 400) return '请求参数错误，请检查输入';
  if (status === 401) return '未授权访问，请重新登录';
  if (status === 403) return '拒绝访问，没有权限';
  if (status === 404) return '请求的资源不存在';
  if (status >= 500) return '服务器暂时不可用，请稍后重试';
  return `请求失败（HTTP ${status}）`;
}

async function executeRequest<T>(endpoint: string, options: RequestInit, timeoutMs: number): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const externalSignal = options.signal;
  const abortFromExternal = () => timeoutController.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  try {
    const response = await fetch(apiUrl(endpoint), {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      credentials: 'same-origin',
      signal: timeoutController.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(payload?.message || payload?.error || messageForStatus(response.status), response.status);
    }
    if (payload?.error) throw new ApiError(payload.message || payload.error, response.status);
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(externalSignal?.aborted ? '请求已取消' : '请求超时，请稍后重试');
    }
    throw new ApiError('网络连接失败，请检查网络设置');
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export function fetchAPI<T>(endpoint: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase();
  const canShareRequest = method === 'GET' && !options.signal && !options.body;
  const requestKey = canShareRequest ? apiUrl(endpoint) : '';
  const pending = canShareRequest ? inFlightGetRequests.get(requestKey) : undefined;
  if (pending) return pending as Promise<T>;

  const request = executeRequest<T>(endpoint, options, timeoutMs);
  if (!canShareRequest) return request;

  inFlightGetRequests.set(requestKey, request);
  request.finally(() => {
    if (inFlightGetRequests.get(requestKey) === request) inFlightGetRequests.delete(requestKey);
  }).catch(() => undefined);
  return request;
}

export interface StreamEvent<T> {
  event: 'status' | 'delta' | 'done' | 'error';
  data: T;
}

export async function streamAPI<T>(
  endpoint: string,
  body: unknown,
  onEvent: (event: StreamEvent<T>) => void,
  timeoutMs = 60_000
): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(payload?.message || payload?.error || messageForStatus(response.status), response.status);
    }
    if (!response.body) throw new ApiError('当前浏览器不支持流式响应');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const consumeBlock = (block: string) => {
      if (!block.trim() || block.trimStart().startsWith(':')) return;
      let event = 'message';
      let data = '';
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data || !['status', 'delta', 'done', 'error'].includes(event)) return;
      onEvent({ event: event as StreamEvent<T>['event'], data: JSON.parse(data) as T });
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      blocks.forEach(consumeBlock);
      if (done) break;
    }
    if (buffer) consumeBlock(buffer);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('AI 响应超时，请重试');
    throw new ApiError('AI 连接中断，请重试');
  } finally {
    window.clearTimeout(timeout);
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '未知错误';
}

function isRetryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === undefined || error.status === 408 || error.status === 429 || error.status >= 500;
}

export async function retryRequest<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: unknown = new ApiError('请求失败');
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts - 1) break;
      const jitter = Math.random() * baseDelayMs * 0.25;
      await new Promise(resolve => window.setTimeout(resolve, baseDelayMs * 2 ** attempt + jitter));
    }
  }
  throw lastError;
}
