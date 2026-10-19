export function parseApiOrigin(value: string): string;
export function createDevProxy(target?: string, materials?: boolean): Record<string, any> | undefined;
export function devOriginGuard(target?: string): { name: string; configureServer(server: any): void };
