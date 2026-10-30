import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { ErrorState } from '@/components/states';

/** Shown when a page crashes or a lazy-loaded page cannot be fetched. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong while showing this page.';
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <ErrorState message={message} onRetry={() => window.location.reload()} />
    </div>
  );
}
