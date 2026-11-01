import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Footer, Masthead } from './components/Chrome';
import ScrollToTop from './components/ScrollToTop';
import { configProblems } from './config';
import { usePortal } from './lib/portal-context';
import About from './pages/About';
import Agencies from './pages/Agencies';
import Data from './pages/Data';
import Explore from './pages/Explore';
import Project from './pages/Project';
import Enacted from './pages/Enacted';
import Story from './pages/Story';
import VisualHome from './pages/VisualHome';

export default function App() {
  const { config } = usePortal();
  const problems = import.meta.env.DEV ? configProblems(config) : [];
  return (
    <>
      <ScrollToTop />
      <Masthead />
      {problems.length > 0 && (
        <div className="page config-warning" role="alert">
          <strong>portal.config.ts needs attention</strong> (shown in development only):
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <Routes>
        <Route path="/" element={<VisualHome />} />
        <Route path="/data" element={<Data />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/story" element={<Story />} />
        {/* Offices and their districts live on the full-data page; old links land there. */}
        <Route path="/districts" element={<Navigate to="/data#offices" replace />} />
        <Route path="/gaa" element={<Enacted />} />
        <Route path="/agencies" element={<Agencies />} />
        <Route path="/about" element={<About />} />
        <Route path="/projects/:dataset/:id" element={<Project />} />
        <Route
          path="*"
          element={
            <main className="page main">
              <p className="state">This page does not exist. <Link to="/">Back to the map</Link></p>
            </main>
          }
        />
      </Routes>
      <Footer />
    </>
  );
}
