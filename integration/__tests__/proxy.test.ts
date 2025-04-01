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
  // Use different ports to avoid conflicts with other tests
  const targetPort = 4001;
  const proxyPort = 4002;
  const docsPort = 4003;

  let targetServer: any;
  let proxyServer: any;
  let docsServer: any;

  // Create a mock target API
  const targetApi = new Hono();

  // Setup test endpoints
  targetApi.get('/users', (c) => {
    return c.json([
      { id: 1, name: 'John Doe' },
      { id: 2, name: 'Jane Smith' },
    ]);
  });

  targetApi.post('/users', async (c) => {
    const body = await c.req.json();
    c.status(201);
    return c.json({ id: 3, ...body });
  });

  targetApi.get('/users/:id', (c) => {
    const id = c.req.param('id');
    return c.json({ id: parseInt(id), name: 'John Doe' });
  });

  targetApi.get('/secure', (c) => {
    const apiKey = c.req.header('x-api-key');
    if (apiKey !== 'test-key') {
      c.status(401);
      return c.json({ error: 'Unauthorized' });
    }
    return c.json({ message: 'Secret data' });
  });

  // Add endpoint for query parameter test
  targetApi.get('/users/search', (c) => {
    const limit = c.req.query('limit');
    const sort = c.req.query('sort');
    return c.json({
      results: [{ id: 1, name: 'John Doe' }],
      limit: limit ? parseInt(limit) : 10,
      sort: sort || 'asc',
    });
  });

  beforeAll(async () => {
    // Start the target API server
    targetServer = serve({
      fetch: targetApi.fetch,
      port: targetPort,
    });

    // Start Arbiter servers
    const { proxyServer: proxy, docsServer: docs } = await startServers({
      target: `http://localhost:${targetPort}`,
      proxyPort: proxyPort,
      docsPort: docsPort,
      verbose: false,
    });

    proxyServer = proxy;
    docsServer = docs;
  });

  afterAll(() => {
    targetServer?.close();
    proxyServer?.close();
    docsServer?.close();
  });

  it('should proxy basic GET request and record in HAR', async () => {
    const response = await fetch(`http://localhost:${proxyPort}/users`);
    expect(response.status).toBe(200);

    const users = (await response.json()) as User[];
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('John Doe');

    // Check HAR recording
    const harResponse = await fetch(`http://localhost:${docsPort}/har`);
    const har = (await harResponse.json()) as HAR;

    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.method).toBe('GET');
    expect(har.log.entries[0].request.url).toBe(`http://localhost:${targetPort}/users`);
    expect(har.log.entries[0].response.status).toBe(200);
  });

  it('should record POST request with body in HAR', async () => {
    const response = await fetch(`http://localhost:${proxyPort}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Bob Wilson' }),
    });

    expect(response.status).toBe(201);
    const newUser = (await response.json()) as User;
    expect(newUser.name).toBe('Bob Wilson');

    // Check HAR recording
    const harResponse = await fetch(`http://localhost:${docsPort}/har`);
    const har = (await harResponse.json()) as HAR;

    const postEntry = har.log.entries.find((e) => e.request.method === 'POST');
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
      body: JSON.stringify({ name: 'Test User' }),
    });

    // Get OpenAPI spec
    const specResponse = await fetch(`http://localhost:${docsPort}/openapi.json`);
    const spec = (await specResponse.json()) as OpenAPIV3_1.Document;

    // Validate paths
    expect(spec.paths?.['/users']).toBeDefined();
    expect(spec.paths?.['/users']?.get).toBeDefined();
    expect(spec.paths?.['/users']?.post).toBeDefined();
    expect(spec.paths?.['/users/{id}']?.get).toBeDefined();

    // Check request body schema
    expect(spec.paths?.['/users']?.post?.requestBody).toBeDefined();
    const requestBody = spec.paths?.['/users']?.post?.requestBody as OpenAPIV3_1.RequestBodyObject;
    expect(requestBody.content?.['application/json']).toBeDefined();
    expect(requestBody.content?.['application/json'].schema).toBeDefined();

    // Validate schema properties based on what we sent in the POST request
    const schema = requestBody.content?.['application/json'].schema as OpenAPIV3_1.SchemaObject;
    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
    expect(schema.properties?.name).toBeDefined();
    expect((schema.properties?.name as OpenAPIV3_1.SchemaObject).type).toBe('string');
  });

  it('should handle query parameters', async () => {
    await fetch(`http://localhost:${proxyPort}/users?limit=10&offset=0`);

    const harResponse = await fetch(`http://localhost:${docsPort}/har`);
    const har = (await harResponse.json()) as HAR;

    const entry = har.log.entries.find((e) => e.request.url.includes('?limit=10'));
    expect(entry).toBeDefined();
    expect(entry?.request.queryString).toEqual([
      { name: 'limit', value: '10' },
      { name: 'offset', value: '0' },
    ]);

    const specResponse = await fetch(`http://localhost:${docsPort}/openapi.json`);
    const spec = (await specResponse.json()) as OpenAPIV3_1.Document;

    const parameters = spec.paths?.['/users']?.get?.parameters as OpenAPIV3_1.ParameterObject[];
    expect(parameters).toBeDefined();
    expect(parameters).toContainEqual({
      name: 'limit',
      in: 'query',
      schema: { type: 'string' },
    });
  });

  it('should handle security schemes', async () => {
    await fetch(`http://localhost:${proxyPort}/secure`, {
      headers: {
        'x-api-key': 'test-key',
      },
    });

    const specResponse = await fetch(`http://localhost:${docsPort}/openapi.json`);
    const spec = (await specResponse.json()) as OpenAPIV3_1.Document;

    // Check security scheme definition
    expect(spec.components?.securitySchemes).toBeDefined();
    const apiKeyAuth = spec.components?.securitySchemes
      ?.apiKey_ as OpenAPIV3_1.ApiKeySecurityScheme;
    expect(apiKeyAuth).toBeDefined();
    expect(apiKeyAuth.type).toBe('apiKey');
    expect(apiKeyAuth.in).toBe('header');
    expect(apiKeyAuth.name).toBe('x-api-key');

    // Check security requirement on endpoint
    const securityRequirements = spec.paths?.['/secure']?.get?.security;
    expect(securityRequirements).toBeDefined();
    expect(securityRequirements).toContainEqual({
      apiKey_: [],
    });
  });
});
