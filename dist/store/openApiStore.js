import fs from 'fs';
import path from 'path';
import { stringify } from 'yaml';
class OpenAPIStore {
    endpoints;
    harEntries;
    targetUrl;
    examples;
    schemaCache;
    securitySchemes;
    constructor(targetUrl = 'http://localhost:8080') {
        this.endpoints = new Map();
        this.harEntries = [];
        this.targetUrl = targetUrl;
        this.examples = new Map();
        this.schemaCache = new Map();
        this.securitySchemes = new Map();
    }
    setTargetUrl(url) {
        this.targetUrl = url;
    }
    clear() {
        this.endpoints.clear();
        this.harEntries = [];
        this.examples.clear();
    }
    deepMergeSchemas(schemas) {
        if (schemas.length === 0)
            return { type: 'object' };
        if (schemas.length === 1)
            return schemas[0];
        // If all schemas are objects, merge their properties
        if (schemas.every(s => s.type === 'object')) {
            const mergedProperties = {};
            const mergedRequired = [];
            schemas.forEach(schema => {
                if (schema.properties) {
                    Object.entries(schema.properties).forEach(([key, value]) => {
                        if (!mergedProperties[key]) {
                            mergedProperties[key] = value;
                        }
                        else {
                            // If property exists, merge its schemas
                            mergedProperties[key] = this.deepMergeSchemas([mergedProperties[key], value]);
                        }
                    });
                }
            });
            return {
                type: 'object',
                properties: mergedProperties
            };
        }
        // If schemas are different types, use oneOf with unique schemas
        const uniqueSchemas = schemas.filter((schema, index, self) => index === self.findIndex(s => JSON.stringify(s) === JSON.stringify(schema)));
        if (uniqueSchemas.length === 1) {
            return uniqueSchemas[0];
        }
        return {
            type: 'object',
            oneOf: uniqueSchemas
        };
    }
    generateJsonSchema(obj) {
        if (obj === null)
            return { type: 'null' };
        if (Array.isArray(obj)) {
            if (obj.length === 0)
                return { type: 'array', items: { type: 'object' } };
            // Generate schemas for all items
            const itemSchemas = obj.map(item => this.generateJsonSchema(item));
            // If all items have the same schema, use that
            if (itemSchemas.every(s => JSON.stringify(s) === JSON.stringify(itemSchemas[0]))) {
                return {
                    type: 'array',
                    items: itemSchemas[0],
                    example: obj
                };
            }
            // If items have different schemas, use oneOf
            return {
                type: 'array',
                items: {
                    type: 'object',
                    oneOf: itemSchemas
                },
                example: obj
            };
        }
        if (typeof obj === 'object') {
            const properties = {};
            for (const [key, value] of Object.entries(obj)) {
                properties[key] = this.generateJsonSchema(value);
            }
            return {
                type: 'object',
                properties,
                example: obj
            };
        }
        // Map JavaScript types to OpenAPI types
        const typeMap = {
            'string': 'string',
            'number': 'number',
            'boolean': 'boolean',
            'bigint': 'integer',
            'symbol': 'string',
            'undefined': 'string',
            'function': 'string'
        };
        return {
            type: typeMap[typeof obj] || 'string',
            example: obj
        };
    }
    recordHAREntry(path, method, request, response) {
        const now = new Date();
        const entry = {
            startedDateTime: now.toISOString(),
            time: 0,
            request: {
                method: method.toUpperCase(),
                url: `${this.targetUrl}${path}${this.buildQueryString(request.query)}`,
                httpVersion: 'HTTP/1.1',
                headers: Object.entries(request.headers || {})
                    .map(([name, value]) => ({
                    name: name.toLowerCase(), // Normalize header names
                    value: String(value) // Ensure value is a string
                })),
                queryString: Object.entries(request.query || {})
                    .map(([name, value]) => ({
                    name,
                    value: String(value) // Ensure value is a string
                })),
                postData: request.body ? {
                    mimeType: request.contentType,
                    text: JSON.stringify(request.body)
                } : undefined
            },
            response: {
                status: response.status,
                statusText: response.status === 200 ? 'OK' : 'Error',
                httpVersion: 'HTTP/1.1',
                headers: Object.entries(response.headers || {})
                    .map(([name, value]) => ({
                    name: name.toLowerCase(), // Normalize header names
                    value: String(value) // Ensure value is a string
                })),
                content: {
                    size: response.body ? JSON.stringify(response.body).length : 0,
                    mimeType: response.contentType || 'application/json',
                    text: response.body ? JSON.stringify(response.body) : ''
                }
            }
        };
        this.harEntries.push(entry);
    }
    buildQueryString(query) {
        if (!query || Object.keys(query).length === 0) {
            return '';
        }
        const params = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            params.append(key, value);
        });
        return `?${params.toString()}`;
    }
    addSecurityScheme(security) {
        // Use a consistent name based on the type with an underscore suffix
        const schemeName = `${security.type}_`;
        let scheme;
        switch (security.type) {
            case 'apiKey':
                scheme = {
                    type: 'apiKey',
                    name: security.name || 'X-API-Key',
                    in: security.in || 'header'
                };
                break;
            case 'oauth2':
                scheme = {
                    type: 'oauth2',
                    flows: security.flows || {
                        implicit: {
                            authorizationUrl: 'https://example.com/oauth/authorize',
                            scopes: {
                                'read': 'Read access',
                                'write': 'Write access'
                            }
                        }
                    }
                };
                break;
            case 'http':
                scheme = {
                    type: 'http',
                    scheme: security.scheme || 'bearer'
                };
                break;
            case 'openIdConnect':
                scheme = {
                    type: 'openIdConnect',
                    openIdConnectUrl: security.openIdConnectUrl || 'https://example.com/.well-known/openid-configuration'
                };
                break;
            default:
                throw new Error(`Unsupported security type: ${security.type}`);
        }
        this.securitySchemes.set(schemeName, scheme);
        return schemeName;
    }
    recordEndpoint(path, method, request, response) {
        const key = `${method}:${path}`;
        const endpoint = this.endpoints.get(key) || {
            path,
            method,
            responses: {},
            parameters: [],
            requestBody: method.toLowerCase() === 'get' ? undefined : {
                required: false,
                content: {}
            }
        };
        // Add security schemes if present
        if (request.security) {
            endpoint.security = request.security.map(security => {
                const schemeName = this.addSecurityScheme(security);
                return { [schemeName]: ['read'] }; // Add default scope
            });
        }
        // Convert path parameters to OpenAPI format
        const openApiPath = path.replace(/:(\w+)/g, '{$1}');
        // Add path parameters
        const pathParams = path.match(/:(\w+)/g) || [];
        pathParams.forEach(param => {
            const paramName = param.slice(1);
            if (!endpoint.parameters.some(p => p.name === paramName)) {
                endpoint.parameters.push({
                    name: paramName,
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        example: paramName // Use the parameter name as an example
                    }
                });
            }
        });
        // Add query parameters and headers
        Object.entries(request.query).forEach(([key, value]) => {
            if (!endpoint.parameters.some(p => p.name === key)) {
                endpoint.parameters.push({
                    name: key,
                    in: 'query',
                    required: false,
                    schema: {
                        type: 'string',
                        example: value
                    }
                });
            }
        });
        // Add request headers as parameters
        if (request.headers) {
            Object.entries(request.headers).forEach(([name, value]) => {
                if (!endpoint.parameters.some(p => p.name === name)) {
                    endpoint.parameters.push({
                        name: name,
                        in: 'header',
                        required: false,
                        schema: {
                            type: 'string',
                            example: value
                        }
                    });
                }
            });
        }
        // Add request body schema if present and not a GET request
        if (request.body && method.toLowerCase() !== 'get') {
            const contentType = request.contentType || 'application/json';
            if (endpoint.requestBody && !endpoint.requestBody.content[contentType]) {
                const schema = this.generateJsonSchema(request.body);
                endpoint.requestBody.content[contentType] = {
                    schema
                };
            }
        }
        // Add response schema
        const responseContentType = response.contentType || 'application/json';
        // Initialize response object if it doesn't exist
        if (!endpoint.responses[response.status]) {
            endpoint.responses[response.status] = {
                description: `Response for ${method.toUpperCase()} ${path}`,
                content: {}
            };
        }
        // Ensure content object exists
        const responseObj = endpoint.responses[response.status];
        if (!responseObj.content) {
            responseObj.content = {};
        }
        // Generate schema for the current response
        const currentSchema = this.generateJsonSchema(response.body);
        // Get existing schemas for this endpoint and status code
        const schemaKey = `${key}:${response.status}:${responseContentType}`;
        const existingSchemas = this.schemaCache.get(schemaKey) || [];
        // Add the current schema to the cache
        existingSchemas.push(currentSchema);
        this.schemaCache.set(schemaKey, existingSchemas);
        // Merge all schemas for this endpoint and status code
        const mergedSchema = this.deepMergeSchemas(existingSchemas);
        // Update the content with the merged schema
        responseObj.content[responseContentType] = {
            schema: mergedSchema
        };
        // Add response headers
        if (response.headers && Object.keys(response.headers).length > 0) {
            endpoint.responses[response.status].headers = Object.entries(response.headers).reduce((acc, [name, value]) => {
                acc[name] = {
                    schema: {
                        type: 'string',
                        example: value
                    },
                    description: `Response header ${name}`
                };
                return acc;
            }, {});
        }
        this.endpoints.set(key, endpoint);
        // Record in HAR
        this.recordHAREntry(path, method, request, response);
    }
    getOpenAPISpec() {
        const paths = Array.from(this.endpoints.entries()).reduce((acc, [key, info]) => {
            const [method, path] = key.split(':');
            if (!acc[path]) {
                acc[path] = {};
            }
            const operation = {
                summary: `${method.toUpperCase()} ${path}`,
                responses: info.responses,
            };
            // Only include parameters if there are any
            if (info.parameters.length > 0) {
                operation.parameters = info.parameters;
            }
            // Only include requestBody if it exists
            if (info.requestBody) {
                operation.requestBody = info.requestBody;
            }
            // Add security if it exists
            if (info.security) {
                operation.security = info.security;
            }
            acc[path][method] = operation;
            return acc;
        }, {});
        const spec = {
            openapi: '3.1.0',
            info: {
                title: 'Generated API Documentation',
                version: '1.0.0',
                description: 'Automatically generated API documentation from proxy traffic',
            },
            servers: [{
                    url: this.targetUrl,
                }],
            paths
        };
        // Only add components if there are security schemes
        if (this.securitySchemes.size > 0) {
            if (!spec.components) {
                spec.components = {};
            }
            if (!spec.components.securitySchemes) {
                spec.components.securitySchemes = {};
            }
            spec.components.securitySchemes = Object.fromEntries(this.securitySchemes);
        }
        return spec;
    }
    getOpenAPISpecAsYAML() {
        const spec = this.getOpenAPISpec();
        return stringify(spec, {
            indent: 2,
            simpleKeys: true,
            aliasDuplicateObjects: false,
            strict: true
        });
    }
    saveOpenAPISpec(outputDir) {
        const spec = this.getOpenAPISpec();
        const yamlSpec = this.getOpenAPISpecAsYAML();
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        // Save JSON spec
        fs.writeFileSync(path.join(outputDir, 'openapi.json'), JSON.stringify(spec, null, 2));
        // Save YAML spec
        fs.writeFileSync(path.join(outputDir, 'openapi.yaml'), yamlSpec);
    }
    generateHAR() {
        return {
            log: {
                version: '1.2',
                creator: {
                    name: 'Arbiter',
                    version: '1.0.0',
                },
                entries: this.harEntries,
            },
        };
    }
}
export const openApiStore = new OpenAPIStore();
//# sourceMappingURL=openApiStore.js.map