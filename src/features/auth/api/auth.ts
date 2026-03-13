const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    siiauCode: string;
    displayName: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
    createdAt: string;
    updatedAt: string;
  };
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
  const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

  if (!response.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : `Error de autenticacion (${response.status})`;
    throw new Error(message);
  }

  return data as unknown as LoginResponse;
}
