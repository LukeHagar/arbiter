import { createServer } from 'http';
declare class HARStore {
    private har;
    getHAR(): {
        log: {
            version: string;
            creator: {
                name: string;
                version: string;
            };
            entries: Array<{
                startedDateTime: string;
                time: number;
                request: {
                    method: string;
                    url: string;
                    httpVersion: string;
                    headers: Array<{
                        name: string;
                        value: string;
                    }>;
                    queryString: Array<{
                        name: string;
                        value: string;
                    }>;
                    postData?: any;
                };
                response: {
                    status: number;
                    statusText: string;
                    httpVersion: string;
                    headers: Array<{
                        name: string;
                        value: string;
                    }>;
                    content: {
                        size: number;
                        mimeType: string;
                        text: string;
                    };
                };
                _rawResponseBuffer?: Buffer;
            }>;
        };
    };
    addEntry(entry: typeof this.har.log.entries[0]): void;
    clear(): void;
    private processRawBuffers;
}
export declare const harStore: HARStore;
/**
 * Server configuration options
 */
export interface ServerOptions {
    target: string;
    proxyPort: number;
    docsPort: number;
    verbose?: boolean;
}
/**
 * Sets up and starts the proxy and docs servers
 */
export declare function startServers({ target, proxyPort, docsPort, verbose, }: ServerOptions): Promise<{
    proxyServer: ReturnType<typeof createServer>;
    docsServer: ReturnType<typeof createServer>;
}>;
export {};
