import { describe, it, expect, beforeEach } from 'vitest';
import { openApiStore } from '../openApiStore.js';
import fs from 'fs';
import path from 'path';
describe('OpenAPI Store', () => {
    beforeEach(() => {
        // Reset the store before each test
        openApiStore.clear();
    });
    it('should record a new endpoint', () => {
        const path = '/test';
        const method = 'get';
        const request = {
            query: {},
            body: null,
            contentType: 'application/json'
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json'
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
            { path: '/test1', method: 'get', response: { status: 200, body: { success: true }, contentType: 'application/json' } },
            { path: '/test2', method: 'post', response: { status: 201, body: { id: 1 }, contentType: 'application/json' } }
        ];
        endpoints.forEach(({ path, method, response }) => {
            const request = {
                query: {},
                body: null,
                contentType: 'application/json'
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
            contentType: 'application/json'
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json',
            headers: {
                'content-type': 'application/json'
            }
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
            value: 'application/json'
        });
    });
    it('should generate YAML spec', () => {
        const endpointPath = '/test';
        const method = 'get';
        const request = {
            query: {},
            body: null,
            contentType: 'application/json'
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json'
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
            contentType: 'application/json'
        };
        const response = {
            status: 200,
            body: { success: true },
            contentType: 'application/json'
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
                    'X-API-Key': 'test-api-key'
                },
                security: [{
                        type: 'apiKey',
                        name: 'X-API-Key',
                        in: 'header'
                    }]
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json'
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
                in: 'header'
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'x-api-key',
                value: 'test-api-key'
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
                    'Authorization': 'Bearer test-token'
                },
                security: [{
                        type: 'oauth2',
                        flows: {
                            authorizationCode: {
                                authorizationUrl: 'https://example.com/oauth/authorize',
                                tokenUrl: 'https://example.com/oauth/token',
                                scopes: {
                                    'read': 'Read access',
                                    'write': 'Write access'
                                }
                            }
                        }
                    }]
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json'
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
                            'read': 'Read access',
                            'write': 'Write access'
                        }
                    }
                }
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Bearer test-token'
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
                    'Authorization': 'Basic dXNlcm5hbWU6cGFzc3dvcmQ='
                },
                security: [{
                        type: 'http',
                        scheme: 'basic'
                    }]
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json'
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
                scheme: 'basic'
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ='
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
                    'Authorization': 'Bearer test-oidc-token'
                },
                security: [{
                        type: 'openIdConnect',
                        openIdConnectUrl: 'https://example.com/.well-known/openid-configuration'
                    }]
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json'
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
                openIdConnectUrl: 'https://example.com/.well-known/openid-configuration'
            });
            // Check HAR entry
            const har = openApiStore.generateHAR();
            const entry = har.log.entries[0];
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Bearer test-oidc-token'
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
                    'Authorization': 'Bearer test-token'
                },
                security: [
                    {
                        type: 'apiKey',
                        name: 'X-API-Key',
                        in: 'header'
                    },
                    {
                        type: 'http',
                        scheme: 'bearer'
                    }
                ]
            };
            const response = {
                status: 200,
                body: { success: true },
                contentType: 'application/json'
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
                value: 'test-api-key'
            });
            expect(entry.request.headers).toContainEqual({
                name: 'authorization',
                value: 'Bearer test-token'
            });
        });
    });
});
//# sourceMappingURL=openApiStore.test.js.map