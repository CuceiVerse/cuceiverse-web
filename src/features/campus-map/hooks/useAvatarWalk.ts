import { useCallback, useEffect, useRef, useState } from 'react';

import { gridAStarPath, snapToPathTile } from '../lib/gridAStar';
import type { GridCell } from '../editor/modularMapTypes';

// Starting position: near Módulo G (grey path tiles area to the left of it)
const AVATAR_ORIGIN: GridCell = { x: 24, y: 20 };

// Walking speed in cells per second (reduced from 4 for more natural flow)
const WALK_SPEED = 2.5;

// Animation frame rate (how fast the walk frames cycle 0->1->2->3)
const ANIMATION_FRAME_RATE = 0.12; // seconds per frame (~8.3 FPS)

/**
 * Maps movement delta to a Habbo direction number.
 */
function toHabboDirection(dx: number, dy: number): number {
  if (dx > 0 && dy > 0) return 3;  // SE
  if (dx > 0 && dy < 0) return 1;  // NE
  if (dx < 0 && dy > 0) return 5;  // SW
  if (dx < 0 && dy < 0) return 7;  // NW
  if (dx > 0) return 2;             // E
  if (dx < 0) return 6;             // W
  if (dy > 0) return 4;             // S
  return 0;                          // N (default)
}

type AvatarWalkResult = {
  /** Current interpolated position (fractional cell coords) */
  position: { x: number; y: number };
  /** Whether the avatar is currently walking */
  isMoving: boolean;
  /** Habbo direction number (0-7) for sprite direction */
  habboDirection: number;
  /** Current animation frame (0-3 for walking) */
  walkFrame: number;
  /** Trigger a walk to the target cell */
  walk: (target: GridCell) => void;
  /** Path being followed */
  pathCells: GridCell[];
};

export function useAvatarWalk(
  pathCellsSet: ReadonlySet<string>,
): AvatarWalkResult {
  const [position, setPosition] = useState<{ x: number; y: number }>(AVATAR_ORIGIN);
  const [isMoving, setIsMoving] = useState(false);
  const [habboDirection, setHabboDirection] = useState(2); // default facing SE
  const [walkFrame, setWalkFrame] = useState(0);
  const [pathCells, setPathCells] = useState<GridCell[]>([]);

  const frameRef = useRef(0);
  const pathRef = useRef<GridCell[]>([]);
  const segmentIndexRef = useRef(0);
  const progressRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const animTimeRef = useRef(0);

  /** Stop any current animation */
  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    lastTimestampRef.current = 0;
    animTimeRef.current = 0;
    setIsMoving(false);
    setWalkFrame(0);
  }, []);

  const walk = useCallback(
    (target: GridCell) => {
      // Snap to integer cell
      const currentCell: GridCell = {
        x: Math.round(position.x),
        y: Math.round(position.y),
      };

      const snappedStart = snapToPathTile(currentCell, pathCellsSet);
      const snappedEnd = snapToPathTile(target, pathCellsSet);

      if (!snappedStart || !snappedEnd) return;

      const path = gridAStarPath(snappedStart, snappedEnd, pathCellsSet);
      if (path.length < 2) return;

      stopAnimation();

      pathRef.current = path;
      setPathCells(path);
      segmentIndexRef.current = 0;
      progressRef.current = 0;
      animTimeRef.current = 0;

      const tick = (timestamp: number) => {
        if (!lastTimestampRef.current) {
          lastTimestampRef.current = timestamp;
          setIsMoving(true);
          setPosition({ x: path[0].x + 0.5, y: path[0].y + 0.5 });
          frameRef.current = requestAnimationFrame(tick);
          return;
        }

        const delta = (timestamp - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = timestamp;
        progressRef.current += delta * WALK_SPEED;
        animTimeRef.current += delta;

        // Cycle through walking frames (0, 1, 2, 3)
        const currentFrame = Math.floor(animTimeRef.current / ANIMATION_FRAME_RATE) % 4;
        setWalkFrame(currentFrame);

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
        setHabboDirection(toHabboDirection(dx, dy));

        setPosition({
          x: from.x + 0.5 + (to.x - from.x) * t,
          y: from.y + 0.5 + (to.y - from.y) * t,
        });

        const done = si >= path.length - 2 && progressRef.current >= 1;
        if (done) {
          const last = path[path.length - 1];
          setPosition({ x: last.x + 0.5, y: last.y + 0.5 });
          setPathCells([]);
          stopAnimation();
          return;
        }

        frameRef.current = requestAnimationFrame(tick);
      };

      frameRef.current = requestAnimationFrame(tick);
    },
    [pathCellsSet, position, stopAnimation],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { position, isMoving, habboDirection, walkFrame, walk, pathCells };
}
