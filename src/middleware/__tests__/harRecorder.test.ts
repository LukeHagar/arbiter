import { describe, it, expect, beforeEach } from 'vitest';
import { harRecorder } from '../harRecorder.js';
import { openApiStore } from '../../store/openApiStore.js';
import { Context } from 'hono';

describe('HAR Recorder Middleware', () => {
  beforeEach(() => {
    openApiStore.clear();
    openApiStore.setTargetUrl('http://localhost:8080');
  });

  it('should record request and response details', async () => {
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/test',
        path: '/test',
        query: {},
        header: () => ({
          'content-type': 'application/json'
        })
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json'
        })
      });
    };

    await harRecorder(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.method).toBe('GET');
    expect(har.log.entries[0].request.url).toBe('http://localhost:8080/test');
    expect(har.log.entries[0].response.status).toBe(200);
    expect(har.log.entries[0].response.content.text).toBe(JSON.stringify({ success: true }));
  });

  it('should handle query parameters', async () => {
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/test?foo=bar&baz=qux',
        path: '/test',
        query: { foo: 'bar', baz: 'qux' },
        header: () => ({
          'content-type': 'application/json'
        })
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json'
        })
      });
    };

    await harRecorder(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries[0].request.queryString).toEqual([
      { name: 'foo', value: 'bar' },
      { name: 'baz', value: 'qux' }
    ]);
  });

  it('should handle request headers', async () => {
    const store = new Map<string, any>();
    const customHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'x-custom-header': 'test-value'
    };

    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/test',
        path: '/test',
        query: {},
        header: () => customHeaders
      },
      header: (name?: string) => name ? customHeaders[name] : customHeaders,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json'
        })
      });
    };

    await harRecorder(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries[0].request.headers).toContainEqual({
      name: 'x-custom-header',
      value: 'test-value'
    });
  });

  it('should handle response headers', async () => {
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/test',
        path: '/test',
        query: {},
        header: () => ({
          'content-type': 'application/json'
        })
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-custom-response': 'test-value'
        })
      });
    };

    await harRecorder(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries[0].response.headers).toContainEqual({
      name: 'x-custom-response',
      value: 'test-value'
    });
  });
}); 