import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import httpProxy from 'http-proxy';
import { Context } from 'hono';
import { openApiStore } from './store/openApiStore.js';
import { IncomingMessage, ServerResponse, createServer, Server } from 'node:http';
import { Agent } from 'node:https';
import chalk from 'chalk';

export interface ServerOptions {
  target: string;
  proxyPort: number;
  docsPort: number;
  verbose?: boolean;
}

export async function startServers(
  options: ServerOptions
): Promise<{ proxyServer: Server; docsServer: Server }> {
  // Set the target URL in the OpenAPI store
  openApiStore.setTargetUrl(options.target);

  // Create two separate Hono apps
  const proxyApp = new Hono();
  const docsApp = new Hono();

  // Create proxy server
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: false,
    selfHandleResponse: true,
    target: options.target,
    headers: {
      Host: new URL(options.target).host,
    },
    agent: new Agent({
      rejectUnauthorized: false,
    }),
  });

  // Set up error handlers
  proxy.on('error', (err) => {
    console.error('Proxy error:', err);
  });

  proxy.on('proxyReq', (proxyReq, req, res) => {
    // Ensure we're using the correct protocol
    proxyReq.protocol = new URL(options.target).protocol;
  });

  // Middleware for both apps
  if (options.verbose) {
    proxyApp.use('*', logger());
    docsApp.use('*', logger());
  }
  proxyApp.use('*', cors());
  proxyApp.use('*', prettyJSON());
  docsApp.use('*', cors());
  docsApp.use('*', prettyJSON());

  // Documentation endpoints
  docsApp.get('/docs', async (c: Context) => {
    const spec = openApiStore.getOpenAPISpec();
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>API Documentation</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body>
          <script
            id="api-reference"
            data-url="/openapi.json"
            data-proxy-url="https://proxy.scalar.com"></script>

          <script>
            var configuration = {
              theme: 'light',
              title: 'API Documentation'
            }

            document.getElementById('api-reference').dataset.configuration =
              JSON.stringify(configuration)
          </script>

          <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
        </body>
      </html>
    `);
  });
  docsApp.get('/openapi.json', (c: Context) => {
    return c.json(openApiStore.getOpenAPISpec());
  });
  docsApp.get('/openapi.yaml', (c: Context) => {
    return c.text(openApiStore.getOpenAPISpecAsYAML());
  });
  docsApp.get('/har', (c: Context) => {
    return c.json(openApiStore.generateHAR());
  });

  // Proxy all requests
  proxyApp.all('*', async (c: Context) => {
    let requestBody: any;
    let responseBody: any;

    // Get request body if present
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      try {
        requestBody = await c.req.json();
      } catch (e) {
        // Body might not be JSON
        requestBody = await c.req.text();
      }
    }

    try {
      // Create a new request object with the target URL
      const targetUrl = new URL(c.req.path, options.target);
      // Copy query parameters
      const originalUrl = new URL(c.req.url);
      originalUrl.searchParams.forEach((value, key) => {
        targetUrl.searchParams.append(key, value);
      });

      const proxyReq = new Request(targetUrl.toString(), {
        method: c.req.method,
        headers: new Headers({
          'content-type': c.req.header('content-type') || 'application/json',
          accept: c.req.header('accept') || 'application/json',
          ...Object.fromEntries(
            Object.entries(c.req.header()).filter(
              ([key]) => !['content-type', 'accept'].includes(key.toLowerCase())
            )
          ),
        }),
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? requestBody : undefined,
      });

      // Forward the request to the target server
      const proxyRes = await fetch(proxyReq);

      // Get response body
      const contentType = proxyRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseBody = await proxyRes.json();
      } else {
        responseBody = await proxyRes.text();
      }

      // Record the API call in OpenAPI format
      openApiStore.recordEndpoint(
        c.req.path,
        c.req.method.toLowerCase(),
        {
          query: Object.fromEntries(new URL(c.req.url).searchParams),
          body: requestBody,
          contentType: c.req.header('content-type') || 'application/json',
          headers: Object.fromEntries(Object.entries(c.req.header())),
        },
        {
          status: proxyRes.status,
          body: responseBody,
          contentType: proxyRes.headers.get('content-type') || 'application/json',
          headers: Object.fromEntries(proxyRes.headers.entries()),
        }
      );

      // Create a new response with the correct content type and body
      return new Response(JSON.stringify(responseBody), {
        status: proxyRes.status,
        headers: Object.fromEntries(proxyRes.headers.entries()),
      });
    } catch (error: any) {
      console.error('Proxy request failed:', error);
      return c.json({ error: 'Proxy error', details: error.message }, 500);
    }
  });

  // Function to check if a port is available
  async function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer()
        .once('error', () => {
          resolve(false);
        })
        .once('listening', () => {
          server.close();
          resolve(true);
        })
        .listen(port);
    });
  }

  // Function to find an available port
  async function findAvailablePort(startPort: number): Promise<number> {
    let port = startPort;
    while (!(await isPortAvailable(port))) {
      port++;
    }
    return port;
  }

  // Start servers
  const availableProxyPort = await findAvailablePort(options.proxyPort);
  const availableDocsPort = await findAvailablePort(options.docsPort);

  if (availableProxyPort !== options.proxyPort) {
    console.log(
      chalk.yellow(`Port ${options.proxyPort} is in use, using port ${availableProxyPort} instead`)
    );
  }
  if (availableDocsPort !== options.docsPort) {
    console.log(
      chalk.yellow(`Port ${options.docsPort} is in use, using port ${availableDocsPort} instead`)
    );
  }

  console.log(chalk.blue(`Starting proxy server on port ${availableProxyPort}...`));
  console.log(chalk.gray(`Proxying requests to: ${options.target}`));
  console.log(chalk.blue(`Starting documentation server on port ${availableDocsPort}...`));

  const proxyServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${availableProxyPort}`);

      // Read the request body if present
      let body: string | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        body = await new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks).toString()));
          req.on('error', reject);
        });
      }

      // Create headers without content-length (will be added automatically)
      const headers = { ...req.headers } as Record<string, string>;
      delete headers['content-length'];

      const request = new Request(url.toString(), {
        method: req.method || 'GET',
        headers,
        body: body,
        duplex: 'half',
      });

      // Forward the request to the target server
      const targetUrl = new URL(req.url || '/', options.target);
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: body,
        duplex: 'half',
      });

      // Get response body
      let responseBody: any;
      const contentType = response.headers.get('content-type') || '';
      const responseText = await response.text();
      if (contentType.includes('application/json')) {
        try {
          responseBody = JSON.parse(responseText);
        } catch (e) {
          responseBody = responseText;
        }
      } else {
        responseBody = responseText;
      }

      // Record the API call in OpenAPI format
      openApiStore.recordEndpoint(
        decodeURIComponent(url.pathname),
        (req.method || 'GET').toLowerCase(),
        {
          query: Object.fromEntries(url.searchParams),
          body: body ? JSON.parse(body) : undefined,
          contentType: headers['content-type'] || 'application/json',
          headers,
          security: headers['x-api-key']
            ? [
                {
                  type: 'apiKey',
                  name: 'x-api-key',
                  in: 'header',
                },
              ]
            : undefined,
        },
        {
          status: response.status,
          body: responseBody,
          contentType: contentType || 'application/json',
          headers: Object.fromEntries(response.headers.entries()),
        }
      );

      res.statusCode = response.status;
      res.statusMessage = response.statusText;

      // Copy all headers from the response
      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }

      // Send the response body
      res.end(responseText);
    } catch (error: any) {
      console.error('Proxy request failed:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Proxy error', details: error.message }));
    }
  });

  const docsServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${availableDocsPort}`);
      const request = new Request(url.toString(), {
        method: req.method || 'GET',
        headers: req.headers as Record<string, string>,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      });

      const response = await docsApp.fetch(request);
      res.statusCode = response.status;
      res.statusMessage = response.statusText;

      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (error: any) {
      console.error('Documentation request failed:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Documentation error', details: error.message }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(availableProxyPort, '0.0.0.0', () => {
      console.log(chalk.green(`✓ Proxy server running on port ${availableProxyPort}`));
      resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    docsServer.once('error', reject);
    docsServer.listen(availableDocsPort, '0.0.0.0', () => {
      console.log(chalk.green(`✓ Documentation server running on port ${availableDocsPort}`));
      resolve();
    });
  });

  // Print startup message
  console.log('\n' + chalk.green('Arbiter is running! 🚀'));
  console.log('\n' + chalk.bold('Proxy Server:'));
  console.log(chalk.cyan(`  URL: http://localhost:${availableProxyPort}`));
  console.log(chalk.gray(`  Target: ${options.target}`));
  console.log('\n' + chalk.bold('Documentation:'));
  console.log(chalk.cyan(`  API Reference: http://localhost:${availableDocsPort}/docs`));
  console.log('\n' + chalk.bold('Exports:'));
  console.log(chalk.cyan(`  HAR Export: http://localhost:${availableDocsPort}/har`));
  console.log(chalk.cyan(`  OpenAPI JSON: http://localhost:${availableDocsPort}/openapi.json`));
  console.log(chalk.cyan(`  OpenAPI YAML: http://localhost:${availableDocsPort}/openapi.yaml`));
  console.log('\n' + chalk.yellow('Press Ctrl+C to stop'));

  return { proxyServer, docsServer };
}
