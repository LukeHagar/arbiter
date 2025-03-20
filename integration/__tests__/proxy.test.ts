import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { startServers } from '../../src/server.js';
import fetch, { RequestInit } from 'node-fetch';
import { OpenAPIV3_1 } from 'openapi-types';

interface HAREntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: {
      text: string;
      mimeType: string;
    };
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
    content: {
      text: string;
      mimeType: string;
    };
  };
}

interface HAR {
  log: {
    entries: HAREntry[];
  };
}

interface User {
  id: number;
  name: string;
}

describe('Arbiter Integration Tests', () => {
  const targetPort = 3001;
  const proxyPort = 3002;
  const docsPort = 3003;
  
  let targetServer: any;
  let proxyServer: any;
  let docsServer: any;

  // Create a mock target API
  const targetApi = new Hono();
  
  // Setup test endpoints
  targetApi.get('/users', (c) => {
    return c.json([
      { id: 1, name: 'John Doe' },
      { id: 2, name: 'Jane Smith' }
    ]);
  });

  targetApi.post('/users', async (c) => {
    const body = await c.req.json();
    return c.json({ id: 3, ...body }, 201);
  });

  targetApi.get('/users/:id', (c) => {
    const id = c.req.param('id');
    return c.json({ id: parseInt(id), name: 'John Doe' });
  });

  targetApi.get('/secure', (c) => {
    const apiKey = c.req.header('x-api-key');
    if (apiKey !== 'test-key') {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return c.json({ message: 'Secret data' });
  });

  beforeAll(async () => {
    // Start the target API server
    targetServer = serve({
      fetch: targetApi.fetch,
      port: targetPort
    });

    // Start Arbiter servers
    const servers = await startServers({
      target: `http://localhost:${targetPort}`,
      proxyPort,
      docsPort,
      verbose: false
    });

    proxyServer = servers.proxyServer;
    docsServer = servers.docsServer;

    // Wait a bit to ensure servers are ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(() => {
    targetServer?.close();
    proxyServer?.close();
    docsServer?.close();
  });

  it('should proxy basic GET request and record in HAR', async () => {
    const response = await fetch(`http://localhost:${proxyPort}/users`);
    expect(response.status).toBe(200);
    
    const users = await response.json() as User[];
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('John Doe');

    // Check HAR recording
    const harResponse = await fetch(`http://localhost:${docsPort}/har`);
    const har = await harResponse.json() as HAR;
    
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.method).toBe('GET');
    expect(har.log.entries[0].request.url).toBe(`http://localhost:${targetPort}/users`);
    expect(har.log.entries[0].response.status).toBe(200);
  });

  it('should record POST request with body in HAR', async () => {
    const response = await fetch(`http://localhost:${proxyPort}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Bob Wilson' })
    });
    
    expect(response.status).toBe(201);
    const newUser = await response.json() as User;
    expect(newUser.name).toBe('Bob Wilson');

    // Check HAR recording
    const harResponse = await fetch(`http://localhost:${docsPort}/har`);
    const har = await harResponse.json() as HAR;
    
    const postEntry = har.log.entries.find(e => e.request.method === 'POST');
    expect(postEntry).toBeDefined();
    expect(postEntry?.request.postData?.text).toBe(JSON.stringify({ name: 'Bob Wilson' }));
    expect(postEntry?.response.status).toBe(201);
  });

  it('should generate OpenAPI spec with paths and schemas', async () => {
    // Make some requests to generate OpenAPI spec
    await fetch(`http://localhost:${proxyPort}/users`);
    await fetch(`http://localhost:${proxyPort}/users/1`);
    await fetch(`http://localhost:${proxyPort}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User' })
    });

    // Get OpenAPI spec
    const specResponse = await fetch(`http://localhost:${docsPort}/openapi.json`);
    const spec = await specResponse.json() as OpenAPIV3_1.Document;

    // Validate paths
    expect(spec.paths?.['/users']).toBeDefined();
    expect(spec.paths?.['/users']?.get).toBeDefined();
    expect(spec.paths?.['/users']?.post).toBeDefined();
    expect(spec.paths?.['/users/{id}']?.get).toBeDefined();

    // Validate schemas
    expect(spec.components?.schemas).toBeDefined();
    const userSchema = spec.components?.schemas?.User as OpenAPIV3_1.SchemaObject;
    expect(userSchema).toBeDefined();
    expect(userSchema.properties?.id).toBeDefined();
    expect(userSchema.properties?.name).toBeDefined();
  });

  it('should handle query parameters', async () => {
    await fetch(`http://localhost:${proxyPort}/users?limit=10&offset=0`);

    const harResponse = await fetch(`http://localhost:${docsPort}/har`);
    const har = await harResponse.json() as HAR;
    
    const entry = har.log.entries.find(e => e.request.url.includes('?limit=10'));
    expect(entry).toBeDefined();
    expect(entry?.request.queryString).toEqual([
      { name: 'limit', value: '10' },
      { name: 'offset', value: '0' }
    ]);

    const specResponse = await fetch(`http://localhost:${docsPort}/openapi.json`);
    const spec = await specResponse.json() as OpenAPIV3_1.Document;
    
    const parameters = spec.paths?.['/users']?.get?.parameters as OpenAPIV3_1.ParameterObject[];
    expect(parameters).toBeDefined();
    expect(parameters).toContainEqual({
      name: 'limit',
      in: 'query',
      schema: { type: 'string' }
    });
  });

  it('should handle security schemes', async () => {
    await fetch(`http://localhost:${proxyPort}/secure`, {
      headers: {
        'x-api-key': 'test-key'
      }
    });

    const specResponse = await fetch(`http://localhost:${docsPort}/openapi.json`);
    const spec = await specResponse.json() as OpenAPIV3_1.Document;

    // Check security scheme definition
    expect(spec.components?.securitySchemes).toBeDefined();
    const apiKeyAuth = spec.components?.securitySchemes?.apiKey_ as OpenAPIV3_1.ApiKeySecurityScheme;
    expect(apiKeyAuth).toBeDefined();
    expect(apiKeyAuth.type).toBe('apiKey');
    expect(apiKeyAuth.in).toBe('header');
    expect(apiKeyAuth.name).toBe('x-api-key');

    // Check security requirement on endpoint
    const securityRequirements = spec.paths?.['/secure']?.get?.security;
    expect(securityRequirements).toBeDefined();
    expect(securityRequirements).toContainEqual({
      apiKey_: []
    });
  });
}); 