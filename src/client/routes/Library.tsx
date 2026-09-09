import { Link } from 'react-router-dom';
import { Panel } from '../components/ui.tsx';

/**
 * Placeholder until phase 3 brings projects and assets. It exists so the shell
 * has somewhere to land and the nav is not a single item.
 */
export function LibraryRoute() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl">Library</h1>
        <p className="mt-1 text-ink-muted">Your projects and everything you have made.</p>
      </div>

      <Panel title="Nothing here yet">
        <p className="text-sm text-ink-muted">
          Projects arrive in phase 3, and generation in phase 4. For now, use{' '}
          <Link to="/settings" className="text-accent underline underline-offset-4 hover:no-underline">
            Settings
          </Link>{' '}
          to point Miso at a running audio.cpp server and confirm it answers.
        </p>
      </Panel>
    </div>
  );
}
