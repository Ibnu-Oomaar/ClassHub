
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'classhub-token';

/** The signed-in session token. Kept in localStorage so a page refresh keeps you signed in. */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage blocked: the session then lasts until the page is closed.
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

/** A failed API call with a message that is safe to show to the person using the app. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Individual validation problems, when the server lists them. */
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  message?: string;
  errors?: string[];
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ErrorBody>;

    if (!axiosError.response) {
      return new ApiError(
        axiosError.code === 'ECONNABORTED'
          ? 'The server took too long to answer. Try again.'
          : 'Cannot reach the CLASSHUB server. Check that it is running and that you are on the same network.',
        0,
      );
    }

    const { status, data } = axiosError.response;
    const details = Array.isArray(data?.errors) ? data.errors : [];

    const message =
      details.length > 0
        ? details.join(' ')
        : data?.message || 'Something went wrong. Try again.';

    return new ApiError(message, status, details);
  }

  return new ApiError('Something went wrong. Try again.', 0);
}

/** A failed download arrives as a file (blob): read the JSON error out of it so its message can be shown. */
async function readBlobBody(error: unknown): Promise<void> {
  if (!axios.isAxiosError(error) || !(error.response?.data instanceof Blob)) {
    return;
  }

  try {
    error.response.data = JSON.parse(
      await error.response.data.text(),
    );
  } catch {
    error.response.data = undefined;
  }
}

let onUnauthorized: (() => void) | null = null;

/** The sign-in provider registers here to be told when the server no longer accepts the session. */
export function setUnauthorizedHandler(
  handler: (() => void) | null,
): void {
  onUnauthorized = handler;
}

const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

const client = axios.create({
  baseURL: API_BASE_URL
    ? `${API_BASE_URL}/api/v1`
    : '/api/v1',
  timeout: 30_000,
});

client.interceptors.request.use((config) => {
  const token = tokenStore.get();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    await readBlobBody(error);

    const apiError = toApiError(error);

    const url = axios.isAxiosError(error)
      ? (error.config?.url ?? '')
      : '';

    // A rejected sign-in attempt is also a 401:
    // only a session that stops working signs you out.
    if (
      apiError.status === 401 &&
      tokenStore.get() &&
      !url.includes('/auth/') &&
      !url.includes('/setup/')
    ) {
      onUnauthorized?.();
    }

    return Promise.reject(apiError);
  },
);

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: PageMeta;
}

export type Query = Record<
  string,
  string | number | boolean | null | undefined
>;

function clean(params?: Query): Query | undefined {
  if (!params) return undefined;

  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '',
    ),
  );
}

export async function get<T>(
  url: string,
  params?: Query,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await client.get<Envelope<T>>(url, {
    ...config,
    params: clean(params),
  });

  return response.data.data;
}

export async function getPage<T>(
  url: string,
  params?: Query,
): Promise<Page<T>> {
  const response = await client.get<Envelope<T[]>>(url, {
    params: clean(params),
  });

  return {
    items: response.data.data,
    meta: response.data.meta ?? {
      page: 1,
      limit: response.data.data.length,
      total: response.data.data.length,
      totalPages: 1,
    },
  };
}

export async function post<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return (
    await client.post<Envelope<T>>(url, body, config)
  ).data.data;
}

export async function put<T>(
  url: string,
  body?: unknown,
): Promise<T> {
  return (
    await client.put<Envelope<T>>(url, body)
  ).data.data;
}

export async function patch<T>(
  url: string,
  body?: unknown,
): Promise<T> {
  return (
    await client.patch<Envelope<T>>(url, body)
  ).data.data;
}

export async function del<T>(url: string): Promise<T> {
  return (
    await client.delete<Envelope<T>>(url)
  ).data.data;
}

/** Sends a file with other fields as multipart form data. */
export async function upload<T>(
  url: string,
  file: File,
  fields: Record<string, string | undefined> = {},
): Promise<T> {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      form.append(key, value);
    }
  }

  form.append('file', file);

  return post<T>(url, form, {
    timeout: 15 * 60_000,
  });
}

function fileNameFrom(
  disposition: string | undefined,
  fallback: string,
): string {
  const match =
    /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(
      disposition ?? '',
    );

  const raw = match?.[1] ?? match?.[2];

  if (!raw) return fallback;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Downloads a file the signed-in user is allowed to get. */
export async function download(
  url: string,
  params?: Query,
  fallbackName = 'download',
): Promise<string> {
  const response = await client.get<Blob>(url, {
    params: clean(params),
    responseType: 'blob',
    timeout: 15 * 60_000,
  });

  const name = fileNameFrom(
    response.headers['content-disposition'] as string | undefined,
    fallbackName,
  );

  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = name;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);

  return name;
}

/** Fetches a protected image (profile photo) as an object URL, or null when there is none. */
export async function fetchImage(
  url: string,
): Promise<string | null> {
  try {
    const response = await client.get<Blob>(url, {
      responseType: 'blob',
    });

    return URL.createObjectURL(response.data);
  } catch {
    return null;
  }
}
