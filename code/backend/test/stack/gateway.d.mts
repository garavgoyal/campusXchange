export function signJwt(secret: string, payload: Record<string, unknown>): string;
export function startGateway(options: {
  port: number;
  secret: string;
  postgrestUrl: string;
  storeDir: string;
}): Promise<{ url: string; close(): Promise<void> }>;
