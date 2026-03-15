const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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

  return data as unknown as SiiauSessionSnapshotResponse;
}
