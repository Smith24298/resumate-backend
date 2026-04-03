import { Router } from "express";
import {
  createResumeHandler,
  deleteResumeByIdHandler,
  downloadResumeTexHandler,
  getResumeByIdHandler,
  getMyResumesHandler,
  getResumesHandler,
  updateResumeByIdHandler,
} from "../controllers/resumeController.js";
import { verifyAuth } from "../middleware/verifyAuth.js";

const resumeRouter = Router();

resumeRouter.use(verifyAuth);

resumeRouter.post("/", createResumeHandler);
resumeRouter.get("/", getResumesHandler);
resumeRouter.get("/me", getMyResumesHandler);
resumeRouter.get("/:id/source", downloadResumeTexHandler);
resumeRouter.get("/:id", getResumeByIdHandler);
resumeRouter.put("/:id", updateResumeByIdHandler);
resumeRouter.delete("/:id", deleteResumeByIdHandler);

export { resumeRouter };
