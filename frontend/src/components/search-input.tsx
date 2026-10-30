import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** A search box that tells the page what was typed once the person pauses. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
          onClick={() => {
            setText('');
            onChange('');
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
