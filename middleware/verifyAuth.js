import { verifyToken } from "@clerk/backend";
import { ApiError } from "../utils/ApiError.js";

function extractBearerToken(authorizationHeader = "") {
  if (!authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return [part, ""];
        const key = decodeURIComponent(part.slice(0, idx));
        const value = decodeURIComponent(part.slice(idx + 1));
        return [key, value];
      }),
  );
}

function getRequestToken(req) {
  const headerToken = extractBearerToken(req.headers.authorization);
  if (headerToken) return headerToken;

  const cookies = parseCookies(req.headers.cookie || "");
  if (cookies.__session) return cookies.__session;

  if (typeof req.query?.token === "string") return req.query.token;

  return null;
}

export async function verifyAuth(req, _res, next) {
  try {
    const token = getRequestToken(req);

    if (!token) {
      throw new ApiError(401, "Unauthorized: missing session token.");
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new ApiError(500, "Server auth misconfiguration.");
    }

    const payload = await verifyToken(token, { secretKey });

    if (!payload?.sub) {
      throw new ApiError(401, "Unauthorized: invalid token payload.");
    }

    req.auth = { userId: payload.sub };
    req.userId = payload.sub;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }

    next(new ApiError(401, "Unauthorized: invalid or expired session."));
  }
}
