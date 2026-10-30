export interface ApiResponse {
  status: number;
  /** The parsed JSON body, or null when the response was not JSON (a file download, for instance). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  /** The exact bytes of the body. */
  raw: Buffer;
  headers: Headers;
}

export interface CallOptions {
  token?: string;
  body?: unknown;
  /** multipart/form-data, for uploads. */
  form?: FormData;
  /** Pretend to come from this IP address (the test server trusts one proxy hop). */
  ip?: string;
}

/**
 * A small HTTP client for the running test server. Every request gets its own client IP, so the
 * per-IP rate limits never get in the way unless a test asks for one fixed IP on purpose.
 */
export class Api {
  private counter = 10;

  constructor(
    private readonly baseUrl: string,
    private readonly ipBlock: number = 1,
  ) {}

  private nextIp(): string {
    const n = this.counter++;
    return `10.${this.ipBlock}.${Math.floor(n / 250)}.${n % 250}`;
  }

  async call(method: string, path: string, options: CallOptions = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { 'X-Forwarded-For': options.ip ?? this.nextIp() };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let payload: BodyInit | undefined;
    if (options.form) {
      payload = options.form;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(options.body);
    }
    const response = await fetch(this.baseUrl + path, { method, headers, body: payload });
    const raw = Buffer.from(await response.arrayBuffer());
    let json: unknown = null;
    if ((response.headers.get('content-type') ?? '').includes('json')) {
      try {
        json = JSON.parse(raw.toString('utf8'));
      } catch {
        json = null;
      }
    }
    return { status: response.status, json, raw, headers: response.headers };
  }

  get(path: string, token?: string): Promise<ApiResponse> {
    return this.call('GET', path, { token });
  }

  post(path: string, token: string | undefined, body?: unknown): Promise<ApiResponse> {
    return this.call('POST', path, { token, body: body ?? {} });
  }

  patch(path: string, token: string | undefined, body: unknown): Promise<ApiResponse> {
    return this.call('PATCH', path, { token, body });
  }

  put(path: string, token: string | undefined, body: unknown): Promise<ApiResponse> {
    return this.call('PUT', path, { token, body });
  }

  delete(path: string, token?: string): Promise<ApiResponse> {
    return this.call('DELETE', path, { token });
  }

  /** Sign in and return the access token. Throws with the server's answer when sign-in fails. */
  async login(path: '/auth/class-master-login' | '/auth/teacher-login' | '/auth/student-login', body: Record<string, string>): Promise<string> {
    const response = await this.post(path, undefined, body);
    expectStatus(response, 200);
    return response.json.data.accessToken as string;
  }
}

/** Fails with the server's own answer in the message, which is what you need when a status is wrong. */
export function expectStatus(response: ApiResponse, ...allowed: number[]): void {
  if (!allowed.includes(response.status)) {
    const body = response.json ? JSON.stringify(response.json) : response.raw.toString('utf8').slice(0, 200);
    throw new Error(`Expected HTTP ${allowed.join(' or ')} but got ${response.status}: ${body.slice(0, 500)}`);
  }
}

export const futureIso = (milliseconds: number): string => new Date(Date.now() + milliseconds).toISOString();

export const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Builds a multipart upload with one file. */
export function uploadForm(fields: Record<string, string>, fileName: string, bytes: Buffer, mimeType?: string): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', new Blob([new Uint8Array(bytes)], mimeType ? { type: mimeType } : undefined), fileName);
  return form;
}

export const SMALL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001a5f645400000000049454e44ae426082',
  'hex',
);

export const SMALL_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
