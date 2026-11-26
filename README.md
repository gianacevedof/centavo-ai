# Centavo AI

Centavo AI is a personal and small business finance tracker. You describe a transaction in ordinary language, such as "Spent $45 on lunch using checking," and the app turns it into a record you can review before it is saved. All balances, budget totals, and savings progress are calculated by the backend and the MySQL database, not by the AI (to avoid hallucination).

---

## Purpose

Many people track money by hand in spreadsheets or fall behind on entering receipts, transfers, and deposits. Records then go missing, categories are inconsistent, and balances are out of date. Centavo AI makes routine entry faster and keeps every number traceable to a stored record.

The project separates two jobs:

- **Understanding the text.** The Google Gemini API reads what the user types and proposes fields such as amount, account, type, date, category, and savings goal.
- **Doing the math.** The Express backend validates those fields, saves them to MySQL, and calculates balances, category totals, budget progress, and goal progress from the stored data. The AI never adds, subtracts, or decides a total.

The AI can propose a change, but nothing is saved until the user confirms it. The AI can create and change records. It cannot delete anything.

---

## What the App Does

**Accounts.** Users have checking, savings, credit card, and cash accounts. Each account shows its current balance. Balances change when transactions are recorded, edited, or deleted.

**Transactions.** Users record expenses, income, transfers between their own accounts, and savings contributions. Entries can be made with a standard form or through the chat. Each transaction keeps its source, either entered manually or from the chat, and the original chat text is kept for transactions made that way.

**Categories.** The app has default categories, and users can add their own. Default categories cannot be renamed. A category that is used by history cannot be removed until its transactions are moved.

**Budgets.** Users set a monthly limit for a category and see how much has been spent against it in the current month. Only expenses count toward budget spending. Transfers and savings do not.

**Savings goals.** Users create a goal with a target amount and a target date. Savings contributions are recorded against the goal, so progress is based on stored transactions.

**Overview dashboard.** Shows account balances, budget status, recent transactions, and monthly tips.

**Trends.** Shows monthly spending over the last six months, the average monthly spend, the top spending category, a category breakdown, and a month-over-month table.

**Ask Centavo AI.** A chat that appears on every page. It reads what the user types, then:
- Proposes new or changed transactions, budgets, goals, and categories.
- Shows a plain-English summary of the change, which the user confirms with a yes or no.
- Explains a missing detail with a short question, such as which account or what amount.

**Plain-language explanations.** Users can ask for an explanation of a specific account balance or a budget. The backend builds the facts, and the AI only writes the sentences around them. If a sentence uses a number that is not in the facts, that sentence is discarded and the plain facts are shown instead.

**AI tips.** Short monthly tips are generated from calculated facts. If the AI service is slow or unavailable, a fixed set of general tips is shown.

**Accounts and security.**
- Sign up, log in, and log out.
- Passwords are hashed with argon2 and never stored as plain text.
- Access tokens are short-lived. Refresh sessions are stored in the database as hashes, so logging out ends that session on the server.
- Every database query is limited to the logged-in user's own records.
- A user can export their data or delete their account from Settings.

**Fallback when AI is down.** Users can still record transactions through the standard form and view stored information. Only the AI features stop.

---

## Software Used

| Area | Tools |
|---|---|
| Frontend | React, Vite, CSS modules |
| Backend | Node.js, Express.js |
| Database | MySQL 8 (schema in `database/schema.sql`) |
| AI | Google Gemini API |
| Security | argon2 (password hashing), JSON Web Tokens (sessions) |
| Testing | Node's built-in test runner, Postman, Manual Testing |
| Version control | Git and GitHub |
| Project management | GitHub Projects and a Gantt chart |
| Hosting | Render (frontend and backend), MySQL database |

---

## Team

| Member | Role | Main work |
|---|---|---|
| Giancarlo | Software development | React app, Express API, business logic, Gemini integration |
| Jensen | Database and interface | MySQL schema, queries, CSS and responsive design, Gantt chart |
| Marcos | Quality assurance and documentation | Test plans, defect records, documentation, submission |
| Steeve | Deployment, web design, and research | Hosting, wireframes and visual design, testing, market research |

Roles are primary areas of responsibility. Team members help each other across all areas.
