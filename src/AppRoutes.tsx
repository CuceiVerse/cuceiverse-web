import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import { LoginView } from './views/LoginView';
import { MainLayout } from './components/MainLayout';

const HomeView = lazy(() => import('./views/HomeView').then((module) => ({ default: module.HomeView })));
const SubjectsView = lazy(() => import('./views/SubjectsView').then((module) => ({ default: module.SubjectsView })));
const AvatarsView = lazy(() => import('./views/AvatarsView').then((module) => ({ default: module.AvatarsView })));
const StudentScheduleView = lazy(() => import('./views/StudentScheduleView').then((module) => ({ default: module.StudentScheduleView })));
const AcademicProfileView = lazy(() => import('./views/AcademicProfileView').then((module) => ({ default: module.AcademicProfileView })));
const MapEditorView = lazy(() => import('./views/MapEditorView').then((module) => ({ default: module.MapEditorView })));
const TramitesView = lazy(() => import('./views/TramitesView').then((module) => ({ default: module.TramitesView })));

const routeFallback = (
  <div className="flex h-[calc(100dvh-4rem)] w-full items-center justify-center bg-slate-950 text-slate-200">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
      <p className="text-sm font-semibold tracking-widest uppercase text-cyan-300">
        Cargando módulo...
      </p>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginView />
          </PublicRoute>
        }
      />

      {/* Protected Routes wrapped in MainLayout */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/home"
          element={
            <Suspense fallback={routeFallback}>
              <HomeView />
            </Suspense>
          }
        />
        <Route
          path="/admin/mapa"
          element={
            <AdminRoute>
              <Suspense fallback={routeFallback}>
                <MapEditorView />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="/subjects"
          element={
            <Suspense fallback={routeFallback}>
              <SubjectsView />
            </Suspense>
          }
        />
        <Route
          path="/schedule"
          element={
            <Suspense fallback={routeFallback}>
              <StudentScheduleView />
            </Suspense>
          }
        />
        <Route
          path="/profile-hud"
          element={
            <Suspense fallback={routeFallback}>
              <AcademicProfileView />
            </Suspense>
          }
        />
        <Route
          path="/avatars"
          element={
            <Suspense fallback={routeFallback}>
              <AvatarsView />
            </Suspense>
          }
        />
        <Route
          path="/tramites"
          element={
            <Suspense fallback={routeFallback}>
              <TramitesView />
            </Suspense>
          }
        />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Route>

      {/* Catch all route - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
