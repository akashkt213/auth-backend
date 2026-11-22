import type { ErrorRequestHandler } from "express";

// Without this, Express answers errors (e.g. malformed JSON) with an HTML stack trace.
// Express recognises an error handler by its four parameters, so keep all four.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.status ?? 500;
  if (status >= 500) console.error("Unhandled error:", err);

  const message =
    err.type === "entity.parse.failed" ? "Invalid JSON body"
    : err.type === "entity.too.large" ? "Request body is too large"
    : status < 500 ? "Bad request"
    : "Internal server error";

  res.status(status).json({ status_code: status, message });
};
