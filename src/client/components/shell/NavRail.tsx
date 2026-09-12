import { ChevronLeft, ChevronRight, Package, Plus, Settings } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useProjects } from '../../lib/useProjects.ts';
import { IconButton, Tooltip, cx } from '../ui.tsx';
import { RailSection } from './RailSection.tsx';

/**
 * Projects on the left, and the way to the rest of the app.
 *
 * The rail is the whole navigation now. The header used to carry Library,
 * Models and Settings links; Library became this list, and the other two are
 * buttons pinned to the bottom, away from the content they are not part of.
 *
 * Collapsing keeps the projects reachable rather than hiding them. Each one
 * becomes its initial with the full name in a tooltip, because a rail that
 * drops its own navigation when narrowed is just a rail you have to keep
 * reopening.
 */

const COLLAPSE_KEY = 'miso.rail.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    // Private windows and blocked site data both throw here. A rail that
    // forgets its width is fine; a rail that crashes the app is not.
    return false;
  }
}

/** The first character of a project name, for the collapsed rail. */
function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

export function NavRail() {
  const { projects, loading } = useProjects();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const navigate = useNavigate();

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Not remembering the choice is not worth failing over.
      }
      return next;
    });
  }

  const link = (isActive: boolean) =>
    cx(
      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:bg-raised hover:text-ink',
    );

  return (
    <aside
      aria-label="Projects and navigation"
      className={cx(
        'order-3 flex shrink-0 flex-col border-line bg-surface lg:order-none lg:overflow-y-auto',
        'border-t lg:border-t-0 lg:border-r',
        collapsed ? 'lg:w-16' : 'lg:w-56',
      )}
    >
      <div
        className={cx(
          'flex shrink-0 items-center gap-2 px-2 py-2',
          collapsed ? 'lg:justify-center' : 'justify-between',
        )}
      >
        {collapsed ? null : (
          <span className="px-1 font-display text-lg font-semibold tracking-tight text-ink">
            miso
          </span>
        )}
        <IconButton
          label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          icon={collapsed ? ChevronRight : ChevronLeft}
          onClick={toggle}
          className="hidden lg:inline-flex"
        />
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-3 px-2 py-2">
        <RailSection title="Projects" collapsed={collapsed}>
          {loading && projects.length === 0 ? (
            collapsed ? null : (
              <p className="px-2 py-1 text-sm text-ink-faint">Loading.</p>
            )
          ) : projects.length === 0 ? (
            collapsed ? null : (
              <p className="px-2 py-1 text-sm text-ink-faint">No projects yet.</p>
            )
          ) : (
            projects.map((project) =>
              collapsed ? (
                <Tooltip key={project.id} label={project.name}>
                  <NavLink
                    to={`/projects/${project.id}`}
                    aria-label={project.name}
                    className={({ isActive }) =>
                      cx(
                        'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors duration-150',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        isActive
                          ? 'bg-raised text-ink'
                          : 'text-ink-muted hover:bg-raised hover:text-ink',
                      )
                    }
                  >
                    <span aria-hidden="true">{initial(project.name)}</span>
                  </NavLink>
                </Tooltip>
              ) : (
                <NavLink
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className={({ isActive }) => link(isActive)}
                >
                  <span className="truncate">{project.name}</span>
                </NavLink>
              ),
            )
          )}

          {collapsed ? (
            <IconButton label="New project" icon={Plus} onClick={() => void navigate('/')} />
          ) : (
            <button
              type="button"
              onClick={() => void navigate('/')}
              className={cx(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-muted',
                'transition-colors duration-150 hover:bg-raised hover:text-ink',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
              New project
            </button>
          )}
        </RailSection>
      </nav>

      <div
        className={cx(
          'flex shrink-0 gap-1 border-t border-line px-2 py-2',
          collapsed ? 'lg:flex-col lg:items-center' : '',
        )}
      >
        {collapsed ? (
          <>
            <Tooltip label="Models">
              <NavLink
                to="/models"
                aria-label="Models"
                className={({ isActive }) =>
                  cx(
                    'flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:bg-raised hover:text-ink',
                  )
                }
              >
                <Package aria-hidden="true" className="h-4 w-4" />
              </NavLink>
            </Tooltip>
            <Tooltip label="Settings">
              <NavLink
                to="/settings"
                aria-label="Settings"
                className={({ isActive }) =>
                  cx(
                    'flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:bg-raised hover:text-ink',
                  )
                }
              >
                <Settings aria-hidden="true" className="h-4 w-4" />
              </NavLink>
            </Tooltip>
          </>
        ) : (
          <>
            <NavLink to="/models" className={({ isActive }) => cx(link(isActive), 'flex-1')}>
              <Package aria-hidden="true" className="h-4 w-4 shrink-0" />
              Models
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => cx(link(isActive), 'flex-1')}>
              <Settings aria-hidden="true" className="h-4 w-4 shrink-0" />
              Settings
            </NavLink>
          </>
        )}
      </div>
    </aside>
  );
}
