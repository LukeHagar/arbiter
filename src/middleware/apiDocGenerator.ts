import type { Context, Next } from 'hono';
import type { OpenAPIStore } from '../store/openApiStore.js';

export function apiDocGenerator(store: OpenAPIStore): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    const startTime = Date.now();

    try {
      await next();
    } catch (error) {
      console.error('Error in apiDocGenerator middleware:', error);
      throw error;
    }

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Record the request/response in OpenAPI format
    try {
      const url = new URL(c.req.url);
      const queryParams: Record<string, string> = {};
      for (const [key, value] of url.searchParams.entries()) {
        queryParams[key] = value;
      }

      // Get request headers
      const requestHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(c.req.header())) {
        if (typeof value === 'string') {
          requestHeaders[key] = value;
        }
      }

      // Get response headers
      const responseHeaders: Record<string, string> = {};
      if (c.res) {
        for (const [key, value] of c.res.headers.entries()) {
          responseHeaders[key] = value;
        }
      }

      // Record the endpoint
      store.recordEndpoint(
        c.req.path,
        c.req.method.toLowerCase(),
        {
          query: queryParams,
          headers: requestHeaders,
          contentType: c.req.header('content-type') || 'application/json',
          body: undefined, // We'll need to handle body parsing if needed
        },
        {
          status: c.res?.status || 500,
          headers: responseHeaders,
          contentType: c.res?.headers.get('content-type') || 'application/json',
          body: c.res ? await c.res.clone().text() : '',
        }
      );
    } catch (error) {
      console.error('Error recording OpenAPI entry:', error);
    }
  };
}
