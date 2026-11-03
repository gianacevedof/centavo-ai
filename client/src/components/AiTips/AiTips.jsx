import React, { useEffect, useState } from "react";
import { api } from "../../services/api";

// Monthly tips from GET /api/ai/tips. Shows a loading line, an error, or the tips.
export default function AiTips() {
  const [loading, setLoading] = useState(true);
  const [tips, setTips] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .fetchAiTips()
      .then((data) => {
        if (!cancelled) setTips(data.tips);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load tips.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h2>Centavo Tips</h2>
      {loading && <p>Loading tips...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading &&
        !error &&
        tips.map((t, i) => (
          <article key={i}>
            <h3>{t.title}</h3>
            <p>{t.body}</p>
          </article>
        ))}
    </section>
  );
}
