import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";

process.env.JWT_SECRET = randomBytes(32).toString("hex");

const [{ default: pool }, { default: authRoutes }, authService] =
  await Promise.all([
    import("../db.js"),
    import("../routes/auth.js"),
    import("../services/authService.js"),
  ]);
const { hashPassword, hashRefreshToken } = authService;

const cookiesFor = (response) => {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  return (response.headers.get("set-cookie") || "").split(/, (?=[^;,]+=)/);
};

const cookieValue = (response, name) =>
  cookiesFor(response)
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";", 1)[0] ?? "";

const cookieHeader = (response) =>
  `${cookieValue(response, "access_token")}; ${cookieValue(response, "refresh_token")}`;

test("login, refresh, profile update, and logout use refresh sessions", async () => {
  const user = {
    id: 41,
    email: "session-test@example.invalid",
    name: "Session Test",
    password_hash: await hashPassword("test-only-password"),
  };
  const sessions = [];

  pool.query = async (sql, params = []) => {
    if (sql.includes("SELECT * FROM users WHERE email")) return [[user], []];
    if (sql.includes("INSERT INTO sessions")) {
      const [userId, tokenHash, expiresAt] = params;
      sessions.push({
        id: sessions.length + 1,
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        is_logged_out: false,
      });
      return [{ insertId: sessions.length }, []];
    }
    if (sql.includes("UPDATE sessions SET is_logged_out = TRUE")) {
      const session = sessions.find(
        (row) => row.token_hash === params[0],
      );
      if (session) session.is_logged_out = true;
      return [{ affectedRows: session ? 1 : 0 }, []];
    }
    if (sql.includes("UPDATE users SET email = ?, name = ?")) {
      user.email = params[0];
      user.name = params[1];
      return [{ affectedRows: 1 }, []];
    }
    if (sql.includes("SELECT id, email, name FROM users WHERE id")) {
      return [[{ id: user.id, email: user.email, name: user.name }], []];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };

  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql, params = []) => {
      if (sql.includes("FROM sessions")) {
        const [userId, tokenHash] = params;
        const session = sessions.find(
          (row) =>
            row.user_id === userId &&
            row.token_hash === tokenHash &&
            !row.is_logged_out &&
            row.expires_at > new Date(),
        );
        return [session ? [{ id: session.id }] : [], []];
      }
      if (sql.includes("SELECT id, email FROM users WHERE id")) {
        return [[{ id: user.id, email: user.email }], []];
      }
      if (sql.includes("UPDATE sessions")) {
        const [tokenHash, expiresAt, id, oldHash] = params;
        const session = sessions.find(
          (row) =>
            row.id === id &&
            row.token_hash === oldHash &&
            !row.is_logged_out,
        );
        if (session) {
          session.token_hash = tokenHash;
          session.expires_at = expiresAt;
        }
        return [{ affectedRows: session ? 1 : 0 }, []];
      }
      throw new Error(`Unexpected connection query: ${sql}`);
    },
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;

  try {
    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: "test-only-password",
      }),
    });
    assert.equal(login.status, 200);
    assert.equal(sessions.length, 1);

    const loginRefreshToken = cookieValue(login, "refresh_token").slice(
      "refresh_token=".length,
    );
    assert.equal(
      sessions[0].token_hash,
      hashRefreshToken(loginRefreshToken),
    );
    assert.notEqual(sessions[0].token_hash, loginRefreshToken);

    const refreshed = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader(login) },
    });
    assert.equal(refreshed.status, 200);
    const refreshedToken = cookieValue(refreshed, "refresh_token").slice(
      "refresh_token=".length,
    );
    assert.notEqual(refreshedToken, loginRefreshToken);
    assert.equal(sessions[0].token_hash, hashRefreshToken(refreshedToken));

    const storedHash = sessions[0].token_hash;
    const profileUpdate = await fetch(`${baseUrl}/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader(refreshed),
      },
      body: JSON.stringify({
        email: "updated-session-test@example.invalid",
        name: "Updated Session Test",
      }),
    });
    assert.equal(profileUpdate.status, 200);
    assert.equal(sessions[0].token_hash, storedHash);
    assert.equal(
      cookiesFor(profileUpdate).some((cookie) =>
        cookie.startsWith("refresh_token="),
      ),
      false,
    );

    sessions[0].expires_at = new Date(Date.now() - 1000);
    const expiredRefresh = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader(refreshed) },
    });
    assert.equal(expiredRefresh.status, 401);
    assert.equal(sessions[0].is_logged_out, false);

    const secondLogin = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: "test-only-password",
      }),
    });
    assert.equal(secondLogin.status, 200);
    assert.equal(sessions.length, 2);

    const logout = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { cookie: cookieHeader(secondLogin) },
    });
    assert.equal(logout.status, 200);
    assert.equal(sessions[1].is_logged_out, true);

    const revokedRefresh = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader(secondLogin) },
    });
    assert.equal(revokedRefresh.status, 401);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
