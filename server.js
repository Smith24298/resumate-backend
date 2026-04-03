import dotenv from "dotenv";

// Load env before importing modules that read process.env
dotenv.config({ path: "./.env" });
console.log("APPWRITE_ENDPOINT:", process.env.APPWRITE_ENDPOINT);

import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { pdfRouter } from "./routes/pdfRoutes.js";
import { resumeRouter } from "./routes/resumeRoutes.js";
import { compileRouter } from "./routes/compileRoutes.js";

const {
  APPWRITE_DATABASE_ID,
  APPWRITE_RESUMES_COLLECTION_ID,
  APPWRITE_TEX_BUCKET_ID,
  databases,
  sdk,
  storage,
} = await import("./lib/appwrite.js");

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigins = Array.from(
  new Set(
    [
      "http://localhost:5173",
      "https://resumate-frontend-two.vercel.app",
      process.env.FRONTEND_URL,
      ...(process.env.FRONTEND_URLS || "").split(","),
    ]
      .map((origin) => String(origin || "").trim())
      .filter(Boolean),
  ),
);

app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (server-to-server, curl, health checks).
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
  }),
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/resumes", resumeRouter);
app.use("/api/generate-pdf", pdfRouter);
app.use("/api/compile", compileRouter);

app.use(notFoundHandler);
app.use(errorHandler);

async function ensureTexBucket() {
  try {
    await storage.getBucket(APPWRITE_TEX_BUCKET_ID);
    return;
  } catch (error) {
    console.log(`Tex bucket ${APPWRITE_TEX_BUCKET_ID} missing, creating it...`);
    await storage.createBucket(
      APPWRITE_TEX_BUCKET_ID,
      "Resumate TeX Files",
      undefined,
      false,
      true,
      10 * 1024 * 1024,
      ["tex"],
      undefined,
      false,
      false,
    );
  }
}

function isMissingAttributeError(error) {
  const message = String(error?.message || "");
  const type = String(error?.type || "");
  const code = Number(error?.code || 0);

  return (
    code === 404 ||
    type === "attribute_not_found" ||
    /not found/i.test(message) ||
    /could not be found/i.test(message)
  );
}

async function waitForAttributeAvailability(attributeKey, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const attribute = await databases.getAttribute(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESUMES_COLLECTION_ID,
      attributeKey,
    );

    if (attribute?.status === "available") {
      return;
    }

    if (attribute?.status === "failed") {
      throw new Error(
        `Appwrite attribute ${attributeKey} failed to provision.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for Appwrite attribute ${attributeKey}.`);
}

async function ensureStringAttribute(key, size = 255) {
  try {
    const attribute = await databases.getAttribute(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESUMES_COLLECTION_ID,
      key,
    );

    if (attribute?.status === "available") {
      return;
    }

    if (attribute?.status === "failed") {
      throw new Error(`Appwrite attribute ${key} exists but is failed.`);
    }

    await waitForAttributeAvailability(key);
    return;
  } catch (error) {
    if (!isMissingAttributeError(error)) {
      throw error;
    }

    console.log(`Attribute ${key} missing, creating it...`);
    await databases.createStringAttribute(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESUMES_COLLECTION_ID,
      key,
      size,
      false,
      null,
      false,
      false,
    );
    await waitForAttributeAvailability(key);
  }
}

async function ensureResumeCollectionSchema() {
  await ensureStringAttribute("texFileId");
  await ensureStringAttribute("texFileName");
  await ensureStringAttribute("texFileLink", 2048);
}

async function startServer() {
  try {
    // Connectivity + configuration check (fails fast if DB/table or key is wrong).
    await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESUMES_COLLECTION_ID,
      [sdk.Query.limit(1)],
    );
    await ensureResumeCollectionSchema();
    await ensureTexBucket();
    app.listen(port, () => {
      console.log(`Resumate backend listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
