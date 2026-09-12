import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { StudioShell } from './components/shell/StudioShell.tsx';
import { Models } from './routes/Models.tsx';
import { ProjectRoute } from './routes/Project.tsx';
import { SettingsRoute } from './routes/Settings.tsx';
import { StartRoute } from './routes/Start.tsx';

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<StudioShell />}>
          <Route index element={<StartRoute />} />
          <Route path="projects/:id" element={<ProjectRoute />} />
          <Route path="models" element={<Models />} />
          <Route path="settings" element={<SettingsRoute />} />
          <Route path="*" element={<StartRoute />} />
        </Route>
      </Routes>
    </Router>
  );
}
