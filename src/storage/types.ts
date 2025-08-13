export interface StorageAdapter {
  init(dbPath: string): Promise<void>;
  isReady(): boolean;
  close(): Promise<void>;

  // HAR persistence
  saveHarEntry(entry: any): Promise<void>;
  getHarLog(): Promise<any>;
  clearHar(): Promise<void>;

  // Endpoint persistence
  upsertEndpoint(path: string, method: string, data: any): Promise<void>;
  getAllEndpoints(): Promise<Array<{ path: string; method: string; data: any }>>;
}


