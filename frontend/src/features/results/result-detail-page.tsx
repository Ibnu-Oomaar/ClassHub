import { useMe } from '@/auth/auth-context';
import MyResultView from './my-result-view';
import StandingsView from './standings-view';

export default function ResultDetailPage() {
  const { role } = useMe();
  return role === 'STUDENT' ? <MyResultView /> : <StandingsView />;
}
