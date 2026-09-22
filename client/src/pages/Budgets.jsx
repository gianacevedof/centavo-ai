import React from "react";

function Budgets() {
  return (
    <div>
      <header>
        <h1>Budgets & Goals</h1>
      </header>

      <section>
        <h2>Monthly Budgets</h2>
        <div>
          <p>Total Spent</p>
          <p>$0.00 of $0.00</p>
        </div>
        <div>
          <div>
            <h3>Category placeholder</h3>
            <p>$0.00 of $0.00</p>
          </div>
        </div>
        <button>+ Add Budget</button>
      </section>

      <section>
        <h2>Active Savings Goals</h2>
        <div>
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
