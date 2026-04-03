import { Router } from "express";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { ApiError } from "../utils/ApiError.js";
import { generatePDF } from "../services/pdfService.js";

const compileRouter = Router();
const DEFAULT_LATEX_API_URL = "";
const LATEX_API_URL = process.env.LATEX_API_URL || DEFAULT_LATEX_API_URL;
const LATEX_API_TIMEOUT_MS = Number(process.env.LATEX_API_TIMEOUT_MS || 30000);
const USE_SELF_HOSTED_COMPILE_API =
  process.env.LATEX_API_MODE === "self-hosted" ||
  LATEX_API_URL.includes("/compile");

compileRouter.use(verifyAuth);

/**
 * POST /api/compile
 * Compiles LaTeX content to PDF
 *
 * Request:
 * { "content": "\\documentclass{article}..." }
 *
 * Response (success):
 * Binary PDF data with Content-Type: application/pdf
 *
 * Response (error):
 * 422 Unprocessable Entity with { "error": "LaTeX error message", "line": 15 }
 */
compileRouter.post("/", async (req, res, next) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== "string") {
      throw new ApiError(400, "content is required and must be a string.");
    }

    // Validate content length (LaTeX content shouldn't be huge)
    if (content.length > 100000) {
      throw new ApiError(400, "content exceeds maximum length (100KB).");
    }

    console.log("Compiling LaTeX content, length:", content.length);

    // Compile using external LaTeX API service
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        LATEX_API_TIMEOUT_MS,
      );

      const compileResponse = await fetch(LATEX_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          USE_SELF_HOSTED_COMPILE_API
            ? { latex: content }
            : { resources: [{ main: true, content }] },
        ),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      console.log("Compile response status:", compileResponse.status);

      if (!compileResponse.ok) {
        const errorText = await compileResponse.text();
        console.error(
          "LaTeX compiler error:",
          compileResponse.status,
          errorText,
        );

        // 4xx usually means user-provided LaTeX has syntax/package problems.
        if (compileResponse.status >= 400 && compileResponse.status < 500) {
          throw new ApiError(
            422,
            "Failed to compile LaTeX. Please check your syntax.",
          );
        }

        throw new Error(`LaTeX API unavailable (${compileResponse.status})`);
      }

      const contentType = compileResponse.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf")) {
        const errorText = await compileResponse.text();
        console.error(
          "Unexpected LaTeX API response type:",
          contentType,
          errorText,
        );
        throw new ApiError(
          422,
          "Failed to compile LaTeX. Please check your syntax.",
        );
      }

      const arrayBuffer = await compileResponse.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);

      console.log("PDF buffer size:", pdfBuffer?.length);

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new ApiError(422, "LaTeX compilation produced empty output.");
      }

      res.type("application/pdf").send(pdfBuffer);
    } catch (apiError) {
      if (apiError instanceof ApiError) {
        throw apiError;
      }

      // Fallback for service outages/network failures to keep export flow usable.
      console.error(
        "LaTeX API unavailable, falling back to local PDF renderer:",
        apiError,
      );
      const fallbackPdf = await generatePDF(content);

      if (!fallbackPdf || fallbackPdf.length === 0) {
        throw new ApiError(
          422,
          "LaTeX compilation service unavailable. Please try again.",
        );
      }

      res
        .setHeader("X-Compile-Fallback", "local-renderer")
        .type("application/pdf")
        .send(fallbackPdf);
    }
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 422) {
      // LaTeX compilation error - return structured error
      return res.status(422).json({
        error: error.message,
        line: null,
      });
    }
    next(error);
  }
});

export { compileRouter };
