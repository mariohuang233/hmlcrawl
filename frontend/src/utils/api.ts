export const API_BASE = process.env.REACT_APP_API_BASE || (process.env.NODE_ENV === 'production' ? '' : '/');

const DEFAULT_TIMEOUT_MS = 12_000;

export interface RechargeRecord {
  time: string;
  amountKwh: number;
  beforeKwh: number;
  afterKwh: number;
  meter_name?: string;
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

export async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT_MS);
  const externalSignal = options.signal;
  const abortFromExternal = () => timeoutController.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
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
