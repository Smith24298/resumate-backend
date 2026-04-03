import dotenv from "dotenv";
import { createRequire } from "module";

dotenv.config({ path: "./.env" });

const require = createRequire(import.meta.url);
const sdk = require("node-appwrite");
const { InputFile } = require("node-appwrite/file");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[Resumate] Missing ${name} in backend/.env`);
  }
  return value;
}

const APPWRITE_ENDPOINT = requiredEnv("APPWRITE_ENDPOINT");
const APPWRITE_PROJECT_ID = requiredEnv("APPWRITE_PROJECT_ID");
const APPWRITE_API_KEY = requiredEnv("APPWRITE_API_KEY");

// Defaults allow quick local setup; override via env in production.
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const APPWRITE_RESUMES_COLLECTION_ID =
  process.env.APPWRITE_RESUMES_COLLECTION_ID;
const APPWRITE_TEX_BUCKET_ID =
  process.env.APPWRITE_TEX_BUCKET_ID;

const client = new sdk.Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

const databases = new sdk.Databases(client);
const storage = new sdk.Storage(client);

export {
  client,
  databases,
  storage,
  sdk,
  InputFile,
  APPWRITE_DATABASE_ID,
  APPWRITE_RESUMES_COLLECTION_ID,
  APPWRITE_TEX_BUCKET_ID,
};
