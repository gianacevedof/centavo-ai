import React, { useState, useEffect } from "react";
import { api } from "../services/api";

function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBudgets() {
      setLoading(true);
      try {
        // Using a dummy user_id for now until auth is implemented
        const data = await api.fetchBudgets({ user_id: 3 });
        setBudgets(data);
      } catch (err) {
        console.error("Failed to load budgets:", err);
      } finally {
        setLoading(false);
      }
    }

    loadBudgets();
  }, []);

  if (loading) return <div className="loading">Loading budgets...</div>;

  return (
    <div className="budgets-page">
      <header>
        <h1>Budgets & Goals</h1>
      </header>

      <section className="budgets-section">
        <h2>Monthly Budgets</h2>
        <div className="budget-summary">
          <p>Total Budgeted</p>
          <p>
            $
            {budgets
              .reduce((sum, b) => sum + parseFloat(b.monthly_limit), 0)
              .toFixed(2)}
          </p>
        </div>
        <div className="budget-list">
          {budgets.length === 0 ? (
            <p>No budgets set yet</p>
          ) : (
            budgets.map((bg) => (
              <div key={bg.id} className="budget-item">
                <h3>{bg.category_name}</h3>
                <p>Limit: ${parseFloat(bg.monthly_limit).toFixed(2)}</p>
              </div>
            ))
          )}
        </div>
        <button>+ Add Budget</button>
      </section>

      <section className="goals-section">
        <h2>Active Savings Goals</h2>
        <div className="goal-item">
          <h3>Goal placeholder</h3>
          <p>Target completion: placeholder</p>
          <p>$0.00 of $0.00 goal</p>
        </div>
        <button>+ Add Goal</button>
      </section>
    </div>
  );
}

export default Budgets;
