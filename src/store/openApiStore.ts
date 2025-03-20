import fs from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import type { OpenAPI, OpenAPIV3_1 } from 'openapi-types';

export interface SecurityInfo {
  type: 'apiKey' | 'oauth2' | 'http' | 'openIdConnect';
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  flows?: {
    implicit?: {
      authorizationUrl: string;
      scopes: Record<string, string>;
    };
    authorizationCode?: {
      authorizationUrl: string;
      tokenUrl: string;
      scopes: Record<string, string>;
    };
    clientCredentials?: {
      tokenUrl: string;
      scopes: Record<string, string>;
    };
    password?: {
      tokenUrl: string;
      scopes: Record<string, string>;
    };
  };
  openIdConnectUrl?: string;
}

interface RequestInfo {
  query: Record<string, string>;
  body: any;
  contentType: string;
  headers?: Record<string, string>;
  security?: SecurityInfo[];
}

interface ResponseInfo {
  status: number;
  body: any;
  contentType: string;
  headers?: Record<string, string>;
}

interface EndpointInfo {
  path: string;
  method: string;
  responses: {
    [key: number]: OpenAPIV3_1.ResponseObject;
  };
  parameters: OpenAPIV3_1.ParameterObject[];
  requestBody?: OpenAPIV3_1.RequestBodyObject;
  security?: OpenAPIV3_1.SecurityRequirementObject[];
}

interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    content: {
      size: number;
      mimeType: string;
      text: string;
    };
  };
}

type PathItemObject = {
  [method: string]: OpenAPIV3_1.OperationObject;
};

type PathsObject = {
  [path: string]: PathItemObject;
};

export class OpenAPIStore {
  private endpoints: Map<string, EndpointInfo>;
  private harEntries: HAREntry[];
  private targetUrl: string;
  private examples: Map<any, any[]>;
  private schemaCache: Map<string, OpenAPIV3_1.SchemaObject[]>;
  private securitySchemes: Map<string, OpenAPIV3_1.SecuritySchemeObject>;

  constructor(targetUrl: string = 'http://localhost:8080') {
    this.endpoints = new Map();
    this.harEntries = [];
    this.targetUrl = targetUrl;
    this.examples = new Map();
    this.schemaCache = new Map();
    this.securitySchemes = new Map();
  }

  public setTargetUrl(url: string): void {
    this.targetUrl = url;
  }

  public clear(): void {
    this.endpoints.clear();
    this.harEntries = [];
    this.examples.clear();
    this.schemaCache.clear();
    this.securitySchemes.clear();
  }

  private deepMergeSchemas(schemas: OpenAPIV3_1.SchemaObject[]): OpenAPIV3_1.SchemaObject {
    if (schemas.length === 0) return { type: 'object' };
    if (schemas.length === 1) return schemas[0];

    // If all schemas are objects, merge their properties
    if (schemas.every((s) => s.type === 'object')) {
      const mergedProperties: Record<string, OpenAPIV3_1.SchemaObject> = {};
      const mergedRequired: string[] = [];

      schemas.forEach((schema) => {
        if (schema.properties) {
          Object.entries(schema.properties).forEach(([key, value]) => {
            if (!mergedProperties[key]) {
              mergedProperties[key] = value;
            } else {
              // If property exists, merge its schemas
              mergedProperties[key] = this.deepMergeSchemas([mergedProperties[key], value]);
            }
          });
        }
      });

      return {
        type: 'object',
        properties: mergedProperties,
      };
    }

    // If schemas are different types, use oneOf with unique schemas
    const uniqueSchemas = schemas.filter(
      (schema, index, self) =>
        index === self.findIndex((s) => JSON.stringify(s) === JSON.stringify(schema))
    );

    if (uniqueSchemas.length === 1) {
      return uniqueSchemas[0];
    }

    return {
      type: 'object',
      oneOf: uniqueSchemas,
    };
  }

  private generateJsonSchema(obj: any): OpenAPIV3_1.SchemaObject {
    if (obj === null) return { type: 'null' };
    if (Array.isArray(obj)) {
      if (obj.length === 0) return { type: 'array', items: { type: 'object' } };

      // Generate schemas for all items
      const itemSchemas = obj.map((item) => this.generateJsonSchema(item));

      // If all items have the same schema, use that
      if (itemSchemas.every((s) => JSON.stringify(s) === JSON.stringify(itemSchemas[0]))) {
        return {
          type: 'array',
          items: itemSchemas[0],
          example: obj,
        };
      }

      // If items have different schemas, use oneOf
      return {
        type: 'array',
        items: {
          type: 'object',
          oneOf: itemSchemas,
        },
        example: obj,
      };
    }

    if (typeof obj === 'object') {
      const properties: Record<string, OpenAPIV3_1.SchemaObject> = {};
      for (const [key, value] of Object.entries(obj)) {
        properties[key] = this.generateJsonSchema(value);
      }
      return {
        type: 'object',
        properties,
        example: obj,
      };
    }

    // Map JavaScript types to OpenAPI types
    const typeMap: Record<string, OpenAPIV3_1.NonArraySchemaObjectType> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      bigint: 'integer',
      symbol: 'string',
      undefined: 'string',
      function: 'string',
    };

