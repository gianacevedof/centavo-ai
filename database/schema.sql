-- Centavo AI — Database Schema
-- Engine: MySQL 8.0.16+ (required for CHECK constraints)
-- Charset: utf8mb4 (full Unicode incl. emoji in notes)
--
-- Core rules (see issue #4 spec):
--   1. Money is DECIMAL(12,2) — never FLOAT/DOUBLE.
--   2. Deleting an account cascades to its transactions.
--   3. Deleting a category is RESTRICTED — user must reassign first.
--   4. Every transaction logs its source: 'manual' or 'ai_text'.
--
-- IMPORTANT: this file is the single source of truth. Do not ALTER
-- live tables by hand — add migrations here and rebuild dev DBs.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS savings_goals;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(100) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. ACCOUNTS
-- balance is a stored cache of current balance; the app owns sync.
-- ============================================================
CREATE TABLE accounts (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    name       VARCHAR(100) NOT NULL,
    type       ENUM('checking','savings','credit_card','cash') NOT NULL,
    balance    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_account_user_name (user_id, name),
    CONSTRAINT fk_accounts_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. CATEGORIES
-- user_id NULL = system default, shared across all users.
--
-- MySQL treats NULL as distinct in unique indexes, so a plain
-- UNIQUE(user_id, name) would allow infinite duplicate defaults.
-- We use a generated column (user_key) so that NULL maps to 0
-- and uniqueness is enforced across BOTH global defaults and
-- per-user categories:
--     (user_key, name) unique  =>  global defaults unique
--                              =>  per-user categories unique
--                              =>  users may shadow a global name
--                                  with their own custom category
-- ============================================================
CREATE TABLE categories (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NULL,
    name       VARCHAR(100) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    user_key   INT AS (IFNULL(user_id, 0)) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_category_user_name (user_key, name),
    CONSTRAINT fk_categories_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. SAVINGS GOALS
-- current_amount is a stored cache of contributions; app owns sync.
-- ============================================================
CREATE TABLE savings_goals (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    name           VARCHAR(100) NOT NULL,
    target_amount  DECIMAL(12,2) NOT NULL,
    target_date    DATE NOT NULL,
    current_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_goal_user_name (user_id, name),
    CONSTRAINT fk_goals_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 5. TRANSACTIONS
-- Rules enforced here:
--   * amount > 0 always (direction is encoded by `type`).
--   * transfers MUST have to_account_id set and != account_id.
--   * non-transfers MUST NOT have to_account_id set.
--   * deleting a category is RESTRICTED (don't orphan history).
--   * deleting a savings goal SET NULLs the link (keep the txn).
-- ============================================================
CREATE TABLE transactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    account_id      INT NOT NULL,
    to_account_id   INT NULL,
    category_id     INT NULL,
    savings_goal_id INT NULL,
    type            ENUM('expense','income','transfer') NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    date            DATE NOT NULL,
    note            VARCHAR(255) NULL,
    source          ENUM('manual','ai_text') NOT NULL DEFAULT 'manual',
    ai_input_text   TEXT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_txn_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_txn_account
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_txn_to_account
        FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_txn_category
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    CONSTRAINT fk_txn_goal
        FOREIGN KEY (savings_goal_id) REFERENCES savings_goals(id) ON DELETE SET NULL,

    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_transfer_shape CHECK (
        (type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id)
        OR
        (type IN ('expense','income') AND to_account_id IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_user_category_date ON transactions(user_id, category_id, date);
CREATE INDEX idx_user_account       ON transactions(user_id, account_id);
CREATE INDEX idx_user_date          ON transactions(user_id, date);

-- ============================================================
-- 6. BUDGETS
-- Recurring, no history. Editing a limit changes it retroactively
-- for all analytics, by design.
-- ============================================================
CREATE TABLE budgets (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    category_id   INT NOT NULL,
    monthly_limit DECIMAL(12,2) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_category (user_id, category_id),
    CONSTRAINT fk_budgets_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_budgets_category
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    CONSTRAINT chk_budget_positive CHECK (monthly_limit > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;