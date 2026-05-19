const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const NETWORK_RETRY_DELAY_MS = 650;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

async function fetchWithNetworkRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error) || attempt === retries) {
        break;
      }
      await wait(NETWORK_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function toApiConnectionError(error: unknown): Error {
  if (isNetworkError(error)) {
    return new Error(
      `Failed to connect to the server`,
    );
  }

  return error instanceof Error ? error : new Error('Error de red desconocido');
}

export type AuthUser = {
  id: string;
  siiauCode: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
};

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

export async function loginWithCodigoNip(codigo: string, nip: string): Promise<LoginResponse> {
  let response: Response;

  try {
    response = await fetchWithNetworkRetry(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ codigo, nip }),
    });
  } catch (error) {
    throw toApiConnectionError(error);
  }

  const rawText = await response.text();
  let data: Record<string, unknown> = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = { message: rawText };
    }
  }

  if (!response.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : `Error de autenticacion (${response.status})`;
    throw new Error(message);
  }

  return data as unknown as LoginResponse;
}

export async function getMyProfile(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo obtener perfil (${response.status})`);
  }

  return (await response.json()) as AuthUser;
}

export async function updateMyAvatar(
  token: string,
  avatarUrl: string | null,
): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ avatarUrl }),
  });

  const rawText = await response.text();
  let data: Record<string, unknown> = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = { message: rawText };
    }
  }

  if (!response.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : `No se pudo guardar el avatar (${response.status})`;
    throw new Error(message);
  }

  return data as AuthUser;
}
