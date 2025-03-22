import type { Context, Next } from 'hono';
import type { OpenAPIStore } from '../store/openApiStore.js';
export declare function apiDocGenerator(store: OpenAPIStore): (c: Context, next: Next) => Promise<void>;
