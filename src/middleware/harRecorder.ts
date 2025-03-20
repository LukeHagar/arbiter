import { Context, Next } from 'hono';
import { openApiStore } from '../store/openApiStore.js';
import { SecurityInfo } from '../store/openApiStore.js';

interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    content: {
      size: number;
      mimeType: string;
      text: string;
    };
  };
}

export async function harRecorder(c: Context, next: Next) {
  const startTime = Date.now();

  // Get request body if present
  let requestBody: any;
  const contentType = c.req.header('content-type') || 'application/json';
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    try {
      const body = await c.req.text();
      if (contentType.includes('application/json')) {
        requestBody = JSON.parse(body);
      } else {
        requestBody = body;
      }
    } catch (e) {
      // Body might not be valid JSON or might be empty
      requestBody = undefined;
    }
  }

  // Get query parameters from URL
  const url = new URL(c.req.url);
  const queryParams: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    queryParams[key] = value;
  }

  // Get all request headers
  const requestHeaders: Record<string, string> = {};
  Object.entries(c.req.header()).forEach(([key, value]) => {
    if (typeof value === 'string') {
      requestHeaders[key] = value;
    }
  });

  // Check for security schemes
  const security: SecurityInfo[] = [];
  const apiKey = c.req.header('x-api-key');
  if (apiKey) {
    security.push({
      type: 'apiKey',
      name: 'x-api-key',
      in: 'header',
    });
  }

  // Call next middleware
  await next();

  // Calculate response time
  const responseTime = Date.now() - startTime;

  // Get response body
  let responseBody: any;
  const responseContentType = c.res.headers.get('content-type') || 'application/json';
  try {
    const body = await c.res.clone().text();
    if (responseContentType.includes('application/json')) {
      responseBody = JSON.parse(body);
    } else {
      responseBody = body;
    }
  } catch (e) {
    // Response body might not be valid JSON or might be empty
    responseBody = undefined;
  }

  // Record the request/response in OpenAPI format
  openApiStore.recordEndpoint(
    c.req.path,
    c.req.method.toLowerCase(),
    {
      query: queryParams,
      body: requestBody,
      contentType,
      headers: requestHeaders,
      security,
    },
    {
      status: c.res.status,
      body: responseBody,
      contentType: responseContentType,
      headers: Object.fromEntries(c.res.headers.entries()),
    }
  );

  // Set HAR data in context
  c.set('har', openApiStore.generateHAR());
}
