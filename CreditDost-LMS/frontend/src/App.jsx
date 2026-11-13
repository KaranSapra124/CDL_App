import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
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
          <Route
            path="/follow-ups"
            element={
              <Placeholder
                icon="📞"
                title="Follow-ups"
                description="Your daily task list, with overdue calls first."
              />
            }
          />
          <Route
            path="/payments"
            element={
              <Placeholder
                icon="💳"
                title="Payment Matching"
                description="Every payment, whichever way it arrives, matched to a lead and credited to its owner."
              />
            }
          />
          <Route
            path="/rules"
            element={
              <Placeholder
                icon="⚙️"
                title="Assignment Rules"
                description="Control how leads are distributed, auto-reassignment and caller availability."
              />
            }
          />
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
          <Route
            path="/campaigns"
            element={
              <Placeholder
                icon="📣"
                title="Campaign ROI"
                description="Which ads bring paying customers, not just cheap leads."
              />
            }
          />
          <Route
            path="/audit"
            element={
              <Placeholder
                icon="🧾"
                title="Audit Log"
                description="Every assignment, reassignment and payment credit is recorded."
              />
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
