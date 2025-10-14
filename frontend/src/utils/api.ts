const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/**
 * 通用API请求函数
 * @param endpoint API端点
 * @param options fetch选项
 * @returns Promise<T>
 */
export async function fetchAPI<T>(
  endpoint: string, 
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data as T;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('网络请求失败');
  }
}

/**
 * 格式化错误消息
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '未知错误';
}

/**
 * 重试请求
 * @param fn 请求函数
 * @param maxRetries 最大重试次数
 * @param delay 重试延迟（毫秒）
 */
export async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('请求失败');
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError!;
}

