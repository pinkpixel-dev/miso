import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { StudioShell } from './components/shell/StudioShell.tsx';
import { Models } from './routes/Models.tsx';
import { ProjectRoute } from './routes/Project.tsx';
import { RemixRoute } from './routes/Remix.tsx';
import { SettingsRoute } from './routes/Settings.tsx';
import { StartRoute } from './routes/Start.tsx';

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<StudioShell />}>
          <Route index element={<StartRoute />} />
          <Route path="projects/:id" element={<ProjectRoute />} />
          {/*
            Two paths, one component. The source is in the address so a take can
            be linked to directly, and the picker is what the page shows when
            nobody has chosen one yet.
          */}
          <Route path="projects/:id/remix" element={<RemixRoute />} />
          <Route path="projects/:id/remix/:assetId" element={<RemixRoute />} />
          <Route path="models" element={<Models />} />
          <Route path="settings" element={<SettingsRoute />} />
          <Route path="*" element={<StartRoute />} />
        </Route>
      </Routes>
    </Router>
  );
}
