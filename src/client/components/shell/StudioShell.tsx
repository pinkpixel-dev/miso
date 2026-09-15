import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Outlet, useLocation } from 'react-router-dom';
import { wantsFullWidth } from '../../lib/routes.ts';
import { useBackendStatus } from '../../lib/useBackendStatus.ts';
import { BackendBanner } from '../BackendBanner.tsx';
import { PlayerDock } from '../player/PlayerDock.tsx';
import { PlayerProvider } from '../player/PlayerProvider.tsx';
import { cx } from '../ui.tsx';
import { NavRail } from './NavRail.tsx';
import { StudioProvider } from './StudioProvider.tsx';
import { Workspace } from './Workspace.tsx';

/**
 * The frame every screen sits in.
 *
 * Three columns and a dock, or two on a full width route. The rails and
 * the dock are outside the router outlet, so changing route repaints the middle
 * and nothing else, which is what lets a take keep playing while you open
 * settings or move to the region editor.
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
 *
 * The page itself cannot scroll. styles.css pins html, body and #root to full
 * height with overflow hidden, and this frame fills that rather than measuring
 * the viewport itself. A document scrollbar here would let you drag the whole
 * studio off the screen and look at the background below it, which is what it
 * did before, so the height comes from the parent and not from a 100dvh guess.
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

  /*
    Some routes take the width the takes column would have had. A project page
    or a remix page carries its own list of takes, so keeping the column would
    put the same list on screen twice. Models and Settings are app level, and a
    project's takes standing beside them belong to something else.

    Only the column goes. The rail, the dock, and both providers are untouched
    and unkeyed, so nothing here can interrupt playback.
  */
  const fullWidth = wantsFullWidth(useLocation().pathname);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      <BackendBanner status={status} checking={checking} onRetry={recheck} />

      {/*
        One scroll container below lg, two or three above it. Getting this wrong
        gives a page that scrolls behind a fixed dock, so the overflow rules
        live here in one place rather than being spread across the regions.
      */}
      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:overflow-hidden',
          fullWidth
            ? 'lg:grid-cols-[auto_minmax(0,1fr)]'
            : 'lg:grid-cols-[auto_minmax(420px,1fr)_minmax(360px,0.8fr)]',
        )}
      >
        <NavRail />

        <main className="order-1 min-w-0 px-5 py-6 lg:order-none lg:overflow-y-auto">
          <Outlet context={{ status, recheck }} />
        </main>

        {fullWidth ? null : <Workspace />}
      </div>

      <PlayerDock />
    </div>
  );
}
