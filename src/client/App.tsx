import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { StudioShell } from './components/shell/StudioShell.tsx';
import { CompareRoute } from './routes/Compare.tsx';
import { CreateRoute } from './routes/Create.tsx';
import { LibraryRoute } from './routes/Library.tsx';
import { Models } from './routes/Models.tsx';
import { ProjectRoute } from './routes/Project.tsx';
import { RemixRoute } from './routes/Remix.tsx';
import { SettingsRoute } from './routes/Settings.tsx';
import { StartRoute } from './routes/Start.tsx';
import { StemsRoute } from './routes/Stems.tsx';
import { ToolsRoute } from './routes/Tools.tsx';

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<StudioShell />}>
          <Route index element={<StartRoute />} />
          {/*
            The project itself, and the form that writes into it. Opening a
            project shows the project, so the create form is a page under it
            rather than the thing you land on.
          */}
          <Route path="projects/:id" element={<ProjectRoute />} />
          <Route path="projects/:id/create" element={<CreateRoute />} />
          {/*
            Two paths, one component. The source is in the address so a take can
            be linked to directly, and the picker is what the page shows when
            nobody has chosen one yet.
          */}
          <Route path="projects/:id/remix" element={<RemixRoute />} />
          <Route path="projects/:id/remix/:assetId" element={<RemixRoute />} />
          {/*
            One separation's stems, addressed by the job that made them because
            that is what holds the set together. Project scoped, unlike compare,
            since stems came out of one take and a take lives in one project.
          */}
          <Route path="projects/:id/stems/:jobId" element={<StemsRoute />} />
          {/*
            The workbench. Project scoped because what it saves lands in a
            project, but deliberately not under remix: nothing here queues a
            job or waits on a model.
          */}
          <Route path="projects/:id/tools" element={<ToolsRoute />} />
          {/*
            App level, like models and settings. The library is every project's
            takes, so it belongs to none of them, and compare holds two takes
            that can come from two different projects.
          */}
          <Route path="library" element={<LibraryRoute />} />
          <Route path="compare" element={<CompareRoute />} />
          <Route path="models" element={<Models />} />
          <Route path="settings" element={<SettingsRoute />} />
          <Route path="*" element={<StartRoute />} />
        </Route>
      </Routes>
    </Router>
  );
}
