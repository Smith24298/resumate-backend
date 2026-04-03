import { randomUUID } from "crypto";
import {
  APPWRITE_DATABASE_ID,
  APPWRITE_RESUMES_COLLECTION_ID,
  APPWRITE_TEX_BUCKET_ID,
  InputFile,
  databases,
  sdk,
  storage,
} from "../lib/appwrite.js";

function buildTexFileName(resumeId) {
  return `${resumeId}.tex`;
}

function buildTexFileLink(resumeId) {
  return `/api/resumes/${resumeId}/source`;
}

function normalizeResume(row) {
  return {
    id: row.$id,
    userId: row.userid ?? row.userId ?? row.user_id ?? null,
    user_id: row.userid ?? row.userId ?? row.user_id ?? null,
    title: row.title ?? "",
    content: row.content || row.description || "",
    atsScore: row.atsScore ?? row.ats_score ?? 0,
    ats_score: row.atsScore ?? row.ats_score ?? 0,
    template: row.template ?? "Modern",
    texFileId: row.texFileId ?? row.tex_file_id ?? null,
    texFileName: row.texFileName ?? row.tex_file_name ?? null,
    texFileLink: row.texFileLink ?? row.tex_file_link ?? null,
    createdAt: row.$createdAt || row.createdAt || row.created_at || null,
    created_at: row.$createdAt || row.createdAt || row.created_at || null,
    updatedAt: row.$updatedAt || row.updatedAt || row.updated_at || null,
    updated_at: row.$updatedAt || row.updatedAt || row.updated_at || null,
  };
}

function normalizeAtsScore(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function bufferToUtf8(buffer) {
  if (!buffer) return "";
  return Buffer.from(buffer).toString("utf8");
}

async function deleteTexFile(texFileId) {
  if (!texFileId) return;

  try {
    await storage.deleteFile(APPWRITE_TEX_BUCKET_ID, texFileId);
  } catch {
    // ignore cleanup failures
  }
}

async function createTexFile({ fileId, resumeId, content }) {
  const fileName = buildTexFileName(resumeId);
  const file = InputFile.fromBuffer(
    Buffer.from(content || "", "utf8"),
    fileName,
  );

  const uploaded = await storage.createFile(
    APPWRITE_TEX_BUCKET_ID,
    fileId,
    file,
  );

  return {
    texFileId: uploaded.$id,
    texFileName: uploaded.name || fileName,
  };
}

async function readTexContent(texFileId) {
  if (!texFileId) return null;

  try {
    const buffer = await storage.getFileDownload(
      APPWRITE_TEX_BUCKET_ID,
      texFileId,
    );
    return bufferToUtf8(buffer);
  } catch {
    return null;
  }
}

export async function createResume({
  userId,
  title,
  content = "",
  atsScore = 0,
}) {
  const id = randomUUID();
  const safeContent = content || "";
  const safeAtsScore = normalizeAtsScore(atsScore);
  const texFile = await createTexFile({
    fileId: id,
    resumeId: id,
    content: safeContent,
  });
  const texFileLink = buildTexFileLink(id);

  try {
    const row = await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESUMES_COLLECTION_ID,
      id,
      {
        userid: userId,
        title,
        content: texFileLink,
        atsScore: safeAtsScore,
        texFileId: texFile.texFileId,
        texFileName: texFile.texFileName,
        texFileLink,
      },
    );

    return normalizeResume({
      ...row,
      texFileId: texFile.texFileId,
      texFileName: texFile.texFileName,
      texFileLink,
      content: texFileLink,
    });
  } catch (error) {
    await deleteTexFile(texFile.texFileId);
    console.error("Appwrite createDocument failed", {
      message: error?.message,
      response: error?.response,
    });
    throw error;
  }
}

export async function getAllResumesByUser(userId) {
  const result = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_RESUMES_COLLECTION_ID,
    [sdk.Query.equal("userid", userId), sdk.Query.orderDesc("$createdAt")],
  );

  return result.documents.map(normalizeResume);
}

export async function getResumeByIdForUser({ id, userId }) {
  try {
    const row = await databases.getDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESUMES_COLLECTION_ID,
      id,
    );

    const rowUserId = row.userId ?? row.userid ?? row.user_id;

    if (rowUserId !== userId) {
      return null;
    }

    const normalized = normalizeResume(row);
    const storageContent = await readTexContent(normalized.texFileId);
    const fallbackContent = normalized.texFileLink
      ? ""
      : (normalized.content ?? "");

    return {
      ...normalized,
      content: storageContent ?? fallbackContent,
    };
  } catch {
    return null;
  }
}

export async function getResumeTexFileForUser({ id, userId }) {
  const existing = await getResumeByIdForUser({ id, userId });
  if (!existing?.texFileId) return null;

  const buffer = await storage.getFileDownload(
    APPWRITE_TEX_BUCKET_ID,
    existing.texFileId,
  );

  return {
    fileName: existing.texFileName || buildTexFileName(existing.id),
    content: bufferToUtf8(buffer),
  };
}

export async function updateResumeByIdForUser({ id, userId, fields }) {
  const existing = await getResumeByIdForUser({ id, userId });
  if (!existing) return null;

  const data = {};
  const shouldUpdateTex =
    typeof fields.title === "string" || typeof fields.content === "string";

  let nextTexFile = {
    texFileId: existing.texFileId,
    texFileName: existing.texFileName,
  };

  if (shouldUpdateTex) {
    const newTexFileId = randomUUID();
    nextTexFile = await createTexFile({
      fileId: newTexFileId,
      resumeId: existing.id,
      content: fields.content ?? existing.content ?? "",
    });

    data.content = buildTexFileLink(existing.id);
    data.texFileId = nextTexFile.texFileId;
    data.texFileName = nextTexFile.texFileName;
    data.texFileLink = buildTexFileLink(existing.id);
  }

  if (typeof fields.title === "string") data.title = fields.title;
  if (typeof fields.atsScore !== "undefined") {
    data.atsScore = normalizeAtsScore(fields.atsScore);
  }
  if (typeof fields.ats_score !== "undefined") {
    data.atsScore = normalizeAtsScore(fields.ats_score);
  }

  try {
    const row = await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESUMES_COLLECTION_ID,
      id,
      data,
    );

    if (
      shouldUpdateTex &&
      existing.texFileId &&
      existing.texFileId !== nextTexFile.texFileId
    ) {
      await deleteTexFile(existing.texFileId);
    }

    return normalizeResume({
      ...row,
      texFileId: nextTexFile.texFileId,
      texFileName: nextTexFile.texFileName,
      texFileLink: buildTexFileLink(existing.id),
      content: buildTexFileLink(existing.id),
    });
  } catch (error) {
    if (
      shouldUpdateTex &&
      nextTexFile.texFileId &&
      nextTexFile.texFileId !== existing.texFileId
    ) {
      await deleteTexFile(nextTexFile.texFileId);
    }

    throw error;
  }
}

export async function deleteResumeByIdForUser({ id, userId }) {
  const existing = await getResumeByIdForUser({ id, userId });
  if (!existing) return null;

  await databases.deleteDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_RESUMES_COLLECTION_ID,
    id,
  );

  await deleteTexFile(existing.texFileId);

  return { id };
}
