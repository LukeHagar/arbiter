import { describe, it, expect, beforeEach } from 'vitest';
import { openApiStore } from '../openApiStore.js';
import fs from 'fs';
import path from 'path';
describe('OpenAPI Store', () => {
    beforeEach(() => {
        // Reset the store before each test
        openApiStore.clear();
        openApiStore.setTargetUrl('http://localhost:8080');
    });
    it('should record a new endpoint', () => {
        const path = '/test';
        const method = 'get';
        const request = {
            query: {},
            body: null,
            contentType: 'application/json',
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json',
        };
        openApiStore.recordEndpoint(path, method, request, response);
        const spec = openApiStore.getOpenAPISpec();
        const paths = spec.paths;
        expect(paths).toBeDefined();
        expect(paths[path]).toBeDefined();
        expect(paths[path]?.[method]).toBeDefined();
        const operation = paths[path]?.[method];
        expect(operation).toBeDefined();
        const responses = operation.responses;
        expect(responses).toBeDefined();
        expect(responses['200']).toBeDefined();
        const responseObj = responses['200'];
        expect(responseObj.content).toBeDefined();
        const content = responseObj.content;
        expect(content['application/json']).toBeDefined();
        expect(content['application/json'].schema).toBeDefined();
    });
    it('should handle multiple endpoints', () => {
        const endpoints = [
            {
                path: '/test1',
                method: 'get',
                response: { status: 200, body: { success: true }, contentType: 'application/json' },
            },
            {
                path: '/test2',
                method: 'post',
                response: { status: 201, body: { id: 1 }, contentType: 'application/json' },
            },
        ];
        endpoints.forEach(({ path, method, response }) => {
            const request = {
                query: {},
                body: null,
                contentType: 'application/json',
            };
            openApiStore.recordEndpoint(path, method, request, response);
        });
        const spec = openApiStore.getOpenAPISpec();
        const paths = spec.paths;
        expect(paths).toBeDefined();
        expect(Object.keys(paths)).toHaveLength(2);
        const test1Path = paths['/test1'];
        const test2Path = paths['/test2'];
        expect(test1Path).toBeDefined();
        expect(test2Path).toBeDefined();
        expect(test1Path?.get).toBeDefined();
        expect(test2Path?.post).toBeDefined();
    });
    it('should generate HAR format', () => {
        // Record an endpoint first
        const path = '/test';
        const method = 'get';
        const request = {
            query: {},
            body: null,
            contentType: 'application/json',
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json',
            headers: {
                'content-type': 'application/json',
            },
        };
        openApiStore.recordEndpoint(path, method, request, response);
        // Generate HAR format
        const har = openApiStore.generateHAR();
        expect(har.log.entries).toHaveLength(1);
        expect(har.log.entries[0].request.method).toBe(method.toUpperCase());
        expect(har.log.entries[0].request.url).toContain(path);
        expect(har.log.entries[0].response.status).toBe(response.status);
        expect(har.log.entries[0].response.content.text).toBe(JSON.stringify(response.body));
        expect(har.log.entries[0].response.headers).toContainEqual({
            name: 'content-type',
            value: 'application/json',
        });
    });
    it('should generate YAML spec', () => {
        const endpointPath = '/test';
        const method = 'get';
        const request = {
            query: {},
            body: null,
            contentType: 'application/json',
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json',
        };
        openApiStore.recordEndpoint(endpointPath, method, request, response);
        const yamlSpec = openApiStore.getOpenAPISpecAsYAML();
        expect(yamlSpec).toBeDefined();
        expect(yamlSpec).toContain('openapi: 3.1.0');
        expect(yamlSpec).toContain('paths:');
        expect(yamlSpec).toContain('/test:');
    });
    it('should save both JSON and YAML specs', () => {
        const testDir = path.join(process.cwd(), 'test-output');
        // Clean up test directory if it exists
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        const endpointPath = '/test';
        const method = 'get';
        const request = {
            query: {},
            body: null,
            contentType: 'application/json',
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json',
        };
        openApiStore.recordEndpoint(endpointPath, method, request, response);
        openApiStore.saveOpenAPISpec(testDir);
        // Check if files were created
        expect(fs.existsSync(path.join(testDir, 'openapi.json'))).toBe(true);
        expect(fs.existsSync(path.join(testDir, 'openapi.yaml'))).toBe(true);
        // Clean up
        fs.rmSync(testDir, { recursive: true, force: true });
    });
    describe('Security Schemes', () => {
        it('should handle API Key authentication', () => {
            const endpointPath = '/secure';
            const method = 'get';
            const request = {
                query: {},
                body: null,
                contentType: 'application/json',
                headers: {
                    'X-API-Key': 'test-api-key',
                },
                security: [
                    {
                        type: 'apiKey',
                        name: 'X-API-Key',
                        in: 'header',
                    },
                ],
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json',
            };
            openApiStore.recordEndpoint(endpointPath, method, request, response);
            const spec = openApiStore.getOpenAPISpec();
            const paths = spec.paths;
            const operation = paths[endpointPath]?.[method];
            expect(operation.security).toBeDefined();
            expect(operation.security?.[0]).toHaveProperty('apiKey_');
            const securitySchemes = spec.components?.securitySchemes;
            expect(securitySchemes).toBeDefined();
            expect(securitySchemes?.['apiKey_']).toEqual({
                type: 'apiKey',
                name: 'X-API-Key',
                in: 'header',
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'x-api-key',
                value: 'test-api-key',
            });
        });
        it('should handle OAuth2 authentication', () => {
            const endpointPath = '/oauth';
            const method = 'get';
            const request = {
                query: {},
                body: null,
                contentType: 'application/json',
                headers: {
                    Authorization: 'Bearer test-token',
                },
                security: [
                    {
                        type: 'oauth2',
                        flows: {
                            authorizationCode: {
                                authorizationUrl: 'https://example.com/oauth/authorize',
                                tokenUrl: 'https://example.com/oauth/token',
                                scopes: {
                                    read: 'Read access',
                                    write: 'Write access',
                                },
                            },
                        },
                    },
                ],
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json',
            };
            openApiStore.recordEndpoint(endpointPath, method, request, response);
            const spec = openApiStore.getOpenAPISpec();
            const paths = spec.paths;
            const operation = paths[endpointPath]?.[method];
            expect(operation.security).toBeDefined();
            expect(operation.security?.[0]).toHaveProperty('oauth2_');
            const securitySchemes = spec.components?.securitySchemes;
            expect(securitySchemes).toBeDefined();
            expect(securitySchemes?.['oauth2_']).toEqual({
                type: 'oauth2',
                flows: {
                    authorizationCode: {
                        authorizationUrl: 'https://example.com/oauth/authorize',
                        tokenUrl: 'https://example.com/oauth/token',
                        scopes: {
                            read: 'Read access',
                            write: 'Write access',
                        },
                    },
                },
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Bearer test-token',
            });
        });
        it('should handle HTTP Basic authentication', () => {
            const endpointPath = '/basic';
            const method = 'get';
            const request = {
                query: {},
                body: null,
                contentType: 'application/json',
                headers: {
                    Authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
                },
                security: [
                    {
                        type: 'http',
                        scheme: 'basic',
                    },
                ],
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json',
            };
            openApiStore.recordEndpoint(endpointPath, method, request, response);
            const spec = openApiStore.getOpenAPISpec();
            const paths = spec.paths;
            const operation = paths[endpointPath]?.[method];
            expect(operation.security).toBeDefined();
            expect(operation.security?.[0]).toHaveProperty('http_');
            const securitySchemes = spec.components?.securitySchemes;
            expect(securitySchemes).toBeDefined();
            expect(securitySchemes?.['http_']).toEqual({
                type: 'http',
                scheme: 'basic',
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
            });
        });
        it('should handle OpenID Connect authentication', () => {
            const endpointPath = '/oidc';
            const method = 'get';
            const request = {
                query: {},
                body: null,
                contentType: 'application/json',
                headers: {
                    Authorization: 'Bearer test-oidc-token',
                },
                security: [
                    {
                        type: 'openIdConnect',
                        openIdConnectUrl: 'https://example.com/.well-known/openid-configuration',
                    },
                ],
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json',
            };
            openApiStore.recordEndpoint(endpointPath, method, request, response);
            const spec = openApiStore.getOpenAPISpec();
            const paths = spec.paths;
            const operation = paths[endpointPath]?.[method];
            expect(operation.security).toBeDefined();
            expect(operation.security?.[0]).toHaveProperty('openIdConnect_');
            const securitySchemes = spec.components?.securitySchemes;
            expect(securitySchemes).toBeDefined();
            expect(securitySchemes?.['openIdConnect_']).toEqual({
                type: 'openIdConnect',
                openIdConnectUrl: 'https://example.com/.well-known/openid-configuration',
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Bearer test-oidc-token',
            });
        });
        it('should handle multiple security schemes', () => {
            const endpointPath = '/multi-auth';
            const method = 'get';
            const request = {
                query: {},
                body: null,
                contentType: 'application/json',
                headers: {
                    'X-API-Key': 'test-api-key',
                    Authorization: 'Bearer test-token',
                },
                security: [
                    {
                        type: 'apiKey',
                        name: 'X-API-Key',
                        in: 'header',
                    },
                    {
                        type: 'http',
                        scheme: 'bearer',
                    },
                ],
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json',
            };
            openApiStore.recordEndpoint(endpointPath, method, request, response);
            const spec = openApiStore.getOpenAPISpec();
            const paths = spec.paths;
            const operation = paths[endpointPath]?.[method];
            expect(operation.security).toBeDefined();
            expect(operation.security).toHaveLength(2);
            expect(operation.security?.[0]).toHaveProperty('apiKey_');
            expect(operation.security?.[1]).toHaveProperty('http_');
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'x-api-key',
                value: 'test-api-key',
            });
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Bearer test-token',
            });
        });
    });
    describe('Schema merging', () => {
        it('should merge object schemas correctly', () => {
            const schemas = [
                {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        age: { type: 'number' },
                    },
                },
                {
                    type: 'object',
                    properties: {
                        email: { type: 'string' },
                        age: { type: 'integer' },
                    },
                },
            ];
            const merged = openApiStore['deepMergeSchemas'](schemas);
            expect(merged).toEqual({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                    age: {
                        type: 'object',
                        oneOf: [{ type: 'number' }, { type: 'integer' }],
                    },
                },
            });
        });
        it('should handle oneOf with unique schemas', () => {
            const schemas = [
                { type: 'string' },
                { type: 'number' },
                { type: 'string' }, // Duplicate
            ];
            const merged = openApiStore['deepMergeSchemas'](schemas);
            expect(merged).toEqual({
                type: 'object',
                oneOf: [{ type: 'string' }, { type: 'number' }],
            });
        });
        it('should handle anyOf with unique schemas', () => {
            const schemas = [
                { type: 'string', format: 'email' },
                { type: 'string', format: 'uri' },
                { type: 'string', format: 'email' }, // Duplicate
            ];
            const merged = openApiStore['deepMergeSchemas'](schemas);
            expect(merged).toEqual({
                type: 'object',
                oneOf: [
                    { type: 'string', format: 'email' },
                    { type: 'string', format: 'uri' },
                ],
            });
        });
        it('should handle allOf with unique schemas', () => {
            const schemas = [
                { type: 'object', properties: { name: { type: 'string' } } },
                { type: 'object', properties: { age: { type: 'number' } } },
                { type: 'object', properties: { name: { type: 'string' } } }, // Duplicate
            ];
            const merged = openApiStore['deepMergeSchemas'](schemas);
            expect(merged).toEqual({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'number' },
                },
            });
        });
        it('should handle mixed schema types', () => {
            const schemas = [
                { type: 'string' },
                { type: 'object', properties: { name: { type: 'string' } } },
                { type: 'array', items: { type: 'string' } },
                { type: 'string' }, // Duplicate
            ];
            const merged = openApiStore['deepMergeSchemas'](schemas);
            expect(merged).toEqual({
                type: 'object',
                oneOf: [
                    { type: 'string' },
                    { type: 'object', properties: { name: { type: 'string' } } },
                    { type: 'array', items: { type: 'string' } },
                ],
            });
        });
        it('should handle nested object schemas', () => {
            const schemas = [
                {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: { name: { type: 'string' } },
                        },
                    },
                },
                {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: { age: { type: 'number' } },
                        },
                    },
                },
            ];
            const merged = openApiStore['deepMergeSchemas'](schemas);
            expect(merged).toEqual({
                type: 'object',
                properties: {
                    user: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            age: { type: 'number' },
                        },
                    },
                },
            });
        });
    });
    describe('Basic functionality', () => {
        it('should initialize with correct default values', () => {
            const spec = openApiStore.getOpenAPISpec();
            expect(spec.openapi).toBe('3.1.0');
            expect(spec.info.title).toBe('API Documentation');
            expect(spec.info.version).toBe('1.0.0');
            expect(spec.servers?.[0]?.url).toBe('http://localhost:8080');
            expect(Object.keys(spec.paths || {})).toHaveLength(0);
        });
        it('should set target URL correctly', () => {
            openApiStore.setTargetUrl('https://example.com/api');
            const spec = openApiStore.getOpenAPISpec();
            expect(spec.servers?.[0]?.url).toBe('https://example.com/api');
        });
        it('should clear stored data', () => {
            // Add an endpoint
            openApiStore.recordEndpoint('/test', 'get', { query: {}, headers: {}, contentType: 'application/json', body: null }, { status: 200, headers: {}, contentType: 'application/json', body: { success: true } });
            // Verify it was added
            const spec1 = openApiStore.getOpenAPISpec();
            expect(Object.keys(spec1.paths || {})).toHaveLength(1);
            // Clear and verify it's gone
            openApiStore.clear();
            const spec2 = openApiStore.getOpenAPISpec();
            expect(Object.keys(spec2.paths || {})).toHaveLength(0);
        });
    });
    describe('recordEndpoint', () => {
        it('should record a GET endpoint with query parameters', () => {
            openApiStore.recordEndpoint('/users', 'get', {
                query: { limit: '10', offset: '0' },
                headers: { 'accept': 'application/json' },
                contentType: 'application/json',
                body: null
            }, {
                status: 200,
                headers: { 'content-type': 'application/json' },
                contentType: 'application/json',
                body: [{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Smith' }]
            });
            const spec = openApiStore.getOpenAPISpec();
            // Check path exists
            expect(spec.paths?.['/users']).toBeDefined();
            expect(spec.paths?.['/users']?.get).toBeDefined();
            // Check query parameters
            const params = spec.paths?.['/users']?.get?.parameters;
            expect(params).toBeDefined();
            expect(params).toContainEqual(expect.objectContaining({
                name: 'limit',
                in: 'query'
            }));
            expect(params).toContainEqual(expect.objectContaining({
                name: 'offset',
                in: 'query'
            }));
            // Check response
            expect(spec.paths?.['/users']?.get?.responses?.[200]).toBeDefined();
            const content = spec.paths?.['/users']?.get?.responses?.[200]?.content;
            expect(content?.['application/json']).toBeDefined();
        });
        it('should record a POST endpoint with request body', () => {
            const requestBody = { name: 'Test User', email: 'test@example.com' };
            openApiStore.recordEndpoint('/users', 'post', {
                query: {},
                headers: { 'content-type': 'application/json' },
                contentType: 'application/json',
                body: requestBody
            }, {
                status: 201,
                headers: { 'content-type': 'application/json' },
                contentType: 'application/json',
                body: { id: 1, ...requestBody }
            });
            const spec = openApiStore.getOpenAPISpec();
            // Check path exists
            expect(spec.paths?.['/users']).toBeDefined();
            expect(spec.paths?.['/users']?.post).toBeDefined();
            // Check request body
            expect(spec.paths?.['/users']?.post?.requestBody).toBeDefined();
            const content = spec.paths?.['/users']?.post?.requestBody?.content;
            expect(content?.['application/json']).toBeDefined();
            // Check response
            expect(spec.paths?.['/users']?.post?.responses?.[201]).toBeDefined();
        });
        it('should record path parameters correctly', () => {
            openApiStore.recordEndpoint('/users/123', 'get', { query: {}, headers: {}, contentType: 'application/json', body: null }, { status: 200, headers: {}, contentType: 'application/json', body: { id: 123, name: 'John Doe' } });
            // Now record another endpoint with a different ID to help OpenAPI identify the path parameter
            openApiStore.recordEndpoint('/users/456', 'get', { query: {}, headers: {}, contentType: 'application/json', body: null }, { status: 200, headers: {}, contentType: 'application/json', body: { id: 456, name: 'Jane Smith' } });
            const spec = openApiStore.getOpenAPISpec();
            // Check that the path was correctly parameterized
            expect(spec.paths?.['/users/{id}']).toBeDefined();
            if (spec.paths?.['/users/{id}']) {
                expect(spec.paths['/users/{id}'].get).toBeDefined();
                // Check that the path parameter is defined
                const params = spec.paths['/users/{id}'].get?.parameters;
                expect(params).toBeDefined();
                expect(params?.some(p => p.name === 'id' && p.in === 'path')).toBe(true);
            }
        });
        it('should handle security schemes', () => {
            // Record an endpoint with API Key
            openApiStore.recordEndpoint('/secure', 'get', {
                query: {},
                headers: { 'x-api-key': 'test-key' },
                contentType: 'application/json',
                body: null,
                security: [{ type: 'apiKey', name: 'x-api-key', in: 'header' }]
            }, { status: 200, headers: {}, contentType: 'application/json', body: { message: 'Secret data' } });
            // Record an endpoint with Bearer token
            openApiStore.recordEndpoint('/auth/profile', 'get', {
                query: {},
                headers: { 'authorization': 'Bearer token123' },
                contentType: 'application/json',
                body: null,
                security: [{ type: 'http', scheme: 'bearer' }]
            }, { status: 200, headers: {}, contentType: 'application/json', body: { id: 1, username: 'admin' } });
            const spec = openApiStore.getOpenAPISpec();
            // Check security schemes are defined
            expect(spec.components?.securitySchemes).toBeDefined();
            // Check API Key security scheme
            const apiKeyScheme = spec.components?.securitySchemes?.apiKey_;
            expect(apiKeyScheme).toBeDefined();
            expect(apiKeyScheme.type).toBe('apiKey');
            expect(apiKeyScheme.in).toBe('header');
            expect(apiKeyScheme.name).toBe('x-api-key');
            // Check Bearer token security scheme
            const bearerScheme = spec.components?.securitySchemes?.http_;
            expect(bearerScheme).toBeDefined();
            expect(bearerScheme.type).toBe('http');
            expect(bearerScheme.scheme).toBe('bearer');
            // Check security requirements on endpoints
            expect(spec.paths?.['/secure']?.get?.security).toBeDefined();
            expect(spec.paths?.['/auth/profile']?.get?.security).toBeDefined();
        });
    });
    describe('Schema generation', () => {
        it('should generate schema from simple object', () => {
            const data = { id: 1, name: 'John Doe', active: true, age: 30 };
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateJsonSchema(data);
            expect(schema.type).toBe('object');
            expect((schema.properties?.id).type).toBe('integer');
            expect((schema.properties?.name).type).toBe('string');
            expect((schema.properties?.active).type).toBe('boolean');
            expect((schema.properties?.age).type).toBe('integer');
        });
        it('should generate schema from array', () => {
            const data = [
                { id: 1, name: 'John Doe' },
                { id: 2, name: 'Jane Smith' }
            ];
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateJsonSchema(data);
            expect(schema.type).toBe('array');
            // Using ts-ignore since we're accessing a property that might not exist on all schema types
            // @ts-ignore
            expect(schema.items).toBeDefined();
            // @ts-ignore
            expect(schema.items?.type).toBe('object');
            // @ts-ignore
            expect((schema.items?.properties?.id).type).toBe('integer');
            // @ts-ignore
            expect((schema.items?.properties?.name).type).toBe('string');
        });
        it('should generate schema from nested objects', () => {
            const data = {
                id: 1,
                name: 'John Doe',
                address: {
                    street: '123 Main St',
                    city: 'Anytown',
                    zipCode: '12345'
                },
                tags: ['developer', 'javascript']
            };
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateJsonSchema(data);
            expect(schema.type).toBe('object');
            expect((schema.properties?.address).type).toBe('object');
            expect(((schema.properties?.address).properties?.street).type).toBe('string');
            expect((schema.properties?.tags).type).toBe('array');
            // @ts-ignore
            expect((schema.properties?.tags).items?.type).toBe('string');
        });
        it('should handle null values', () => {
            const data = { id: 1, name: 'John Doe', description: null };
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateJsonSchema(data);
            expect((schema.properties?.description).type).toBe('null');
        });
        it('should detect proper types for numeric values', () => {
            const data = {
                integer: 42,
                float: 3.14,
                scientific: 1e6,
                zero: 0
            };
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateJsonSchema(data);
            expect((schema.properties?.integer).type).toBe('integer');
            expect((schema.properties?.float).type).toBe('number');
            expect((schema.properties?.scientific).type).toBe('integer');
            expect((schema.properties?.zero).type).toBe('integer');
        });
    });
    describe('Structure analysis', () => {
        it('should detect and generate schema for array-like structures', () => {
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateSchemaFromStructure('[{"id":1,"name":"test"},{"id":2}]');
            expect(schema.type).toBe('array');
            // TypeScript doesn't recognize that an array schema will have items
            // @ts-ignore
            expect(schema.items).toBeDefined();
        });
        it('should detect and generate schema for object-like structures', () => {
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateSchemaFromStructure('{"id":1,"name":"test","active":true}');
            expect(schema.type).toBe('object');
            expect(schema.properties).toBeDefined();
            expect(schema.properties?.id).toBeDefined();
            expect(schema.properties?.name).toBeDefined();
            expect(schema.properties?.active).toBeDefined();
        });
        it('should handle unstructured content', () => {
            // @ts-ignore: Testing private method
            const schema = openApiStore.generateSchemaFromStructure('This is just plain text');
            expect(schema.type).toBe('string');
        });
    });
    describe('HAR handling', () => {
        it('should generate HAR output', () => {
            // Record an endpoint
            openApiStore.recordEndpoint('/test', 'get', { query: {}, headers: {}, contentType: 'application/json', body: null }, { status: 200, headers: {}, contentType: 'application/json', body: { success: true } });
            const har = openApiStore.generateHAR();
            expect(har.log).toBeDefined();
            expect(har.log.version).toBe('1.2');
            expect(har.log.creator).toBeDefined();
            expect(har.log.entries).toBeDefined();
            expect(har.log.entries).toHaveLength(1);
            const entry = har.log.entries[0];
            expect(entry.request.method).toBe('GET');
            expect(entry.request.url).toBe('http://localhost:8080/test');
            expect(entry.response.status).toBe(200);
        });
    });
    describe('YAML output', () => {
        it('should convert OpenAPI spec to YAML', () => {
            // Record an endpoint
            openApiStore.recordEndpoint('/test', 'get', { query: {}, headers: {}, contentType: 'application/json', body: null }, { status: 200, headers: {}, contentType: 'application/json', body: { success: true } });
            const yaml = openApiStore.getOpenAPISpecAsYAML();
            expect(yaml).toContain('openapi: 3.1.0');
            expect(yaml).toContain('paths:');
            expect(yaml).toContain('/test:');
            expect(yaml).toContain('get:');
        });
    });
});
//# sourceMappingURL=openApiStore.test.js.map