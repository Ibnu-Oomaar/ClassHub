import { useQuery } from '@tanstack/react-query';
import { useMe } from '@/auth/auth-context';
import { PageHeader } from '@/components/page-header';
import { QueryState, RowsSkeleton } from '@/components/states';
import { get } from '@/lib/api';
import { firstName, greeting } from '@/lib/format';
import { format } from 'date-fns';
import { ClassMasterDashboardView } from './class-master-dashboard';
import { StudentDashboardView } from './student-dashboard';
import { TeacherDashboardView } from './teacher-dashboard';
import type { DashboardView } from './types';

export default function DashboardPage() {
  const me = useMe();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashboardView>('/dashboard'), staleTime: 10_000 });

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(me.fullName)}`}
        description={`${query.data?.className ?? '3C Morning Boys'}. Today is ${format(new Date(), 'EEEE d MMMM')}.`}
      />
      <QueryState query={query} skeleton={<RowsSkeleton rows={6} />}>
        {(data) => {
          if (data.role === 'CLASS_MASTER') return <ClassMasterDashboardView data={data} />;
          if (data.role === 'TEACHER') return <TeacherDashboardView data={data} />;
          return <StudentDashboardView data={data} />;
        }}
      </QueryState>
    </>
  );
}
