import type { Context, Next } from 'hono';
import type { OpenAPIStore } from '../store/openApiStore.js';

export function harRecorder(store: OpenAPIStore): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    const startTime = Date.now();

    // Get a clone of the request body before processing if it's a POST/PUT/PATCH
    let requestBody: any = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      try {
        // Clone the request body based on content type
        const contentType = c.req.header('content-type') || '';

        // Create a copy of the request to avoid consuming the body
        const reqClone = c.req.raw.clone();

        if (typeof contentType === 'string' && contentType.includes('application/json')) {
          const text = await reqClone.text();
          try {
            requestBody = JSON.parse(text);
          } catch (e) {
            requestBody = text; // Keep as text if JSON parsing fails
          }
        } else if (
          typeof contentType === 'string' &&
          contentType.includes('application/x-www-form-urlencoded')
        ) {
          const formData = await reqClone.formData();
          requestBody = Object.fromEntries(formData);
        } else if (typeof contentType === 'string' && contentType.includes('text/')) {
          requestBody = await reqClone.text();
        } else {
          requestBody = await reqClone.text();
        }
      } catch (e) {
        console.error('Error cloning request body:', e);
      }
    }

    try {
      await next();
    } catch (error) {
      console.error('Error in harRecorder middleware:', error);
      throw error;
    }

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Record the request/response in HAR format
    try {
      const url = new URL(c.req.url);
      const queryParams: Record<string, string> = {};
      for (const [key, value] of url.searchParams.entries()) {
        queryParams[key] = value;
      }

      // Get request headers
      const requestHeaders: Record<string, string> = {};
      if (c.req.header) {
        const headers = c.req.header();
        if (headers && typeof headers === 'object') {
          for (const [key, value] of Object.entries(headers)) {
            if (typeof value === 'string') {
              requestHeaders[key] = value;
            }
          }
        }
      }

      // Get response headers
      const responseHeaders: Record<string, string> = {};
      if (c.res) {
        for (const [key, value] of c.res.headers.entries()) {
          responseHeaders[key] = value;
        }
      }

      // For response body, try to get content from the response
      let responseBody: any = {};
      try {
        if (c.res) {
          // Clone the response to avoid consuming the body
          const resClone = c.res.clone();
          const contentType = c.res.headers.get('content-type') || '';

          if (typeof contentType === 'string' && contentType.includes('application/json')) {
            const text = await resClone.text();
            try {
              responseBody = JSON.parse(text);
            } catch (e) {
              responseBody = text;
            }
          } else if (typeof contentType === 'string' && contentType.includes('text/')) {
            responseBody = await resClone.text();
          }
        }
      } catch (e) {
        console.error('Error getting response body:', e);
      }

      // Record the endpoint
      store.recordEndpoint(
        c.req.path,
        c.req.method.toLowerCase(),
        {
          query: queryParams,
          headers: requestHeaders,
          contentType: c.req.header('content-type') || 'application/json',
          body: requestBody, // Use the captured request body
        },
        {
          status: c.res?.status || 500,
          headers: responseHeaders,
          contentType: c.res?.headers.get('content-type') || 'application/json',
          body: responseBody, // Now using captured response body
        }
      );
    } catch (error) {
      console.error('Error recording HAR entry:', error);
    }
  };
}
