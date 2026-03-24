import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import { gridAStarPath, snapToPathTile } from '../lib/gridAStar';
import type { GridCell } from '../editor/modularMapTypes';

// Starting position: near Módulo G (grey path tiles area to the left of it)
const AVATAR_ORIGIN: GridCell = { x: 83, y: 44 };
const AVATAR_POSITION_STORAGE_KEY = 'cuceiverse.map.avatarPosition.v4';

// Walking speed in cells per second (reduced from 4 for more natural flow)
const WALK_SPEED = 2.5;

function getIdleDirection(viewMode: 'isometric' | '2d'): number {
  return viewMode === 'isometric' ? 3 : 2;
}

function readStoredAvatarPosition(): { x: number; y: number } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AVATAR_POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = typeof parsed.x === 'number' ? parsed.x : NaN;
    const y = typeof parsed.y === 'number' ? parsed.y : NaN;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  } catch {
    return null;
  }
}

function persistAvatarPosition(position: { x: number; y: number }) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(AVATAR_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // ignore persistence errors
  }
}

/**
 * Maps movement delta to a Habbo direction number.
 * In isometric view the path moves on grid axes, but on screen those axes
 * become diagonals, so we convert grid motion into screen motion first.
 */
function toHabboDirection(
  dx: number,
  dy: number,
  viewMode: 'isometric' | '2d',
): number {
  const screenDx = viewMode === 'isometric' ? dx - dy : dx;
  const screenDy = viewMode === 'isometric' ? dx + dy : dy;

  if (screenDx > 0 && screenDy > 0) return 3; // SE
  if (screenDx > 0 && screenDy < 0) return 1; // NE
  if (screenDx < 0 && screenDy > 0) return 5; // SW
  if (screenDx < 0 && screenDy < 0) return 7; // NW
  if (screenDx > 0) return 2; // E
  if (screenDx < 0) return 6; // W
  if (screenDy > 0) return 4; // S
  return 0; // N
}

type AvatarWalkResult = {
  /** Current interpolated position (fractional cell coords) */
  position: { x: number; y: number };
  /** Mutable position ref for imperative renderers */
  positionRef: MutableRefObject<{ x: number; y: number }>;
  /** Whether the avatar is currently walking */
  isMoving: boolean;
  /** Habbo direction number (0-7) for sprite direction */
  habboDirection: number;
  /** Current animation frame (0-3 for walking) */
  walkFrame: number;
  /** Trigger a walk to the target cell */
  walk: (target: GridCell) => void;
  /** Trigger a walk following a precomputed path (list of grid cells). */
  walkPath: (path: GridCell[]) => void;
  /** Cancel the current movement, keeping the avatar where it is. */
  cancel: () => void;
  /** Path being followed */
  pathCells: GridCell[];
};

