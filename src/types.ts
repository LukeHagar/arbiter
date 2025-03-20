import type { Hono } from 'hono';

export interface ServerConfig {
  fetch: Hono['fetch'];
  port: number;
}
