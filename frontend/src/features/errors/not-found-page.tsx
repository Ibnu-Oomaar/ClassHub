import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-16 text-center">
      <div>
        <p className="font-display text-7xl text-pen" aria-hidden>
          404
        </p>
        <h1 className="mt-3 text-2xl">That page is not in this book</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">The link may be old, or the page may belong to a different role.</p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
