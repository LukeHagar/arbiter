import { openApiStore } from '../store/openApiStore.js';
export const apiDocGenerator = async (c, next) => {
    await next();
    // Record the API call in OpenAPI format
    openApiStore.recordEndpoint(c.req.path, c.req.method.toLowerCase(), {
        query: Object.fromEntries(new URL(c.req.url).searchParams),
        body: await c.req.json().catch(() => null),
        contentType: c.req.header('content-type') || 'application/json',
    }, {
        status: c.res.status,
        body: await c.res.clone().json().catch(() => null),
        contentType: c.res.headers.get('content-type') || 'application/json',
    });
};
//# sourceMappingURL=apiDocGenerator.js.map