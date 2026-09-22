import React from "react";

// src/pages/Transactions.jsx

function Transactions() {
  return (
    <div>
      <header>
        <h1>Transactions</h1>
      </header>

      <section>
        <div>
          <select>
            <option>Date Range</option>
          </select>
          <select>
            <option>All Accounts</option>
          </select>
          <select>
            <option>Categories</option>
          </select>
          <button>Clear Filters</button>
        </div>
      </section>

      <section>
        <div>
          <p>Period Income</p>
          <p>$0.00</p>
        </div>
        <div>
          <p>Period Expenses</p>
          <p>$0.00</p>
        </div>
        <div>
          <p>Net Savings</p>
          <p>$0.00</p>
        </div>
      </section>

      <section>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Placeholder</td>
              <td>Placeholder</td>
              <td>Placeholder</td>
              <td>Placeholder</td>
              <td>$0.00</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default Transactions;
