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

    // Get request details
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

    // Record the endpoint in OpenAPI format
    try {
      store.recordEndpoint(
        c.req.path,
        c.req.method.toLowerCase(),
        {
          query: queryParams,
          headers: requestHeaders,
          contentType: c.req.header('content-type') || 'application/json',
        },
        {
          status: c.res.status,
          contentType: c.res.headers.get('content-type') || 'application/json',
          headers: Object.fromEntries(c.res.headers.entries()),
        }
      );
    } catch (error) {
      console.error('Error recording endpoint:', error);
    }
  };
}
