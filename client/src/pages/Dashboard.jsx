import React from "react";

// src/pages/Dashboard.jsx

function Dashboard() {
  return (
    <div>
      <header>
        <h1>Good morning</h1>
      </header>

      <section>
        <h2>Total Balance</h2>
        <p>$0.00</p>
      </section>

      <section>
        <h2>Accounts</h2>
        <ul>
          <li>Account placeholder</li>
        </ul>
      </section>

      <section>
        <h2>Budgets</h2>
        <ul>
          <li>Budget placeholder</li>
        </ul>
      </section>

      <section>
        <h2>Recent Transactions</h2>
        <ul>
          <li>Transaction placeholder</li>
        </ul>
      </section>

      <section>
        <h2>Ask Balance AI</h2>
        <div>
          <button>How am I doing this month?</button>
          <button>Am I over budget anywhere?</button>
          <button>Can I hit my savings goal?</button>
        </div>
        <p>Answer placeholder</p>
      </section>
    </div>
  );
}

export default Dashboard;
