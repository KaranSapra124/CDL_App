import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import FollowUps from "./pages/FollowUps";
import ImportLeads from "./pages/ImportLeads";
import Placeholder from "./pages/Placeholder";
import { getAuth, clearAuth } from "./lib/auth";

function RequireAuth({ children }) {
  const { token, user } = getAuth();

  if (!token || !user) {
    clearAuth();
    return <Navigate to="/login" replace />;
  }

  return children;
}

function GuestRoute({ children }) {
  const { token, user } = getAuth();

  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={getAuth().user ? "/dashboard" : "/login"} replace />}
        />        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/import" element={<ImportLeads />} />
          <Route path="/follow-ups" element={<FollowUps />} />
          <Route
            path="/staff"
            element={
              <Placeholder
                icon="📊"
                title="Staff Performance"
                description="Built from logged calls and attributed payments only."
              />
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
