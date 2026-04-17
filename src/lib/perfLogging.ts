import { getPerfMark, popPerfMark } from './perfMarks';

const LOGIN_REQUEST_START_KEY = 'login.request.start';

function navStartKey(path: string): string {
  return `nav.start:${path}`;
}

export function hasPendingPerf(path: string): boolean {
  return getPerfMark(LOGIN_REQUEST_START_KEY) !== null || getPerfMark(navStartKey(path)) !== null;
}

export function flushPerfForView(params: {
  path: string;
  label: string;
  meta?: Record<string, unknown>;
}): boolean {
  const nowEpochMs = Date.now();
  let didLog = false;

  const navStartEpochMs = popPerfMark(navStartKey(params.path));
  if (navStartEpochMs !== null) {
    console.log('[PERF][WEB] submenú → carga completa', {
      label: params.label,
      path: params.path,
      ms: nowEpochMs - navStartEpochMs,
      ...(params.meta ?? {}),
    });
    didLog = true;
  }

  const loginStartEpochMs = popPerfMark(LOGIN_REQUEST_START_KEY);
  if (loginStartEpochMs !== null) {
    console.log('[PERF][WEB] login request → app lista', {
      label: params.label,
      path: params.path,
      ms: nowEpochMs - loginStartEpochMs,
      ...(params.meta ?? {}),
    });
    didLog = true;
  }

  return didLog;
}
