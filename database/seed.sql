-- Centavo AI — Dev Seed Data
-- WARNING: truncates all tables. Do NOT run against a DB with real data.
-- Re-runnable: safe to execute multiple times.

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE transactions;
TRUNCATE TABLE budgets;
TRUNCATE TABLE savings_goals;
TRUNCATE TABLE accounts;
TRUNCATE TABLE categories;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. GLOBAL DEFAULT CATEGORIES (user_id = NULL)
-- ============================================================
INSERT INTO categories (user_id, name, is_default) VALUES
    (NULL, 'Groceries',     TRUE),
    (NULL, 'Dining Out',    TRUE),
    (NULL, 'Rent',          TRUE),
    (NULL, 'Utilities',     TRUE),
    (NULL, 'Salary',        TRUE),
    (NULL, 'Entertainment', TRUE);

-- ============================================================
-- 2. TEST USER
-- password_hash below is a bcrypt hash of "password123".
-- Replace or regenerate before using in any shared environment.
-- ============================================================
INSERT INTO users (email, password_hash, name) VALUES
    ('test@smartledger.com',
     '$2b$10$e0MYzXyjpJS7Pd0RVvHwHe1HlCS4bZJ18JuywdBqSXvS8n6uQyq2K',
     'Test User');

SET @user_id = (SELECT id FROM users WHERE email = 'test@smartledger.com');

-- ============================================================
-- 3. ACCOUNTS
-- Balances below reflect the NET effect of the seeded transactions.
--   Checking: 1500 opening + 2000 salary - 75.50 - 35.00 - 22.40 - 500 transfer = 2867.10
--   Savings:  3000 opening + 500 transfer                                          = 3500.00
-- ============================================================
INSERT INTO accounts (user_id, name, type, balance) VALUES
    (@user_id, 'Checking', 'checking', 2867.10),
    (@user_id, 'Savings',  'savings',  3500.00);

SET @checking_id = (SELECT id FROM accounts WHERE user_id = @user_id AND name = 'Checking');
SET @savings_id  = (SELECT id FROM accounts WHERE user_id = @user_id AND name = 'Savings');

-- ============================================================
-- 4. SAVINGS GOAL
-- ============================================================
INSERT INTO savings_goals (user_id, name, target_amount, target_date, current_amount) VALUES
    (@user_id, 'Emergency Fund', 5000.00, '2027-01-01', 500.00);

SET @goal_id = (SELECT id FROM savings_goals WHERE user_id = @user_id AND name = 'Emergency Fund');

-- ============================================================
-- 5. TRANSACTIONS
-- Exercises: manual expense, manual income, ai_text expense,
-- savings-goal transfer, and account-to-account transfer.
-- ============================================================
SET @cat_groceries = (SELECT id FROM categories WHERE name = 'Groceries'  AND is_default = TRUE);
SET @cat_dining    = (SELECT id FROM categories WHERE name = 'Dining Out' AND is_default = TRUE);
SET @cat_salary    = (SELECT id FROM categories WHERE name = 'Salary'     AND is_default = TRUE);

INSERT INTO transactions
    (user_id, account_id, to_account_id, category_id, savings_goal_id,
     type, amount, date, note, source, ai_input_text)
VALUES
    -- Manual expense
    (@user_id, @checking_id, NULL, @cat_groceries, NULL,
     'expense', 75.50, '2026-09-01', 'Weekly groceries', 'manual', NULL),

    -- Manual expense
    (@user_id, @checking_id, NULL, @cat_dining, NULL,
     'expense', 35.00, '2026-09-03', 'Dinner', 'manual', NULL),

    -- Manual income
    (@user_id, @checking_id, NULL, @cat_salary, NULL,
     'income', 2000.00, '2026-09-05', 'Paycheck', 'manual', NULL),

    -- AI-parsed expense (exercises the confirmation screen + source='ai_text')
    (@user_id, @checking_id, NULL, @cat_dining, NULL,
     'expense', 22.40, '2026-09-07', 'Coffee and bagel', 'ai_text',
     'spent $22.40 on coffee and a bagel this morning'),

    -- Transfer to savings, tagged as a goal contribution
    (@user_id, @checking_id, @savings_id, NULL, @goal_id,
     'transfer', 500.00, '2026-09-08', 'Monthly savings contribution', 'manual', NULL);

-- ============================================================
-- 6. BUDGETS
-- ============================================================
INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES
    (@user_id, @cat_groceries, 400.00),
    (@user_id, @cat_dining,    150.00);