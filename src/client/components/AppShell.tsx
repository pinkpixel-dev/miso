import { NavLink, Outlet } from 'react-router-dom';
import { useBackendStatus } from '../lib/useBackendStatus.ts';
import { BackendBanner } from './BackendBanner.tsx';

const NAV = [
  { to: '/', label: 'Library', end: true },
  { to: '/settings', label: 'Settings', end: false },
];

/**
 * The frame every screen sits in.
 *
 * The nav is horizontal at every width rather than collapsing into a drawer:
 * there are two entries now and a handful later, and a hamburger for four links
 * is worse than the links.
 */
export function AppShell() {
  const { status, checking, recheck } = useBackendStatus();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-base/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 sm:px-6">
          <span className="font-display text-lg font-semibold tracking-tight">miso</span>

          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
                    isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:bg-raised hover:text-ink',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <BackendBanner status={status} checking={checking} onRetry={recheck} />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet context={{ status, recheck }} />
      </main>
    </div>
  );
}
