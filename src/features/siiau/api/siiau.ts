const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
export const SIIAU_LAST_NIP_STORAGE_KEY = 'cuceiverse_siiau_last_nip';

function shortToken(token: string): string {
  if (!token) return 'empty';
  return token.length <= 16 ? token : `${token.slice(0, 8)}...${token.slice(-8)}`;
}

export type SiiauScheduleSession = {
  ses?: string | null;
  hora?: string | null;
  dias?: string | null;
  edif?: string | null;
  aula?: string | null;
  periodo?: string | null;
  profesor?: string | null;
};

export type SiiauSnapshotCourse = {
  nrc: string;
  clave: string;
  materia: string;
  creditos?: number | null;
  sec?: string | null;
  sessions?: SiiauScheduleSession[];
  profesor?: string | null;
  warnings?: string[];
};

export type SiiauSnapshot = {
  timestamp: string;
  pidm: string;
  carrera_value?: string | null;
  majrp: string;
  ciclo?: string | null;
  average?: number | null;
  profile?: {
    source: 'kardex-boleta';
    careerName?: string | null;
    average?: number | null;
    creditsEarned?: number | null;
    creditsTotal?: number | null;
    completedClasses?: Array<{
      id: string;
      name: string;
      grade?: number | null;
      description?: string | null;
    }>;
    pendingClasses?: Array<{
      id: string;
      name: string;
      xpReward: number;
    }>;
  };
  courses: SiiauSnapshotCourse[];
  stats: {
    total_courses: number;
    with_schedule: number;
    missing_schedule: number;
  };
};

export type SiiauSessionSnapshotResponse = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  snapshot: SiiauSnapshot | null;
  error: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
};

export async function fetchSessionSiiauSnapshot(
  token: string,
): Promise<SiiauSessionSnapshotResponse> {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[SIIAU][WEB] GET /siiau/session-snapshot', {
      apiBaseUrl: API_BASE_URL,
      token: shortToken(token),
    });
  }

  const response = await fetch(`${API_BASE_URL}/siiau/session-snapshot`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
        : `No se pudo consultar estado SIIAU (${response.status})`;
    throw new Error(message);
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[SIIAU][WEB] session-snapshot OK', {
      httpStatus: response.status,
      status: data.status,
      requestedAt: data.requestedAt,
      updatedAt: data.updatedAt,
      pidm: (data.snapshot as { pidm?: string } | null)?.pidm ?? null,
      totalCourses:
        (data.snapshot as { stats?: { total_courses?: number } } | null)?.stats
          ?.total_courses ?? null,
    });
  }

  return data as unknown as SiiauSessionSnapshotResponse;
}

export async function fetchSnapshotMe(
  token: string,
  nip: string,
  carreraPrefer?: string,
  cicloPrefer?: string,
): Promise<SiiauSnapshot> {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[SIIAU][WEB] POST /siiau/snapshot/me', {
      apiBaseUrl: API_BASE_URL,
      token: shortToken(token),
      hasNip: Boolean(nip?.trim()),
      carreraPrefer: carreraPrefer ?? null,
      cicloPrefer: cicloPrefer ?? null,
    });
  }

  const response = await fetch(`${API_BASE_URL}/siiau/snapshot/me`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nip: nip.trim(),
      ...(carreraPrefer ? { carreraPrefer } : {}),
      ...(cicloPrefer ? { cicloPrefer } : {}),
    }),
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
        : `No se pudo consultar snapshot/me (${response.status})`;
    throw new Error(message);
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[SIIAU][WEB] snapshot/me OK', {
      httpStatus: response.status,
      pidm: (data as { pidm?: string }).pidm ?? null,
      totalCourses:
        (data as { stats?: { total_courses?: number } }).stats?.total_courses ?? null,
    });
  }

  return data as unknown as SiiauSnapshot;
}
