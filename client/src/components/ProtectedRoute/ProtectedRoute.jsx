import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../../services/api";

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("checking"); // "checking" | "ok" | "no"

  useEffect(() => {
    let cancelled = false;
    api
      .fetchMe()
      .then(() => {
        if (!cancelled) setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("no");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") return null;
  if (status === "no") return <Navigate to="/login" replace />;
  return children;
}
