import "./App.css";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Settings from "./pages/Settings";
import Trends from "./pages/Trends";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <ProtectedRoute>
              <>
                <Outlet />
                <ChatPanel />
              </>
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="settings" element={<Settings />} />
          <Route path="trends" element={<Trends />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
