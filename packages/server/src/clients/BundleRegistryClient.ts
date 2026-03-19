type RegistryBundleKind = 'agent_bundle' | 'room_bundle';
type RegistryVisibility = 'private' | 'public';

export type RegistryBundle = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  kind: RegistryBundleKind;
  visibility: RegistryVisibility;
  createdByUserId: string | null;
  createdAt: string;
};

export type RegistryBundleVersion = {
  id: string;
  bundleId: string;
  version: string;
  createdAt: string;
  createdByUserId: string | null;
  sourceStarshipId: string | null;
  sourceStarshipSlug: string | null;
  schemaVersion: string;
  bundleHash: string;
  artifactKey: string;
  artifactSize: number;
  artifactSha256: string;
  contentSha256: string;
  fileCount: number;
  agentsCount: number;
  toolsCount: number;
  roomsCount: number;
  viewsCount: number;
  datasetsCount: number;
  taskBoardsCount: number;
};

export class BundleRegistryClient {
  private baseUrl: string;
  private token: string;

  constructor(args?: { baseUrl?: string; token?: string }) {
    this.baseUrl = String(args?.baseUrl ?? process.env.BUNDLE_REGISTRY_URL ?? '').trim().replace(/\/+$/, '');
    this.token = String(args?.token ?? process.env.BUNDLE_REGISTRY_AUTH_TOKEN ?? '').trim();
    if (!this.baseUrl) throw new Error('BUNDLE_REGISTRY_URL is required');
    if (!this.token) throw new Error('BUNDLE_REGISTRY_AUTH_TOKEN is required');
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private async json<T>(res: Response): Promise<T> {
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Unexpected registry response: ${res.status} ${text.slice(0, 500)}`);
    }
  }

  async listBundles(): Promise<RegistryBundle[]> {
    const res = await fetch(`${this.baseUrl}/api/bundles`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Registry listBundles failed (${res.status})`);
    const json = await this.json<{ bundles: RegistryBundle[] }>(res);
    return json.bundles ?? [];
  }

  async createBundle(args: {
    slug: string;
    displayName: string;
    description?: string;
    kind: RegistryBundleKind;
    visibility?: RegistryVisibility;
    createdByUserId?: string | null;
  }): Promise<RegistryBundle> {
    const res = await fetch(`${this.baseUrl}/api/bundles`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: args.slug,
        displayName: args.displayName,
        description: args.description ?? '',
        kind: args.kind,
        visibility: args.visibility ?? 'private',
        createdByUserId: args.createdByUserId ?? null,
      }),
    });
    if (!res.ok) throw new Error(`Registry createBundle failed (${res.status})`);
    const json = await this.json<{ bundle: RegistryBundle }>(res);
    return json.bundle;
  }

  async listBundleVersions(bundleId: string): Promise<RegistryBundleVersion[]> {
    const res = await fetch(`${this.baseUrl}/api/bundles/${encodeURIComponent(bundleId)}/versions`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Registry listBundleVersions failed (${res.status})`);
    const json = await this.json<{ versions: RegistryBundleVersion[] }>(res);
    return json.versions ?? [];
  }

  async initBundleVersionUpload(args: { bundleId: string; version: string; contentType?: string }): Promise<{
    s3Key: string;
    uploadUrl: string;
    expiresInSeconds: number;
    requiredHeaders: Record<string, string>;
  }> {
    const url = new URL(`${this.baseUrl}/api/bundles/${encodeURIComponent(args.bundleId)}/versions/upload/init`);
    url.searchParams.set('version', args.version);
    url.searchParams.set('contentType', args.contentType ?? 'application/zip');
    const res = await fetch(url.toString(), { method: 'POST', headers: this.headers() });
    if (!res.ok) throw new Error(`Registry init upload failed (${res.status})`);
    const json = await this.json<{ upload: any }>(res);
    return json.upload;
  }

  async completeBundleVersionUpload(args: {
    bundleId: string;
    version: string;
    s3Key: string;
    createdByUserId?: string | null;
    artifactSizeBytes?: number;
  }): Promise<RegistryBundleVersion> {
    const res = await fetch(`${this.baseUrl}/api/bundles/${encodeURIComponent(args.bundleId)}/versions/upload/complete`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: args.version,
        s3Key: args.s3Key,
        ...(typeof args.artifactSizeBytes === 'number' ? { artifactSizeBytes: args.artifactSizeBytes } : {}),
        createdByUserId: args.createdByUserId ?? null,
      }),
    });
    if (!res.ok) throw new Error(`Registry complete upload failed (${res.status})`);
    const json = await this.json<{ version: RegistryBundleVersion }>(res);
    return json.version;
  }

  async downloadBundleVersionBuffer(versionId: string): Promise<Buffer> {
    const res = await fetch(`${this.baseUrl}/api/bundle-versions/${encodeURIComponent(versionId)}/download`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Registry download failed (${res.status})`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  async downloadBundleVersionStream(versionId: string): Promise<{ contentType?: string; contentDisposition?: string; body: ReadableStream<Uint8Array> }> {
    const res = await fetch(`${this.baseUrl}/api/bundle-versions/${encodeURIComponent(versionId)}/download`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Registry download failed (${res.status})`);
    if (!res.body) throw new Error('Registry download missing body');
    return {
      contentType: res.headers.get('content-type') ?? undefined,
      contentDisposition: res.headers.get('content-disposition') ?? undefined,
      body: res.body,
    };
  }

  async putToPresignedUrl(args: { uploadUrl: string; contentType: string; body: ReadableStream<Uint8Array> }): Promise<void> {
    // Node's fetch requires `duplex: 'half'` for streaming request bodies,
    // but TypeScript's RequestInit type doesn't include it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const init: any = {
      method: 'PUT',
      headers: { 'Content-Type': args.contentType },
      body: args.body,
      duplex: 'half',
    };
    const res = await fetch(args.uploadUrl, init as RequestInit);
    if (!res.ok) throw new Error(`Presigned PUT failed (${res.status})`);
  }
}

