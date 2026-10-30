import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { status: number; data?: unknown; headers?: Record<string, string> } | 'network' | 'timeout';

let reply: (config: InternalAxiosRequestConfig) => Reply = () => ({ status: 200, data: { success: true, data: null } });
let seen: InternalAxiosRequestConfig[] = [];
let api: typeof import('./api');

beforeAll(async () => {
  // The API client is created when the module loads, so the fake network is installed first.
  axios.defaults.adapter = async (config) => {
    seen.push(config);
    const next = reply(config);
    if (next === 'network') throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    if (next === 'timeout') throw new AxiosError('timeout', 'ECONNABORTED', config);
    const response = { data: next.data, status: next.status, statusText: '', headers: next.headers ?? {}, config, request: {} };
    if (next.status >= 400) throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, response as never);
    return response as never;
  };
  api = await import('./api');
});

beforeEach(() => {
  seen = [];
  localStorage.clear();
  reply = () => ({ status: 200, data: { success: true, data: null } });
});

afterEach(() => {
  api.setUnauthorizedHandler(null);
  vi.restoreAllMocks();
});

const rejection = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    return error as InstanceType<typeof import('./api').ApiError>;
  }
  throw new Error('The call was expected to fail');
};

describe('tokenStore', () => {
  it('keeps the token between reads, and forgets it when cleared', () => {
    expect(api.tokenStore.get()).toBeNull();
    api.tokenStore.set('abc');
    expect(api.tokenStore.get()).toBe('abc');
    expect(localStorage.getItem('classhub-token')).toBe('abc');
    api.tokenStore.clear();
    expect(api.tokenStore.get()).toBeNull();
  });

  it('does not crash when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(api.tokenStore.get()).toBeNull();
    expect(() => api.tokenStore.set('abc')).not.toThrow();
    expect(() => api.tokenStore.clear()).not.toThrow();
  });
});

describe('requests', () => {
  it('unwraps the data of the API envelope', async () => {
    reply = () => ({ status: 200, data: { success: true, data: { name: 'Physics' } } });
    await expect(api.get('/subjects/1')).resolves.toEqual({ name: 'Physics' });
  });

  it('sends the session token only when there is one', async () => {
    await api.get('/users/me');
    expect(seen[0].headers.Authorization).toBeUndefined();
    api.tokenStore.set('token-123');
    await api.get('/users/me');
    expect(seen[1].headers.Authorization).toBe('Bearer token-123');
  });

  it('leaves out empty search parameters but keeps 0 and false', async () => {
    await api.get('/students', { search: '', page: 0, active: false, status: null, sort: undefined, name: 'Ali' });
    expect(seen[0].params).toEqual({ page: 0, active: false, name: 'Ali' });
  });

  it('returns a list with its paging details, or works them out when the server sends none', async () => {
    reply = () => ({ status: 200, data: { success: true, data: [1, 2], meta: { page: 2, limit: 2, total: 5, totalPages: 3 } } });
    await expect(api.getPage('/students')).resolves.toEqual({ items: [1, 2], meta: { page: 2, limit: 2, total: 5, totalPages: 3 } });
    reply = () => ({ status: 200, data: { success: true, data: ['a', 'b', 'c'] } });
    const page = await api.getPage('/subjects');
    expect(page.meta).toEqual({ page: 1, limit: 3, total: 3, totalPages: 1 });
  });

  it('sends a file with its other fields as a form, skipping fields that are not set', async () => {
    const file = new File(['hello'], 'work.pdf', { type: 'application/pdf' });
    await api.upload('/submissions', file, { assignmentId: 'a1', note: undefined });
    const form = seen[0].data as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('assignmentId')).toBe('a1');
    expect(form.has('note')).toBe(false);
    expect((form.get('file') as File).name).toBe('work.pdf');
  });
});

