const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ codigo, nip }),
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