    return {
      type: typeMap[typeof obj] || 'string',
      example: obj,
    };
  }

  private recordHAREntry(
    path: string,
    method: string,
    request: RequestInfo,
    response: ResponseInfo
  ): void {
    const now = new Date();
    const url = new URL(path, this.targetUrl);

    // Add query parameters from request.query
    Object.entries(request.query || {}).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const entry: HAREntry = {
      startedDateTime: now.toISOString(),
      time: 0,
      request: {
        method: method.toUpperCase(),
        url: url.toString(),
        httpVersion: 'HTTP/1.1',
        headers: Object.entries(request.headers || {}).map(([name, value]) => ({
          name: name.toLowerCase(), // Normalize header names
          value: String(value), // Ensure value is a string
        })),
        queryString: Object.entries(request.query || {}).map(([name, value]) => ({
          name,
          value: String(value), // Ensure value is a string
        })),
        postData: request.body
          ? {
              mimeType: request.contentType,
              text: typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
            }
          : undefined,
      },
      response: {
        status: response.status,
        statusText: response.status === 200 ? 'OK' : 'Error',
        httpVersion: 'HTTP/1.1',
        headers: Object.entries(response.headers || {}).map(([name, value]) => ({
          name: name.toLowerCase(), // Normalize header names
          value: String(value), // Ensure value is a string
        })),
        content: {
          size: response.body ? JSON.stringify(response.body).length : 0,
          mimeType: response.contentType || 'application/json',
          text: typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
        },
      },
    };

    this.harEntries.push(entry);
  }

  private buildQueryString(query: Record<string, string>): string {
    if (!query || Object.keys(query).length === 0) {
      return '';
    }
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      params.append(key, value);
    });
    return `?${params.toString()}`;
  }

  private addSecurityScheme(security: SecurityInfo): string {
    // Use a consistent name based on the type with underscore suffix
    const schemeName = security.type === 'apiKey' ? 'apiKey_' : `${security.type}_`;
    let scheme: OpenAPIV3_1.SecuritySchemeObject;

    switch (security.type) {
      case 'apiKey':
        scheme = {
          type: 'apiKey',
          name: security.name || 'x-api-key',
          in: security.in || 'header',
        };
        break;

      case 'oauth2':
        scheme = {
          type: 'oauth2',
          flows: security.flows || {
            implicit: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              scopes: {
                read: 'Read access',
                write: 'Write access',
              },
            },
          },
        };
        break;

      case 'http':
        scheme = {
          type: 'http',
          scheme: security.scheme || 'bearer',
        };
        break;

      case 'openIdConnect':
        scheme = {
          type: 'openIdConnect',
          openIdConnectUrl:
            security.openIdConnectUrl || 'https://example.com/.well-known/openid-configuration',
        };
        break;

      default:
        throw new Error(`Unsupported security type: ${security.type}`);
    }

    this.securitySchemes.set(schemeName, scheme);
    return schemeName;
  }

  public recordEndpoint(
    path: string,
    method: string,
    request: RequestInfo,
    response: ResponseInfo
  ): void {
    // Convert path parameters to OpenAPI format
    const openApiPath = path.replace(/\/(\d+)/g, '/{id}').replace(/:(\w+)/g, '{$1}');
    const key = `${method}:${openApiPath}`;
    const endpoint: EndpointInfo = this.endpoints.get(key) || {
      path: openApiPath,
      method,
      responses: {},
      parameters: [],
      requestBody:
        method.toLowerCase() === 'get'
          ? undefined
          : {
              required: false,
              content: {},
            },
    };

    // Add security schemes if present
    if (request.security) {
      endpoint.security = request.security.map((security) => {
        const schemeName = this.addSecurityScheme(security);
        return { [schemeName]: [] }; // Empty array for scopes
      });
    }

    // Add path parameters
    const pathParams = openApiPath.match(/\{(\w+)\}/g) || [];
    pathParams.forEach((param) => {
      const paramName = param.slice(1, -1);
      if (!endpoint.parameters.some((p) => p.name === paramName)) {
        endpoint.parameters.push({
          name: paramName,
          in: 'path',
          required: true,
          schema: {
            type: 'string',
          } satisfies OpenAPIV3_1.SchemaObject,
        });
      }
    });

    // Add query parameters
    Object.entries(request.query).forEach(([key, value]) => {
      if (!endpoint.parameters.some((p) => p.name === key)) {
        endpoint.parameters.push({
          name: key,
          in: 'query',
          schema: {
            type: 'string',
          } satisfies OpenAPIV3_1.SchemaObject,
        });
      }
    });

    // Add request headers as parameters
    if (request.headers) {
      Object.entries(request.headers).forEach(([name, value]) => {
        if (!endpoint.parameters.some((p) => p.name === name)) {
          endpoint.parameters.push({
            name: name,
            in: 'header',
            required: false,
            schema: {
              type: 'string',
              example: value,
            } satisfies OpenAPIV3_1.SchemaObject,
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
          schema,
        };
      }
    }

    // Add response schema
    const responseContentType = response.contentType || 'application/json';

    // Initialize response object if it doesn't exist
    if (!endpoint.responses[response.status]) {
      endpoint.responses[response.status] = {
        description: `Response for ${method.toUpperCase()} ${path}`,
        content: {},
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
      schema: mergedSchema,
    };

    // Add response headers
    if (response.headers && Object.keys(response.headers).length > 0) {
      endpoint.responses[response.status].headers = Object.entries(response.headers).reduce(
        (acc, [name, value]) => {
          acc[name] = {
            schema: {
              type: 'string',
              example: value,
            },
            description: `Response header ${name}`,
          };
          return acc;
        },
        {} as NonNullable<OpenAPIV3_1.ResponseObject['headers']>
      );
    }

    this.endpoints.set(key, endpoint);

    // Record in HAR
    this.recordHAREntry(path, method, request, response);
  }

  public getOpenAPISpec(): OpenAPIV3_1.Document {
    const paths = Array.from(this.endpoints.entries()).reduce<Required<PathsObject>>(
      (acc, [key, info]) => {
        const [method, path] = key.split(':');

        if (!acc[path]) {
          acc[path] = {} as Required<PathItemObject>;
        }

        const operation: OpenAPIV3_1.OperationObject = {
          summary: `${method.toUpperCase()} ${path}`,
          responses: info.responses,
        };

        // Only include parameters if there are any
        if (info.parameters.length > 0) {
          // Filter out duplicate parameters and format them correctly
          const uniqueParams = info.parameters.reduce<OpenAPIV3_1.ParameterObject[]>(
            (params, param) => {
              const existing = params.find((p) => p.name === param.name && p.in === param.in);
              if (!existing) {
                const formattedParam: OpenAPIV3_1.ParameterObject = {
                  name: param.name,
                  in: param.in,
                  schema: {
                    type: 'string',
                  } satisfies OpenAPIV3_1.SchemaObject,
                };

                // Only add required field for path parameters
                if (param.in === 'path') {
                  formattedParam.required = true;
                }

                // Only add example for header parameters
                if (param.in === 'header' && param.schema && 'example' in param.schema) {
                  (formattedParam.schema as OpenAPIV3_1.SchemaObject).example =
                    param.schema.example;
                }

                params.push(formattedParam);
              }
              return params;
            },
            []
          );

          operation.parameters = uniqueParams;
        }

        // Only include requestBody if it exists
        if (info.requestBody) {
          operation.requestBody = info.requestBody;
        }

        // Add security if it exists
        if (info.security) {
          operation.security = info.security;
        }

        acc[path][method.toLowerCase()] = operation;
        return acc;
      },
      {}
    );

    const spec: OpenAPIV3_1.Document = {
      openapi: '3.1.0',
      info: {
        title: 'Generated API Documentation',
        version: '1.0.0',
        description: 'Automatically generated API documentation from proxy traffic',
      },
      servers: [
        {
          url: this.targetUrl,
        },
      ],
      paths,
      components: {
        securitySchemes: Object.fromEntries(this.securitySchemes),
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          },
        },
      },
    };

    return spec;
  }

  public getOpenAPISpecAsYAML(): string {
    const spec = this.getOpenAPISpec();
    return stringify(spec, {
      indent: 2,
      simpleKeys: true,
      aliasDuplicateObjects: false,
      strict: true,
    });
  }

  public saveOpenAPISpec(outputDir: string): void {
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

  public generateHAR(): any {
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