export function useAvatarWalk(
  pathCellsSet: ReadonlySet<string>,
  viewMode: 'isometric' | '2d' = 'isometric',
): AvatarWalkResult {
  const idleDirection = getIdleDirection(viewMode);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const stored = readStoredAvatarPosition();
    return stored ?? {
      x: AVATAR_ORIGIN.x + 0.5,
      y: AVATAR_ORIGIN.y + 0.5,
    };
  });
  const [isMoving, setIsMoving] = useState(false);
  const [habboDirection, setHabboDirection] = useState(idleDirection);
  const [walkFrame, setWalkFrame] = useState(0);

  const frameRef = useRef(0);
  const pathRef = useRef<GridCell[]>([]);
  const positionRef = useRef(position);
  const directionRef = useRef(habboDirection);
  const segmentIndexRef = useRef(0);
  const progressRef = useRef(0);
  const lastTimestampRef = useRef(0);

  useEffect(() => {
    positionRef.current = position;
    persistAvatarPosition(position);
  }, [position]);

  useEffect(() => {
    directionRef.current = habboDirection;
  }, [habboDirection]);

  useEffect(() => {
    if (isMoving) {
      return;
    }
    directionRef.current = idleDirection;
    setHabboDirection(idleDirection);
  }, [idleDirection, isMoving]);

  /** Stop any current animation */
  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    lastTimestampRef.current = 0;
    setIsMoving(false);
    setWalkFrame(0);
    pathRef.current = [];
  }, []);

  const startWalkingPath = useCallback(
    (path: GridCell[]) => {
      if (path.length < 2) return;

      stopAnimation();

      pathRef.current = path;
      segmentIndexRef.current = 0;
      progressRef.current = 0;

      const firstSegment = {
        dx: path[1].x - path[0].x,
        dy: path[1].y - path[0].y,
      };
      const initialDirection = toHabboDirection(firstSegment.dx, firstSegment.dy, viewMode);
      directionRef.current = initialDirection;
      setHabboDirection(initialDirection);

      const tick = (timestamp: number) => {
        if (!lastTimestampRef.current) {
          lastTimestampRef.current = timestamp;
          setIsMoving(true);
          const nextPosition = { x: path[0].x + 0.5, y: path[0].y + 0.5 };
          positionRef.current = nextPosition;
          setPosition(nextPosition);
          frameRef.current = requestAnimationFrame(tick);
          return;
        }

        const delta = (timestamp - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = timestamp;
        progressRef.current += delta * WALK_SPEED;

        while (progressRef.current >= 1 && segmentIndexRef.current < path.length - 2) {
          progressRef.current -= 1;
          segmentIndexRef.current += 1;
        }

        const si = segmentIndexRef.current;
        const from = path[si];
        const to = path[Math.min(si + 1, path.length - 1)];
        const t = Math.min(progressRef.current, 1);

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const nextDirection = toHabboDirection(dx, dy, viewMode);
        if (nextDirection !== directionRef.current) {
          directionRef.current = nextDirection;
          setHabboDirection(nextDirection);
        }

        const nextPosition = {
          x: from.x + 0.5 + (to.x - from.x) * t,
          y: from.y + 0.5 + (to.y - from.y) * t,
        };
        positionRef.current = nextPosition;

        const done = si >= path.length - 2 && progressRef.current >= 1;
        if (done) {
          const last = path[path.length - 1];
          const lastPosition = { x: last.x + 0.5, y: last.y + 0.5 };
          positionRef.current = lastPosition;
          directionRef.current = idleDirection;
          setHabboDirection(idleDirection);
          setPosition(lastPosition);
          stopAnimation();
          return;
        }

        frameRef.current = requestAnimationFrame(tick);
      };

      frameRef.current = requestAnimationFrame(tick);
    },
    [idleDirection, stopAnimation, viewMode],
  );

  const walk = useCallback(
    (target: GridCell) => {
      // Convert fractional (centered) coords back into integer cell coords.
      // Our convention is: cell centers are (cell.x + 0.5, cell.y + 0.5).
      // Using Math.round(position.x) would incorrectly jump at .5 boundaries.
      const currentCell: GridCell = {
        x: Math.round(positionRef.current.x - 0.5),
        y: Math.round(positionRef.current.y - 0.5),
      };

      const snappedStart = snapToPathTile(currentCell, pathCellsSet);
      const snappedEnd = snapToPathTile(target, pathCellsSet);

      if (!snappedStart || !snappedEnd) return;

      const path = gridAStarPath(snappedStart, snappedEnd, pathCellsSet);
      if (path.length < 2) return;

      startWalkingPath(path);
    },
    [pathCellsSet, startWalkingPath],
  );

  const walkPath = useCallback(
    (path: GridCell[]) => {
      startWalkingPath(path);
    },
    [startWalkingPath],
  );

  const cancel = useCallback(() => {
    stopAnimation();
    // "Congelar" el estado en la posición actual (positionRef) para que
    // la UI y la persistencia reflejen el punto donde se canceló.
    setPosition({ ...positionRef.current });
  }, [stopAnimation]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
      persistAvatarPosition(positionRef.current);
    };
  }, []);

  return {
    position,
    positionRef,
    isMoving,
    habboDirection,
    walkFrame,
    walk,
    walkPath,
    cancel,
    pathCells: pathRef.current,
  };
}
