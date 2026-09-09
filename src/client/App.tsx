import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.tsx';
import { LibraryRoute } from './routes/Library.tsx';
import { SettingsRoute } from './routes/Settings.tsx';

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LibraryRoute />} />
          <Route path="settings" element={<SettingsRoute />} />
          <Route path="*" element={<LibraryRoute />} />
        </Route>
      </Routes>
    </Router>
  );
}
