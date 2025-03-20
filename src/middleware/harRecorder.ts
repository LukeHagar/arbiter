import type { Context, Next } from 'hono';
import type { OpenAPIStore } from '../store/openApiStore.js';
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

export function harRecorder(store: OpenAPIStore): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    const startTime = Date.now();
    
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
      store.recordHAREntry({
        request: c.req.raw,
        response: c.res,
        timing: {
          wait: responseTime,
          receive: 0,
          send: 0,
        },
      });
    } catch (error) {
      console.error('Error recording HAR entry:', error);
    }
  };
}
