import { Router } from "express";
import { generatePdfHandler } from "../controllers/pdfController.js";
import { verifyAuth } from "../middleware/verifyAuth.js";

const pdfRouter = Router();

pdfRouter.use(verifyAuth);
pdfRouter.post("/", generatePdfHandler);

export { pdfRouter };
