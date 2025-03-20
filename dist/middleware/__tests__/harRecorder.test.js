import { describe, it, expect, beforeEach } from 'vitest';
import { harRecorder } from '../harRecorder.js';
import { openApiStore } from '../../store/openApiStore.js';
describe('HAR Recorder Middleware', () => {
    let mockContext;
    let mockNext;
    beforeEach(() => {
        // Clear the openApiStore before each test
        openApiStore.clear();
        // Create a store for context values
        const store = new Map();
        // Create a mock request with proper header function
        const mockReq = {
            method: 'GET',
            url: 'http://localhost:3000/test',
            header: (name) => {
                if (name === 'content-type')
                    return 'application/json';
                if (name === 'accept')
                    return 'application/json';
                if (name === undefined)
                    return { 'content-type': 'application/json', 'accept': 'application/json' };
                return undefined;
            },
            json: async () => ({ test: 'data' }),
            path: '/test'
        };
        // Create a mock response
        const mockRes = new Response(JSON.stringify({ success: true }), {
            status: 200,
            statusText: 'OK',
            headers: {
                'content-type': 'application/json'
            }
        });
        // Create a complete mock context
        mockContext = {
            req: mockReq,
            res: mockRes,
            set: (key, value) => { store.set(key, value); },
            get: (key) => store.get(key),
            header: () => '',
            redirect: () => { },
            json: () => { },
            text: () => { },
            html: () => { },
            stream: () => { },
            blob: () => { },
            arrayBuffer: () => { },
            formData: () => { },
            cookie: () => { },
            notFound: () => { },
            status: () => { },
            headers: () => { },
            body: () => { },
            param: () => '',
            query: () => '',
            setCookie: () => { },
            getCookie: () => '',
            deleteCookie: () => { },
            vary: () => { },
            etag: () => { },
            lastModified: () => { },
            type: () => { },
            attachment: () => { },
            download: () => { },
            send: () => { },
            jsonT: () => { },
            textT: () => { },
            htmlT: () => { },
            streamT: () => { },
            blobT: () => { },
            arrayBufferT: () => { },
            formDataT: () => { },
            cookieT: () => { },
            notFoundT: () => { },
            statusT: () => { },
            headersT: () => { },
            bodyT: () => { },
            paramT: () => '',
            queryT: () => '',
            setCookieT: () => { },
            getCookieT: () => '',
            deleteCookieT: () => { },
            prettyT: () => { },
            varyT: () => { },
            etagT: () => { },
            lastModifiedT: () => { },
            typeT: () => { },
            attachmentT: () => { },
            downloadT: () => { },
            sendT: () => { },
            env: {},
            finalized: false,
            error: null,
            event: null,
            executionCtx: null,
            matchedRoute: null,
            params: {},
            path: '',
            validated: {},
            validator: null
        };
        mockNext = async () => {
            // Simulate middleware next behavior
            return Promise.resolve();
        };
    });
    it('should record request and response details', async () => {
        await harRecorder(mockContext, mockNext);
        const har = mockContext.get('har');
        expect(har).toBeDefined();
        expect(har.log.entries).toHaveLength(1);
        expect(har.log.entries[0].request.method).toBe('GET');
        expect(har.log.entries[0].request.url).toBe('http://localhost:3000/test');
        expect(har.log.entries[0].response.status).toBe(200);
        expect(har.log.entries[0].response.content.text).toBe('{"success":true}');
    });
    it('should handle query parameters', async () => {
        // Create a new context with query parameters
        const store = new Map();
        const queryContext = {
            ...mockContext,
            req: {
                ...mockContext.req,
                url: 'http://localhost:3000/test?param1=value1&param2=value2',
                path: '/test',
                method: 'GET',
                header: (name) => {
                    if (name === 'content-type')
                        return 'application/json';
                    if (name === 'accept')
                        return 'application/json';
                    if (name === undefined)
                        return { 'content-type': 'application/json', 'accept': 'application/json' };
                    return undefined;
                },
                json: async () => ({ test: 'data' })
            },
            set: (key, value) => { store.set(key, value); },
            get: (key) => store.get(key)
        };
        await harRecorder(queryContext, mockNext);
        const har = queryContext.get('har');
        expect(har.log.entries[0].request.queryString).toHaveLength(2);
        expect(har.log.entries[0].request.queryString[0]).toEqual({
            name: 'param1',
            value: 'value1'
        });
        expect(har.log.entries[0].request.queryString[1]).toEqual({
            name: 'param2',
            value: 'value2'
        });
    });
    it('should handle request headers', async () => {
        await harRecorder(mockContext, mockNext);
        const har = mockContext.get('har');
        expect(har.log.entries[0].request.headers).toHaveLength(2);
        expect(har.log.entries[0].request.headers).toContainEqual({
            name: 'content-type',
            value: 'application/json'
        });
        expect(har.log.entries[0].request.headers).toContainEqual({
            name: 'accept',
            value: 'application/json'
        });
    });
    it('should handle response headers', async () => {
        await harRecorder(mockContext, mockNext);
        const har = mockContext.get('har');
        expect(har.log.entries[0].response.headers).toHaveLength(1);
        expect(har.log.entries[0].response.headers[0]).toEqual({
            name: 'content-type',
            value: 'application/json'
        });
    });
});
//# sourceMappingURL=harRecorder.test.js.map