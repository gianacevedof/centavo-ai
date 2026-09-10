-- Seed default categories
INSERT INTO categories (user_id, name, is_default) VALUES
(NULL, 'Groceries', TRUE),
(NULL, 'Dining Out', TRUE),
(NULL, 'Rent', TRUE),
(NULL, 'Utilities', TRUE),
(NULL, 'Salary', TRUE),
(NULL, 'Entertainment', TRUE);

-- Seed test user
INSERT INTO users (email, password_hash, name)
VALUES ('test@smartledger.com', 'test_password_hash', 'Test User');

-- Seed test accounts
INSERT INTO accounts (user_id, name, type, balance)
VALUES
((SELECT id FROM users WHERE email = 'test@smartledger.com'), 'Checking', 'checking', 1500.00),
((SELECT id FROM users WHERE email = 'test@smartledger.com'), 'Savings', 'savings', 3000.00);
-- Seed sample transactions
INSERT INTO transactions
    (user_id, account_id, category_id, type, amount, date, note, source)
VALUES
(
    (SELECT id FROM users WHERE email = 'test@smartledger.com'),
    (SELECT id FROM accounts
     WHERE name = 'Checking'
     AND user_id = (SELECT id FROM users WHERE email = 'test@smartledger.com')),
    (SELECT id FROM categories WHERE name = 'Groceries' AND is_default = TRUE),
    'expense',
    75.50,
    '2026-09-01',
    'Weekly groceries',
    'manual'
),
(
    (SELECT id FROM users WHERE email = 'test@smartledger.com'),
    (SELECT id FROM accounts
     WHERE name = 'Checking'
     AND user_id = (SELECT id FROM users WHERE email = 'test@smartledger.com')),
    (SELECT id FROM categories WHERE name = 'Dining Out' AND is_default = TRUE),
    'expense',
    35.00,
    '2026-09-03',
    'Dinner',
    'manual'
),
(
    (SELECT id FROM users WHERE email = 'test@smartledger.com'),
    (SELECT id FROM accounts
     WHERE name = 'Checking'
     AND user_id = (SELECT id FROM users WHERE email = 'test@smartledger.com')),
    (SELECT id FROM categories WHERE name = 'Salary' AND is_default = TRUE),
    'income',
    2000.00,
    '2026-09-05',
    'Paycheck',
    'manual'
);