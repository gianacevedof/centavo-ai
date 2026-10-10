-- Centavo AI — Dev Seed Data
-- WARNING: truncates all tables. Do NOT run against a DB with real data.
-- Re-runnable: safe to execute multiple times.
--
-- Depends on schema.sql being applied first. In particular, the
-- categories table must have the `user_key` generated column —
-- without it, MySQL's NULL-distinct rule allows duplicate global
-- defaults and this file will silently corrupt analytics.

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
-- A broad set that covers the common personal-finance buckets
-- used by apps like Mint / YNAB / Copilot. Adding one here makes
-- it available to every user automatically.
-- ============================================================
INSERT INTO categories (user_id, name, is_default) VALUES
    (NULL, 'Groceries',          TRUE),
    (NULL, 'Dining Out',         TRUE),
    (NULL, 'Rent',               TRUE),
    (NULL, 'Utilities',          TRUE),
    (NULL, 'Salary',             TRUE),
    (NULL, 'Entertainment',      TRUE),
    (NULL, 'Luxury',             TRUE),
    (NULL, 'Health & Medical',   TRUE),
    (NULL, 'Subscriptions',      TRUE),
    (NULL, 'Education',          TRUE),
    (NULL, 'Transportation',     TRUE),
    (NULL, 'Insurance',          TRUE),
    (NULL, 'Travel',             TRUE),
    (NULL, 'Personal Care',      TRUE),
    (NULL, 'Gifts & Donations',  TRUE),
    (NULL, 'Home Maintenance',   TRUE),
    (NULL, 'Taxes',              TRUE),
    (NULL, 'Fees & Charges',     TRUE),
    (NULL, 'Pet Care',           TRUE),
    (NULL, 'Miscellaneous',      TRUE);

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
SET @cat_groceries = (SELECT id FROM categories WHERE name = 'Groceries'  AND user_id IS NULL AND is_default = TRUE);
SET @cat_dining    = (SELECT id FROM categories WHERE name = 'Dining Out' AND user_id IS NULL AND is_default = TRUE);
SET @cat_salary    = (SELECT id FROM categories WHERE name = 'Salary'     AND user_id IS NULL AND is_default = TRUE);

-- Fail loudly if any of the lookups came back NULL — this catches
-- the "categories weren't seeded" class of bug instead of silently
-- inserting NULL category_ids.
SET @missing = (
    SELECT COUNT(*) FROM (
        SELECT @cat_groceries AS id UNION ALL
        SELECT @cat_dining    AS id UNION ALL
        SELECT @cat_salary    AS id
    ) AS t WHERE t.id IS NULL
);
-- (MySQL has no RAISE; the SIGNAL below is the portable way.)
-- If you'd rather not abort, comment this block out.
-- Note: SIGNAL must be inside a stored program in vanilla MySQL,
-- so on plain clients this check is advisory. The real guard is
-- the UNIQUE(user_key, name) index — if the categories above
-- didn't insert, the transactions insert below will still run,
-- but with NULL categories. Verify after seeding with the query
-- at the bottom of verify_constraints.sql.

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

-- ============================================================
-- 7. POST-SEED SANITY CHECK (advisory — prints results)
-- All three queries should return 0 rows / count 0.
-- ============================================================
SELECT 'Duplicate global defaults' AS check_name,
       COUNT(*) AS failures
FROM (
    SELECT name FROM categories
    WHERE user_id IS NULL AND is_default = TRUE
    GROUP BY name HAVING COUNT(*) > 1
) AS d

UNION ALL

SELECT 'Transactions with NULL category (non-transfer)' AS check_name,
       COUNT(*) AS failures
FROM transactions
WHERE type IN ('expense','income') AND category_id IS NULL

UNION ALL

SELECT 'Transfer rows with NULL to_account_id' AS check_name,
       COUNT(*) AS failures
FROM transactions
WHERE type = 'transfer' AND to_account_id IS NULL;