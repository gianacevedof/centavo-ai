// utils/errors.js
// One error shape for every route:
//   { error: { code, message } }
// Extra fields (for example counts on a 409) sit beside "error" at the top level,
// so existing callers that read them keep working.

const DEFAULT_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE",
  500: "SERVER_ERROR",
  502: "AI_CONFIG_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export function sendError(res, status, message, { code, ...extra } = {}) {
  return res.status(status).json({
    ...extra,
    error: {
      code: code ?? DEFAULT_CODES[status] ?? "ERROR",
      message,
    },
  });
}
