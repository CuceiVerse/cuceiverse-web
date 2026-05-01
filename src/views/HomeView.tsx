import { Suspense, lazy } from 'react';

import './HomeView.css';

const ModularReadOnlyMap = lazy(() =>
  import('../features/campus-map/components/ModularReadOnlyMap').then((module) => ({
    default: module.ModularReadOnlyMap,
  })),
);

export const HomeView = () => {
  return (
    <div className="home-container animate-fade-in">
      <Suspense
        fallback={
          <div className="flex h-full min-h-[60vh] items-center justify-center rounded-[28px] border border-slate-700/50 bg-slate-950/80 text-slate-200">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
              <p className="text-sm font-semibold tracking-widest uppercase text-cyan-300">
                Preparando mapa...
              </p>
            </div>
          </div>
        }
      >
        <ModularReadOnlyMap />
      </Suspense>
    </div>
  );
};
