import { Server } from 'node:http';
export interface ServerOptions {
    target: string;
    proxyPort: number;
    docsPort: number;
    verbose?: boolean;
}
export declare function startServers(options: ServerOptions): Promise<{
    proxyServer: Server;
    docsServer: Server;
}>;
