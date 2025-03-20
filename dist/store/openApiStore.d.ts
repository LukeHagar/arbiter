import type { OpenAPIV3_1 } from 'openapi-types';
interface SecurityInfo {
    type: 'apiKey' | 'oauth2' | 'http' | 'openIdConnect';
    scheme?: 'bearer' | 'basic' | 'digest';
    name?: string;
    in?: 'header' | 'query' | 'cookie';
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
declare class OpenAPIStore {
    private endpoints;
    private harEntries;
    private targetUrl;
    private examples;
    private schemaCache;
    private securitySchemes;
    constructor(targetUrl?: string);
    setTargetUrl(url: string): void;
    clear(): void;
    private deepMergeSchemas;
    private generateJsonSchema;
    private recordHAREntry;
    private buildQueryString;
    private addSecurityScheme;
    recordEndpoint(path: string, method: string, request: RequestInfo, response: ResponseInfo): void;
    getOpenAPISpec(): OpenAPIV3_1.Document;
    getOpenAPISpecAsYAML(): string;
    saveOpenAPISpec(outputDir: string): void;
    generateHAR(): any;
}
export declare const openApiStore: OpenAPIStore;
export {};
