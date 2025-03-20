import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openApiStore } from '../openApiStore.js';
import type { OpenAPIV3_1 } from 'openapi-types';
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
      contentType: 'application/json',
    };
    const response = {
      status: 200,
      body: { success: true },
      contentType: 'application/json',
    };

    openApiStore.recordEndpoint(path, method, request, response);

    const spec = openApiStore.getOpenAPISpec();
    const paths = spec.paths as OpenAPIV3_1.PathsObject;
    expect(paths).toBeDefined();
    expect(paths[path]).toBeDefined();
    expect(paths[path]?.[method]).toBeDefined();

    const operation = paths[path]?.[method] as OpenAPIV3_1.OperationObject;
    expect(operation).toBeDefined();

    const responses = operation.responses as Record<string, OpenAPIV3_1.ResponseObject>;
    expect(responses).toBeDefined();
    expect(responses['200']).toBeDefined();

    const responseObj = responses['200'];
    expect(responseObj.content).toBeDefined();
    const content = responseObj.content as Record<string, OpenAPIV3_1.MediaTypeObject>;
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
    const paths = spec.paths as OpenAPIV3_1.PathsObject;
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
            type: 'apiKey' as const,
            name: 'X-API-Key',
            in: 'header' as const,
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
      const paths = spec.paths as OpenAPIV3_1.PathsObject;
      const operation = paths[endpointPath]?.[method] as OpenAPIV3_1.OperationObject;

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
            type: 'oauth2' as const,
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
      const paths = spec.paths as OpenAPIV3_1.PathsObject;
      const operation = paths[endpointPath]?.[method] as OpenAPIV3_1.OperationObject;

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
            type: 'http' as const,
            scheme: 'basic' as const,
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
      const paths = spec.paths as OpenAPIV3_1.PathsObject;
      const operation = paths[endpointPath]?.[method] as OpenAPIV3_1.OperationObject;

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
            type: 'openIdConnect' as const,
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
      const paths = spec.paths as OpenAPIV3_1.PathsObject;
      const operation = paths[endpointPath]?.[method] as OpenAPIV3_1.OperationObject;

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
            type: 'apiKey' as const,
            name: 'X-API-Key',
            in: 'header' as const,
          },
          {
            type: 'http' as const,
            scheme: 'bearer' as const,
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
      const paths = spec.paths as OpenAPIV3_1.PathsObject;
      const operation = paths[endpointPath]?.[method] as OpenAPIV3_1.OperationObject;

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
      const schemas: OpenAPIV3_1.SchemaObject[] = [
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
      const schemas: OpenAPIV3_1.SchemaObject[] = [
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
      const schemas: OpenAPIV3_1.SchemaObject[] = [
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
      const schemas: OpenAPIV3_1.SchemaObject[] = [
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
      const schemas: OpenAPIV3_1.SchemaObject[] = [
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
      const schemas: OpenAPIV3_1.SchemaObject[] = [
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
});
