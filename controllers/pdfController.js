import { generatePDF } from "../services/pdfService.js";
import { ApiError } from "../utils/ApiError.js";

export async function generatePdfHandler(req, res, next) {
  try {
    const { content } = req.body ?? {};

    if (typeof content === "undefined" || content === null) {
      throw new ApiError(400, "content is required.");
    }

    const pdfBuffer = await generatePDF(content);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=\"resumate-resume.pdf\"",
    );
    res.status(200).send(pdfBuffer);
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(new ApiError(500, "Failed to generate PDF."));
  }
}
