import { useEffect, useState } from 'react';

import { buildCampusRoute, interpolatePoint } from '../lib/campus-routing';
import type { GridPoint } from '../types';

type UseFakeUserPositionResult = {
  position: GridPoint;
  route: GridPoint[];
  isMoving: boolean;
};

export function useFakeUserPosition(
  poiStart: GridPoint,
  poiEnd: GridPoint | null,
): UseFakeUserPositionResult {
  const [position, setPosition] = useState<GridPoint>(poiStart);
  const [route, setRoute] = useState<GridPoint[]>([poiStart]);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!poiEnd) {
      setPosition(poiStart);
      setRoute([poiStart]);
      setIsMoving(false);
      return;
    }

    const nextRoute = buildCampusRoute(poiStart, poiEnd);
    setRoute(nextRoute);

    if (nextRoute.length < 2) {
      setPosition(poiEnd);
      setIsMoving(false);
      return;
    }

    let segmentIndex = 0;
    let progress = 0;
    let lastTimestamp = performance.now();
    let frameId = 0;
    setIsMoving(true);
    setPosition(nextRoute[0]);

    const tick = (timestamp: number) => {
      const deltaSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      progress += deltaSeconds * 2.15;

      while (progress >= 1 && segmentIndex < nextRoute.length - 2) {
        progress -= 1;
        segmentIndex += 1;
      }

      const current = nextRoute[segmentIndex];
      const next = nextRoute[Math.min(segmentIndex + 1, nextRoute.length - 1)];

      if (!next || segmentIndex >= nextRoute.length - 1) {
        setPosition(nextRoute[nextRoute.length - 1]);
        setIsMoving(false);
        return;
      }

      const done = segmentIndex >= nextRoute.length - 2 && progress >= 1;
      if (done) {
        setPosition(nextRoute[nextRoute.length - 1]);
        setIsMoving(false);
        return;
      }

      setPosition(interpolatePoint(current, next, Math.min(progress, 1)));
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [poiEnd, poiStart]);

  return { position, route, isMoving };
}