import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, fetchAPI, streamAPI } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiUrl', () => {
  it('normalizes endpoint slashes when no API base is configured', () => {
    expect(apiUrl('/api/overview')).toBe('/api/overview');
    expect(apiUrl('//api/overview')).toBe('/api/overview');
    expect(apiUrl('api/overview')).toBe('/api/overview');
  });
});

describe('fetchAPI', () => {
  it('shares concurrent GET requests for the same endpoint', async () => {
    let resolveResponse: ((value: unknown) => void) | undefined;
    const responsePromise = new Promise(resolve => { resolveResponse = resolve; });
    const fetchMock = vi.fn(() => responsePromise);
    vi.stubGlobal('fetch', fetchMock);

    const first = fetchAPI<{ ok: boolean }>('/api/overview');
    const second = fetchAPI<{ ok: boolean }>('/api/overview');
    resolveResponse?.({ ok: true, status: 200, json: async () => ({ ok: true }) });

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not share POST requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      fetchAPI('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ message: 'a' }) }),
      fetchAPI('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ message: 'a' }) })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('streamAPI', () => {
  it('delivers SSE text deltas and the final answer', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"结论："}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {"answer":{"headline":"完成"}}\n\n'));
        controller.close();
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    })));
    const events: string[] = [];
    await streamAPI<{ text?: string; answer?: { headline: string } }>('/api/assistant/chat/stream', { message: '测试' }, event => {
      if (event.data.text) events.push(event.data.text);
      if (event.data.answer) events.push(event.data.answer.headline);
    });
    expect(events).toEqual(['结论：', '完成']);
  });
});
