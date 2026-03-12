import { useEffect, useMemo, useState } from "react";

import { buildCampusRoute, interpolatePoint } from "../lib/campus-routing";
import type { GridPoint } from "../types";

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
  const [isMoving, setIsMoving] = useState(false);

  const route = useMemo(() => {
    if (!poiEnd) {
      return [poiStart];
    }

    return buildCampusRoute(poiStart, poiEnd);
  }, [poiEnd, poiStart]);

  useEffect(() => {
    if (!poiEnd || route.length < 2) {
      return;
    }

    let segmentIndex = 0;
    let progress = 0;
    let lastTimestamp = 0;
    let frameId = 0;

    const tick = (timestamp: number) => {
      if (!lastTimestamp) {
        lastTimestamp = timestamp;
        setIsMoving(true);
        setPosition(route[0]);
        frameId = requestAnimationFrame(tick);
        return;
      }

      const deltaSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      progress += deltaSeconds * 2.15;

      while (progress >= 1 && segmentIndex < route.length - 2) {
        progress -= 1;
        segmentIndex += 1;
      }

      const current = route[segmentIndex];
      const next = route[Math.min(segmentIndex + 1, route.length - 1)];

      if (!next || segmentIndex >= route.length - 1) {
        setPosition(route[route.length - 1]);
        setIsMoving(false);
        return;
      }

      const done = segmentIndex >= route.length - 2 && progress >= 1;
      if (done) {
        setPosition(route[route.length - 1]);
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
  }, [poiEnd, route]);

  return {
    position: poiEnd ? position : poiStart,
    route,
    isMoving: poiEnd && route.length >= 2 ? isMoving : false,
  };
}
