import type { Context, Next } from 'hono';
import type { OpenAPIStore } from '../store/openApiStore.js';
export declare function harRecorder(store: OpenAPIStore): (c: Context, next: Next) => Promise<void>;
