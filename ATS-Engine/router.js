import { Router } from "express";
import fileUpload from "express-fileupload";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { ApiError } from "../utils/ApiError.js";

// Proxy adapter: backend forwards ATS requests to standalone root ATS-Engine service.
const atsRouter = Router();
const ATS_ENGINE_URL = String(
  process.env.ATS_ENGINE_URL || "http://localhost:4100",
).replace(/\/+$/, "");
const ATS_ENGINE_TIMEOUT_MS = Number(process.env.ATS_ENGINE_TIMEOUT_MS || 8000);
const ATS_ENGINE_API_KEY = String(process.env.ATS_ENGINE_API_KEY || "");
const ATS_REQUIRE_AUTH =
  String(process.env.ATS_REQUIRE_AUTH || "false").toLowerCase() === "true";

atsRouter.get("/", (_req, res) => {
  res.status(200).json({
    service: "ats-proxy",
    message: "Use POST /api/ats/analyze for ATS analysis.",
  });
});

atsRouter.get("/health", async (_req, res, next) => {
  try {
    const response = await fetch(`${ATS_ENGINE_URL}/health`);
    const data = await response
      .json()
      .catch(() => ({ status: response.ok ? "ok" : "error" }));

    res.status(response.ok ? 200 : 502).json({
      proxy: "ok",
      engine: data,
    });
  } catch (error) {
    next(new ApiError(502, "ATS engine is unreachable."));
  }
});

atsRouter.use(
  fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    responseOnLimit: "File must be under 5MB.",
  }),
);

atsRouter.post("/analyze", async (req, res, next) => {
  try {
    if (ATS_REQUIRE_AUTH) {
      await new Promise((resolve, reject) => {
        verifyAuth(req, res, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(undefined);
        });
      });
    }

    const contentType = String(req.headers["content-type"] || "");
    const isMultipart = contentType.includes("multipart/form-data");

    let upstreamBody;
    let upstreamHeaders = {
      ...(ATS_ENGINE_API_KEY ? { "X-ATS-API-Key": ATS_ENGINE_API_KEY } : {}),
    };

    if (isMultipart) {
      const uploadedFile = req.files?.resume || req.files?.resumeFile;
      const jobDescription = String(req.body?.jobDescription || "");

      if (!uploadedFile) {
        throw new ApiError(400, "resume file is required.");
      }

      const formData = new FormData();
      const blob = new Blob([uploadedFile.data], {
        type: uploadedFile.mimetype || "application/octet-stream",
      });
      const filename = uploadedFile.name || "resume.pdf";

      // Compatibility: forward both current and legacy field names.
      formData.append("resume", blob, filename);
      formData.append("resumeFile", blob, filename);

      if (jobDescription) {
        formData.append("jobDescription", jobDescription);
      }

      upstreamBody = formData;
    } else {
      const { resumeText, jobDescription } = req.body || {};

      if (typeof resumeText !== "string" || !resumeText.trim()) {
        throw new ApiError(
          400,
          "resumeText is required and must be a non-empty string.",
        );
      }

      if (resumeText.length > 250000) {
        throw new ApiError(400, "resumeText exceeds maximum length (250KB).");
      }

      if (
        typeof jobDescription !== "undefined" &&
        typeof jobDescription !== "string"
      ) {
        throw new ApiError(
          400,
          "jobDescription must be a string when provided.",
        );
      }

      upstreamHeaders = {
        ...upstreamHeaders,
        "Content-Type": "application/json",
      };

      upstreamBody = JSON.stringify({
        resumeText,
        jobDescription: jobDescription || "",
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      ATS_ENGINE_TIMEOUT_MS,
    );

    const response = await fetch(`${ATS_ENGINE_URL}/analyze`, {
      method: "POST",
      headers: upstreamHeaders,
      body: upstreamBody,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const data = await response
      .json()
      .catch(() => ({ error: "ATS engine response invalid." }));

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error || "ATS engine request failed.",
      );
    }

    res.status(200).json(data);
  } catch (error) {
    if (error?.name === "AbortError") {
      next(new ApiError(504, "Analysis timed out. Please try again."));
      return;
    }
    next(error);
  }
});

export { atsRouter };
