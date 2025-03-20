import { openApiStore } from '../store/openApiStore.js';
export async function harRecorder(c, next) {
    const startTime = Date.now();
    // Get request body if present
    let requestBody;
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        try {
            requestBody = await c.req.json();
        }
        catch (e) {
            // Body might not be JSON
            requestBody = await c.req.text();
        }
    }
    // Get query parameters from URL
    const url = new URL(c.req.url);
    const queryParams = {};
    for (const [key, value] of url.searchParams.entries()) {
        queryParams[key] = value;
    }
    // Get all request headers
    const requestHeaders = {};
    Object.entries(c.req.header()).forEach(([key, value]) => {
        if (typeof value === 'string') {
            requestHeaders[key] = value;
        }
    });
    // Call next middleware
    await next();
    // Calculate response time
    const responseTime = Date.now() - startTime;
    // Get response body
    let responseBody;
    try {
        responseBody = await c.res.clone().json();
    }
    catch (e) {
        responseBody = await c.res.clone().text();
    }
    // Record the request/response in OpenAPI format
    openApiStore.recordEndpoint(c.req.path, c.req.method.toLowerCase(), {
        query: queryParams,
        body: requestBody,
        contentType: c.req.header('content-type') || 'application/json',
        headers: requestHeaders
    }, {
        status: c.res.status,
        body: responseBody,
        contentType: c.res.headers.get('content-type') || 'application/json',
        headers: Object.fromEntries(c.res.headers.entries())
    });
    // Set HAR data in context
    c.set('har', openApiStore.generateHAR());
}
//# sourceMappingURL=harRecorder.js.map