import {
  createResume,
  deleteResumeByIdForUser,
  getAllResumesByUser,
  getResumeByIdForUser,
  getResumeTexFileForUser,
  updateResumeByIdForUser,
} from "../services/resumeService.js";
import { ApiError } from "../utils/ApiError.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAuthenticatedUserId(req) {
  return req.auth?.userId ?? req.userId ?? null;
}

function assertValidResumeId(id) {
  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid resume ID.");
  }
}

function validateCreatePayload(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const atsScore =
    typeof body.atsScore === "number"
      ? body.atsScore
      : typeof body.ats_score === "number"
        ? body.ats_score
        : undefined;

  if (!title) {
    throw new ApiError(400, "title is required.");
  }

  return {
    title,
    content: content || description,
    atsScore,
  };
}

function validateUpdatePayload(body) {
  const fields = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw new ApiError(400, "title must be a non-empty string.");
    }
    fields.title = body.title.trim();
  }

  if ("content" in body) {
    if (typeof body.content !== "string") {
      throw new ApiError(400, "content must be a string.");
    }
    fields.content = body.content;
  }

  if ("atsScore" in body || "ats_score" in body) {
    const value = "atsScore" in body ? body.atsScore : body.ats_score;
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new ApiError(400, "atsScore must be a number.");
    }
    fields.atsScore = value;
  }

  if (Object.keys(fields).length === 0) {
    throw new ApiError(400, "At least one field is required to update.");
  }

  return fields;
}

export async function createResumeHandler(req, res, next) {
  try {
    const payload = validateCreatePayload(req.body);
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      throw new ApiError(401, "Unauthorized.");
    }

    const resume = await createResume({
      userId,
      title: payload.title,
      content: payload.content,
      atsScore: payload.atsScore,
    });
    console.log("Resume created successfully:", resume);
    res.status(201).json(resume);
  } catch (error) {
    console.error("Failed to create resume", error);
    next(error);
  }
}

export async function getResumesHandler(req, res, next) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      throw new ApiError(401, "Unauthorized.");
    }

    console.log("Fetching resumes for user:", userId);
    const resumes = await getAllResumesByUser(userId);
    console.log("Resumes fetched successfully, count:", resumes?.length || 0);

    if (!Array.isArray(resumes)) {
      console.error("Expected array but got:", typeof resumes);
      return res.status(200).json([]);
    }

    res.status(200).json(resumes);
  } catch (error) {
    console.error("Error in getResumesHandler:", {
      message: error?.message,
      stack: error?.stack,
      error,
    });
    next(error);
  }
}

export async function getMyResumesHandler(req, res, next) {
  return getResumesHandler(req, res, next);
}

export async function getResumeByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    assertValidResumeId(id);
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      throw new ApiError(401, "Unauthorized.");
    }

    const resume = await getResumeByIdForUser({ id, userId });
    if (!resume) {
      throw new ApiError(404, "Resume not found.");
    }

    res.status(200).json(resume);
  } catch (error) {
    next(error);
  }
}

export async function downloadResumeTexHandler(req, res, next) {
  try {
    const { id } = req.params;
    assertValidResumeId(id);
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      throw new ApiError(401, "Unauthorized.");
    }

    const texFile = await getResumeTexFileForUser({ id, userId });
    if (!texFile) {
      throw new ApiError(404, "Resume source not found.");
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${texFile.fileName || "resume.tex"}"`,
    );
    res.status(200).send(texFile.content);
  } catch (error) {
    next(error);
  }
}

export async function updateResumeByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    assertValidResumeId(id);
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      throw new ApiError(401, "Unauthorized.");
    }

    const fields = validateUpdatePayload(req.body);
    const updated = await updateResumeByIdForUser({
      id,
      userId,
      fields,
    });

    if (!updated) {
      throw new ApiError(404, "Resume not found.");
    }

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteResumeByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    assertValidResumeId(id);
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      throw new ApiError(401, "Unauthorized.");
    }

    const deleted = await deleteResumeByIdForUser({ id, userId });
    if (!deleted) {
      throw new ApiError(404, "Resume not found.");
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
