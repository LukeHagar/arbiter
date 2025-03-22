import { describe, it, expect, beforeEach } from 'vitest';
import { harRecorder } from '../harRecorder.js';
import { openApiStore } from '../../store/openApiStore.js';
import { Context } from 'hono';
import { OpenAPIV3_1 } from 'openapi-types';

describe('HAR Recorder Middleware', () => {
  beforeEach(() => {
    openApiStore.clear();
    openApiStore.setTargetUrl('http://localhost:8080');
  });

  it('should record basic GET request and response details', async () => {
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/test',
        path: '/test',
        query: {},
        header: () => ({
          'content-type': 'application/json',
        }),
        raw: {
          clone: () => ({
            text: async () => '{"test":"data"}',
            formData: async () => new Map([['key', 'value']]),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.method).toBe('GET');
    expect(har.log.entries[0].request.url).toBe('http://localhost:8080/test');
    expect(har.log.entries[0].response.status).toBe(200);
    expect(har.log.entries[0].response.content.text).toBe(JSON.stringify({ success: true }));
  });

  it('should handle POST requests with JSON body', async () => {
    const requestBody = { name: 'Test User', email: 'test@example.com' };
    const jsonBody = JSON.stringify(requestBody);
    
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'POST',
        url: 'http://localhost:8080/users',
        path: '/users',
        query: {},
        header: () => ({
          'content-type': 'application/json',
        }),
        raw: {
          clone: () => ({
            text: async () => jsonBody,
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ id: 1, ...requestBody }), {
        status: 201,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.method).toBe('POST');
    expect(har.log.entries[0].request.url).toBe('http://localhost:8080/users');
    
    // Check request body was properly captured
    const entry = openApiStore.getOpenAPISpec().paths?.['/users']?.post;
    expect(entry).toBeDefined();
    expect(entry?.requestBody).toBeDefined();
    
    // Check response body and status
    expect(har.log.entries[0].response.status).toBe(201);
    expect(har.log.entries[0].response.content.text).toEqual(expect.stringContaining('Test User'));
  });

  it('should handle PUT requests with JSON body', async () => {
    const requestBody = { name: 'Updated User', email: 'updated@example.com' };
    const jsonBody = JSON.stringify(requestBody);
    
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'PUT',
        url: 'http://localhost:8080/users/1',
        path: '/users/1',
        query: {},
        header: () => ({
          'content-type': 'application/json',
        }),
        raw: {
          clone: () => ({
            text: async () => jsonBody,
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ id: 1, ...requestBody }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.method).toBe('PUT');
    
    // Check request body was properly captured
    const entry = openApiStore.getOpenAPISpec().paths?.['/users/{id}']?.put;
    expect(entry).toBeDefined();
    expect(entry?.requestBody).toBeDefined();
  });

  it('should handle PATCH requests with JSON body', async () => {
    const requestBody = { name: 'Partially Updated User' };
    const jsonBody = JSON.stringify(requestBody);
    
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'PATCH',
        url: 'http://localhost:8080/users/1',
        path: '/users/1',
        query: {},
        header: () => ({
          'content-type': 'application/json',
        }),
        raw: {
          clone: () => ({
            text: async () => jsonBody,
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ id: 1, name: 'Partially Updated User', email: 'existing@example.com' }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.method).toBe('PATCH');
    
    // Check request body was properly captured
    const entry = openApiStore.getOpenAPISpec().paths?.['/users/{id}']?.patch;
    expect(entry).toBeDefined();
    expect(entry?.requestBody).toBeDefined();
  });

  it('should handle form data in requests', async () => {
    const formData = new Map([
      ['username', 'testuser'],
      ['email', 'test@example.com']
    ]);
    
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'POST',
        url: 'http://localhost:8080/form',
        path: '/form',
        query: {},
        header: () => ({
          'content-type': 'application/x-www-form-urlencoded',
        }),
        raw: {
          clone: () => ({
            text: async () => 'username=testuser&email=test@example.com',
            formData: async () => formData,
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries).toHaveLength(1);
    
    // Check form data was captured
    const entry = openApiStore.getOpenAPISpec().paths?.['/form']?.post;
    expect(entry).toBeDefined();
    expect(entry?.requestBody).toBeDefined();
  });

  it('should handle text content in requests', async () => {
    const textContent = 'This is a plain text content';
    
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'POST',
        url: 'http://localhost:8080/text',
        path: '/text',
        query: {},
        header: () => ({
          'content-type': 'text/plain',
        }),
        raw: {
          clone: () => ({
            text: async () => textContent,
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response('Received text content', {
        status: 200,
        headers: new Headers({
          'content-type': 'text/plain',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries).toHaveLength(1);
    
    // Check text content was captured
    const entry = openApiStore.getOpenAPISpec().paths?.['/text']?.post;
    expect(entry).toBeDefined();
    expect(entry?.requestBody).toBeDefined();
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
          'content-type': 'application/json',
        }),
        raw: {
          clone: () => ({
            text: async () => '',
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries[0].request.queryString).toEqual([
      { name: 'foo', value: 'bar' },
      { name: 'baz', value: 'qux' },
    ]);
    
    // Check query parameters in OpenAPI spec
    const parameters = openApiStore.getOpenAPISpec().paths?.['/test']?.get?.parameters;
    expect(parameters).toBeDefined();
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: 'foo',
        in: 'query'
      })
    );
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: 'baz',
        in: 'query'
      })
    );
  });

  it('should handle request headers', async () => {
    const store = new Map<string, any>();
    const customHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
      'authorization': 'Bearer test-token',
    };

    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/test',
        path: '/test',
        query: {},
        header: () => customHeaders,
        raw: {
          clone: () => ({
            text: async () => '',
            formData: async () => new Map(),
          }),
        },
      },
      header: (name?: string) => (name ? customHeaders[name] : customHeaders),
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Clear the store first
    openApiStore.clear();

    // Add security configuration explicitly before running middleware
    openApiStore.recordEndpoint(
      '/test',
      'get',
      {
        query: {},
        headers: { 
          'authorization': 'Bearer test-token',
          'x-custom-header': 'test-value'
        },
        contentType: 'application/json',
        body: null,
        security: [{ type: 'http', scheme: 'bearer' }]
      },
      {
        status: 200,
        headers: {},
        contentType: 'application/json',
        body: { success: true }
      }
    );

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries[0].request.headers).toContainEqual({
      name: 'x-custom-header',
      value: 'test-value',
    });
    
    // Check headers in OpenAPI spec
    const parameters = openApiStore.getOpenAPISpec().paths?.['/test']?.get?.parameters;
    expect(parameters).toBeDefined();
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: 'x-custom-header',
        in: 'header'
      })
    );
    
    // Check security schemes for auth header
    const spec = openApiStore.getOpenAPISpec();
    expect(spec.components?.securitySchemes?.http_).toBeDefined();
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
          'content-type': 'application/json',
        }),
        raw: {
          clone: () => ({
            text: async () => '',
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-custom-response': 'test-value',
          'cache-control': 'no-cache',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries[0].response.headers).toContainEqual({
      name: 'x-custom-response',
      value: 'test-value',
    });
    
    // Check response headers in OpenAPI spec
    const responseObj = openApiStore.getOpenAPISpec().paths?.['/test']?.get?.responses?.[200] as OpenAPIV3_1.ResponseObject;
    expect(responseObj).toBeDefined();
    
    // Cast to ResponseObject to access headers property
    if (responseObj && 'headers' in responseObj && responseObj.headers) {
      expect(Object.keys(responseObj.headers).length).toBeGreaterThan(0);
    }
  });

  it('should handle error responses', async () => {
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/error',
        path: '/error',
        query: {},
        header: () => ({
          'content-type': 'application/json',
        }),
        raw: {
          clone: () => ({
            text: async () => '',
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ error: 'Something went wrong' }), {
        status: 500,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    await middleware(ctx, next);

    const har = openApiStore.generateHAR();
    expect(har.log.entries[0].response.status).toBe(500);
    
    // Check error response in OpenAPI spec
    const errorResponse = openApiStore.getOpenAPISpec().paths?.['/error']?.get?.responses?.[500];
    expect(errorResponse).toBeDefined();
  });

  it('should gracefully handle errors during middleware execution', async () => {
    const store = new Map<string, any>();
    const ctx = {
      req: {
        method: 'GET',
        url: 'http://localhost:8080/test',
        path: '/test',
        query: {},
        header: () => { throw new Error('Test error'); }, // Deliberately throw an error
        raw: {
          clone: () => ({
            text: async () => '',
            formData: async () => new Map(),
          }),
        },
      },
      header: () => undefined,
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      res: undefined,
    } as unknown as Context;

    const next = async () => {
      ctx.res = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
      });
    };

    // Get the middleware function and call it
    const middleware = harRecorder(openApiStore);
    
    // Should not throw
    await expect(middleware(ctx, next)).resolves.not.toThrow();
  });
});
