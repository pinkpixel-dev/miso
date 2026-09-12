import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Outlet } from 'react-router-dom';
import { useBackendStatus } from '../../lib/useBackendStatus.ts';
import { BackendBanner } from '../BackendBanner.tsx';
import { PlayerDock } from '../player/PlayerDock.tsx';
import { PlayerProvider } from '../player/PlayerProvider.tsx';
import { NavRail } from './NavRail.tsx';
import { StudioProvider } from './StudioProvider.tsx';
import { Workspace } from './Workspace.tsx';

/**
 * The frame every screen sits in.
 *
 * Three columns and a dock. The rails and the dock are outside the router
 * outlet, so changing route repaints the middle and nothing else, which is what
 * lets a take keep playing while you open settings.
 *
 * The provider order matters and is not arbitrary. PlayerProvider is outermost
 * because it must outlive everything, including a change of project.
 * StudioProvider is inside it and is never keyed, so the dock underneath it
 * cannot be remounted by a project change either.
 *
 * This is a desktop layout. Below lg the columns stack into one scroll in the
 * order create, takes, rail, and the dock stays where it is. That is not a
 * phone experience and is not meant to be one: it is the desktop studio not
 * breaking when the window is small.
 */
export function StudioShell() {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={300}>
      <PlayerProvider>
        <StudioProvider>
          <ShellFrame />
        </StudioProvider>
      </PlayerProvider>
    </RadixTooltip.Provider>
  );
}

function ShellFrame() {
  const { status, checking, recheck } = useBackendStatus();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <BackendBanner status={status} checking={checking} onRetry={recheck} />

      {/*
        One scroll container below lg, three above it. Getting this wrong gives
        a page that scrolls behind a fixed dock, so the overflow rules live
        here in one place rather than being spread across the three regions.
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[auto_minmax(420px,1fr)_minmax(360px,0.8fr)] lg:overflow-hidden">
        <NavRail />

        <main className="order-1 min-w-0 px-5 py-6 lg:order-none lg:overflow-y-auto">
          <Outlet context={{ status, recheck }} />
        </main>

        <Workspace />
      </div>

      <PlayerDock />
    </div>
  );
}