describe('failures', () => {
  it('shows the validation problems the server lists, as one readable message', async () => {
    reply = () => ({ status: 400, data: { message: 'Bad Request', errors: ['Name is too short.', 'Student ID is required.'] } });
    const error = await rejection(api.post('/students', {}));
    expect(error).toBeInstanceOf(api.ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Name is too short. Student ID is required.');
    expect(error.details).toEqual(['Name is too short.', 'Student ID is required.']);
  });

  it('shows the server message when there is no list of problems', async () => {
    reply = () => ({ status: 409, data: { message: 'That Student ID is already used.' } });
    const error = await rejection(api.post('/students', {}));
    expect(error.message).toBe('That Student ID is already used.');
    expect(error.status).toBe(409);
  });

  it('falls back to a plain sentence when the server says nothing useful', async () => {
    reply = () => ({ status: 500 });
    expect((await rejection(api.get('/x'))).message).toBe('Something went wrong. Try again.');
  });

  it('tells the person when the server cannot be reached, and when it is too slow', async () => {
    reply = () => 'network';
    const offline = await rejection(api.get('/x'));
    expect(offline.message).toMatch(/Cannot reach the CLASSHUB server/);
    expect(offline.status).toBe(0);
    reply = () => 'timeout';
    expect((await rejection(api.get('/x'))).message).toMatch(/too long/);
  });
});

describe('a session the server stops accepting', () => {
  const unauthorized = () => ({ status: 401, data: { message: 'Unauthorized' } });

  it('signs the person out once, through the registered handler', async () => {
    const handler = vi.fn();
    api.setUnauthorizedHandler(handler);
    api.tokenStore.set('old-token');
    reply = unauthorized;
    await rejection(api.get('/students'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not treat a refused sign-in or setup as an ended session', async () => {
    const handler = vi.fn();
    api.setUnauthorizedHandler(handler);
    api.tokenStore.set('old-token');
    reply = unauthorized;
    await rejection(api.post('/auth/teacher-login', {}));
    await rejection(api.post('/setup/initial', {}));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does nothing when nobody was signed in', async () => {
    const handler = vi.fn();
    api.setUnauthorizedHandler(handler);
    reply = unauthorized;
    await rejection(api.get('/students'));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('downloads', () => {
  beforeEach(() => {
    // Every real browser has Blob.text(); the jsdom test environment does not.
    if (!Blob.prototype.text) {
      Blob.prototype.text = function text(this: Blob) {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(this);
        });
      };
    }
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('saves the file under the name the server gives, decoding it', async () => {
    reply = () => ({ status: 200, data: new Blob(['x']), headers: { 'content-disposition': 'attachment; filename="class%20report.pdf"' } });
    await expect(api.download('/reports/class', { term: 'one' }, 'fallback.pdf')).resolves.toBe('class report.pdf');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it('understands the UTF-8 filename form, so Arabic names survive', async () => {
    const name = encodeURIComponent('تقرير.csv');
    reply = () => ({ status: 200, data: new Blob(['x']), headers: { 'content-disposition': `attachment; filename*=UTF-8''${name}` } });
    await expect(api.download('/reports/class')).resolves.toBe('تقرير.csv');
  });

  it('uses the fallback name when the server gives none', async () => {
    reply = () => ({ status: 200, data: new Blob(['x']) });
    await expect(api.download('/reports/class', undefined, 'fallback.pdf')).resolves.toBe('fallback.pdf');
  });

  it('reads the reason out of a failed download', async () => {
    reply = () => ({ status: 403, data: new Blob([JSON.stringify({ message: 'Not allowed to download this report.' })]) });
    const error = await rejection(api.download('/reports/class'));
    expect(error.message).toBe('Not allowed to download this report.');
    expect(error.status).toBe(403);
  });
});

describe('profile photos', () => {
  it('gives an object URL for a photo, and null when there is none', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    reply = () => ({ status: 200, data: new Blob(['png']) });
    await expect(api.fetchImage('/students/1/photo')).resolves.toBe('blob:photo');
    reply = () => ({ status: 404, data: { message: 'No photo' } });
    await expect(api.fetchImage('/students/1/photo')).resolves.toBeNull();
  });
});
