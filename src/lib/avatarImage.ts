type AvatarRenderOptions = {
  size?: 'n' | 's';
  direction?: number;
  headDirection?: number;
  action?: string;
  gesture?: string;
  format?: 'png' | 'gif';
  frame?: number;
};

export function extractFigureFromAvatarValue(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // 1) Si es URL (absoluta o relativa), extraer ?figure= cuando exista.
  try {
    const parsedUrl = new URL(
      trimmed,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    );
    const figure = parsedUrl.searchParams.get('figure');
    if (figure?.trim()) {
      return figure.trim();
    }
  } catch {
    // No es URL parseable; seguir con heurística de figura.
  }

  // 2) Figura Habbo: "hd-... .ch-..." etc. (type-setId-colors...).
  // Evita falsos positivos como "https://foo-bar.com/a.png".
  const FIGURE_RE = /^(?:[a-z]{2}-\d+(?:-\d+){0,6})(?:\.[a-z]{2}-\d+(?:-\d+){0,6})*$/i;
  if (FIGURE_RE.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function resolveAvatarImage(
  avatarValue: string | null,
  options?: AvatarRenderOptions,
): string | null {
  if (!avatarValue) return null;

  const trimmed = avatarValue.trim();
  if (!trimmed) return null;

  const figure = extractFigureFromAvatarValue(trimmed);
  if (figure) {
    const params = new URLSearchParams({
      figure,
      size: options?.size ?? 's',
      direction: String(options?.direction ?? 2),
      head_direction: String(options?.headDirection ?? options?.direction ?? 2),
      action: options?.action ?? 'std',
      gesture: options?.gesture ?? 'std',
      img_format: options?.format ?? 'png',
    });

    if (typeof options?.frame === 'number' && Number.isFinite(options.frame)) {
      params.set('frame_num', String(options.frame));
    }

    return `/habbo-api/render?${params.toString()}`;
  }

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  return null;
}
