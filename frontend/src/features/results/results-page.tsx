import { useMe } from '@/auth/auth-context';
import ClassMasterResultsList from './class-master-results-list';
import MyResultsList from './my-results-list';

/** Students see their own published results; the Class Master sees every examination to review and publish. */
export default function ResultsPage() {
  const { role } = useMe();
  return role === 'STUDENT' ? <MyResultsList /> : <ClassMasterResultsList />;
}
