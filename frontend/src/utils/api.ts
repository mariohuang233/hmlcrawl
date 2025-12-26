// 使用REACT_APP_API_BASE环境变量，如果没有则使用默认值
export const API_BASE = process.env.REACT_APP_API_BASE || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');

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
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      // 根据状态码提供更具体的错误信息
      switch (response.status) {
        case 400:
          errorMessage = '请求参数错误，请检查输入';
          break;
        case 401:
          errorMessage = '未授权访问，请重新登录';
          break;
        case 403:
          errorMessage = '拒绝访问，没有权限';
          break;
        case 404:
          errorMessage = '请求的资源不存在';
          break;
        case 500:
          errorMessage = '服务器内部错误，请稍后重试';
          break;
        case 502:
        case 503:
        case 504:
          errorMessage = '服务器暂时不可用，请稍后重试';
          break;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data as T;
  } catch (err) {
    if (err instanceof Error) {
      // 网络错误处理
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        throw new Error('网络连接失败，请检查网络设置');
      }
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
  let lastError: Error = new Error('请求失败');
  
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
  
  throw lastError;
}

