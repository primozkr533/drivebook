export interface FileStorage {
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string; size: number } | null>;
  delete(key: string): Promise<void>;
  url(key: string): string;
}
