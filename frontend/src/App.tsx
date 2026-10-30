import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/auth-context';
import { FullPageSpinner, PublicOnly, RequireAuth, RequireRole } from '@/auth/guards';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoginChooserPage } from '@/features/auth/login-chooser-page';
import { SetupPage } from '@/features/auth/setup-page';
import { StaffLoginPage } from '@/features/auth/staff-login-page';
import { StudentLoginPage } from '@/features/auth/student-login-page';
import { RouteError } from '@/features/errors/route-error';
import { AppShell } from '@/layout/app-shell';
import { queryClient } from '@/lib/query-client';

const DashboardPage = lazy(() => import('@/features/dashboard/dashboard-page'));
const ProfilePage = lazy(() => import('@/features/profile/profile-page'));
const NotFoundPage = lazy(() => import('@/features/errors/not-found-page'));
const SubjectsPage = lazy(() => import('@/features/subjects/subjects-page'));
const TeachersPage = lazy(() => import('@/features/teachers/teachers-page'));
const StudentsPage = lazy(() => import('@/features/students/students-page'));
const StudentDetailPage = lazy(() => import('@/features/students/student-detail-page'));
const ExaminationsPage = lazy(() => import('@/features/examinations/examinations-page'));
const ExaminationDetailPage = lazy(() => import('@/features/examinations/examination-detail-page'));
const MarksSheetPage = lazy(() => import('@/features/marks/marks-sheet-page'));
const MarksReviewPage = lazy(() => import('@/features/marks/marks-review-page'));
const GradingPage = lazy(() => import('@/features/grading/grading-page'));
const ResultsPage = lazy(() => import('@/features/results/results-page'));
const ResultDetailPage = lazy(() => import('@/features/results/result-detail-page'));
const AssignmentsPage = lazy(() => import('@/features/assignments/assignments-page'));
const AssignmentDetailPage = lazy(() => import('@/features/assignments/assignment-detail-page'));
const AnnouncementsPage = lazy(() => import('@/features/announcements/announcements-page'));
const SettingsPage = lazy(() => import('@/features/settings/settings-page'));
const AuditLogPage = lazy(() => import('@/features/audit-log/audit-log-page'));
const ReportsPage = lazy(() => import('@/features/reports/reports-page'));
const BackupsPage = lazy(() => import('@/features/backups/backups-page'));

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    errorElement: <RouteError />,
    children: [
      { path: '/setup', element: <SetupPage /> },
      { path: '/login', element: <LoginChooserPage /> },
      { path: '/login/student', element: <StudentLoginPage /> },
      { path: '/login/teacher', element: <StaffLoginPage role="TEACHER" /> },
      { path: '/login/class-master', element: <StaffLoginPage role="CLASS_MASTER" /> },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/profile', element: <ProfilePage /> },
          {
            element: <RequireRole roles={['CLASS_MASTER', 'STUDENT']} />,
            children: [
              { path: '/results', element: <ResultsPage /> },
              { path: '/results/:examinationId', element: <ResultDetailPage /> },
            ],
          },
          { path: '/announcements', element: <AnnouncementsPage /> },
          { path: '/reports', element: <ReportsPage /> },
          { path: '/assignments', element: <AssignmentsPage /> },
          { path: '/assignments/:id', element: <AssignmentDetailPage /> },
          { path: '/examinations', element: <ExaminationsPage /> },
          { path: '/examinations/:id', element: <ExaminationDetailPage /> },
          {
            element: <RequireRole roles={['CLASS_MASTER']} />,
            children: [
              { path: '/subjects', element: <SubjectsPage /> },
              { path: '/teachers', element: <TeachersPage /> },
              { path: '/marks-review', element: <MarksReviewPage /> },
              { path: '/grading', element: <GradingPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/audit-log', element: <AuditLogPage /> },
              { path: '/backups', element: <BackupsPage /> },
            ],
          },
          {
            element: <RequireRole roles={['CLASS_MASTER', 'TEACHER']} />,
            children: [
              { path: '/students', element: <StudentsPage /> },
              { path: '/students/:id', element: <StudentDetailPage /> },
              { path: '/marks/:id', element: <MarksSheetPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
]);

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={250}>
            <Suspense fallback={<FullPageSpinner />}>
              <RouterProvider router={router} />
            </Suspense>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
