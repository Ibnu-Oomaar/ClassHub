import { Dialog as DialogPrimitive } from 'radix-ui';
import { LogOut, Menu, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useMe } from '@/auth/auth-context';
import { ROLE_LABEL } from '@/auth/types';
import { Avatar } from '@/components/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { NAVIGATION } from './nav';
import { BrandMark, ClassSticker } from './brand';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useMe();
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scroll-thin">
      {NAVIGATION[role].map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">{group.label}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-primary/12 text-primary' : 'text-foreground/80 hover:bg-subtle hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="size-[1.1rem] shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const photo = !me.hasPhoto ? null : me.role === 'STUDENT' ? '/students/me/photo' : me.role === 'TEACHER' ? '/teachers/me/photo' : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-subtle"
          aria-label="Account menu"
        >
          <Avatar name={me.fullName} photoUrl={photo} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.fullName}</span>
            <span className="block truncate text-xs text-muted-foreground">{ROLE_LABEL[me.role]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel>
          Signed in as {me.fullName}
          {me.studentCode ? `, ${me.studentCode}` : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserRound /> My account
        </DropdownMenuItem>
        <DropdownMenuItem
          danger
          onSelect={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-5 pb-2 pt-6">
        <Link to="/dashboard" onClick={onNavigate} className="inline-block rounded-md">
          <BrandMark />
        </Link>
        <ClassSticker />
      </div>
      <NavList onNavigate={onNavigate} />
      <div className="space-y-1 border-t border-border p-3">
        <UserMenu />
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <span>Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="no-print margin-line sticky top-0 hidden h-dvh border-r border-border bg-surface lg:block">
        <SidebarBody />
      </aside>

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu />
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-foreground/45" />
              <DialogPrimitive.Content
                aria-describedby={undefined}
                className="margin-line fixed inset-y-0 left-0 z-50 w-[18rem] max-w-[85vw] animate-slide-in-left border-r border-border bg-surface shadow-sheet focus-visible:outline-none"
              >
                <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon-sm" className="absolute right-3 top-4" aria-label="Close menu">
                    <X />
                  </Button>
                </DialogPrimitive.Close>
                <SidebarBody onNavigate={() => setOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <Link to="/dashboard" className="rounded-md">
            <BrandMark compact />
          </Link>
          <ThemeToggle />
        </header>

        <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[74rem] px-4 py-6 focus-visible:outline-none sm:px-8 sm:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
