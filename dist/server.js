import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import httpProxy from 'http-proxy';
import { openApiStore } from './store/openApiStore.js';
import { createServer } from 'node:http';
import { Agent } from 'node:https';
import chalk from 'chalk';
export async function startServers(options) {
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
            'Host': new URL(options.target).host
        },
        agent: new Agent({
            rejectUnauthorized: false
        })
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
    docsApp.get('/docs', async (c) => {
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
    docsApp.get('/openapi.json', (c) => {
        return c.json(openApiStore.getOpenAPISpec());
    });
    docsApp.get('/openapi.yaml', (c) => {
        return c.text(openApiStore.getOpenAPISpecAsYAML());
    });
    docsApp.get('/har', (c) => {
        return c.json(openApiStore.generateHAR());
    });
    // Proxy all requests
    proxyApp.all('*', async (c) => {
        let requestBody;
        let responseBody;
        // Get request body if present
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
            try {
                requestBody = await c.req.json();
            }
            catch (e) {
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
                    'accept': c.req.header('accept') || 'application/json',
                    ...Object.fromEntries(Object.entries(c.req.header())
                        .filter(([key]) => !['content-type', 'accept'].includes(key.toLowerCase()))),
                }),
                body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? requestBody : undefined,
            });
            // Forward the request to the target server
            const proxyRes = await fetch(proxyReq);
            // Get response body
            const contentType = proxyRes.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                responseBody = await proxyRes.json();
            }
            else {
                responseBody = await proxyRes.text();
            }
            // Record the API call in OpenAPI format
            openApiStore.recordEndpoint(c.req.path, c.req.method.toLowerCase(), {
                query: Object.fromEntries(new URL(c.req.url).searchParams),
                body: requestBody,
                contentType: c.req.header('content-type') || 'application/json',
                headers: Object.fromEntries(Object.entries(c.req.header()))
            }, {
                status: proxyRes.status,
                body: responseBody,
                contentType: proxyRes.headers.get('content-type') || 'application/json',
                headers: Object.fromEntries(proxyRes.headers.entries())
            });
            // Create a new response with the correct content type and body
            return new Response(JSON.stringify(responseBody), {
                status: proxyRes.status,
                headers: Object.fromEntries(proxyRes.headers.entries())
            });
        }
        catch (error) {
            console.error('Proxy request failed:', error);
            return c.json({ error: 'Proxy error', details: error.message }, 500);
        }
    });
    // Function to check if a port is available
    async function isPortAvailable(port) {
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
    async function findAvailablePort(startPort) {
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
        console.log(chalk.yellow(`Port ${options.proxyPort} is in use, using port ${availableProxyPort} instead`));
    }
    if (availableDocsPort !== options.docsPort) {
        console.log(chalk.yellow(`Port ${options.docsPort} is in use, using port ${availableDocsPort} instead`));
    }
    console.log(chalk.blue(`Starting proxy server on port ${availableProxyPort}...`));
    console.log(chalk.gray(`Proxying requests to: ${options.target}`));
    console.log(chalk.blue(`Starting documentation server on port ${availableDocsPort}...`));
    const proxyServer = createServer(async (req, res) => {
        try {
            const url = new URL(req.url || '/', `http://localhost:${availableProxyPort}`);
            const request = new Request(url.toString(), {
                method: req.method || 'GET',
                headers: req.headers,
                body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
            });
            const response = await proxyApp.fetch(request);
            res.statusCode = response.status;
            res.statusMessage = response.statusText;
            // Copy all headers from the response
            for (const [key, value] of response.headers.entries()) {
                res.setHeader(key, value);
            }
            // Stream the response body
            if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    res.write(value);
                }
                res.end();
            }
            else {
                res.end();
            }
        }
        catch (error) {
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
                headers: req.headers,
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
                    if (done)
                        break;
                    res.write(value);
                }
            }
            res.end();
        }
        catch (error) {
            console.error('Documentation request failed:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Documentation error', details: error.message }));
        }
    });
    await new Promise((resolve, reject) => {
        proxyServer.once('error', reject);
        proxyServer.listen(availableProxyPort, '0.0.0.0', () => {
            console.log(chalk.green(`✓ Proxy server running on port ${availableProxyPort}`));
            resolve();
        });
    });
    await new Promise((resolve, reject) => {
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
//# sourceMappingURL=server.js.map