const fs = require("fs");
const path = require("path");
const { del, get, put } = require("@vercel/blob");
const {
  DATA_FILE,
  buildInitialStore,
  normalizeStore,
} = require("./store");

const DATA_DIR = path.dirname(DATA_FILE);
const LOCAL_UPLOADS_DIR = path.join(__dirname, "uploads");
const STORE_BLOB_PATH = `${process.env.V2_BLOB_STORE_PATH || "alfatec-v2/store.json"}`.trim();
const UPLOADS_BLOB_PREFIX = `${process.env.V2_BLOB_UPLOAD_PREFIX || "alfatec-v2/uploads"}`.trim().replace(/\/+$/, "");

function isBlobStorageEnabled() {
  const explicitMode = `${process.env.V2_STORAGE_MODE || ""}`.trim().toLowerCase();
  if (explicitMode === "blob") {
    return true;
  }
  if (explicitMode === "file") {
    return false;
  }
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID);
}

function blobPathForStoredName(storedName) {
  return `${UPLOADS_BLOB_PREFIX}/${storedName}`.replace(/\/{2,}/g, "/");
}

function getDataFileLabel() {
  return isBlobStorageEnabled() ? `vercel-blob://${STORE_BLOB_PATH}` : DATA_FILE;
}

async function streamToBuffer(stream) {
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function readBlobStore() {
  const blobResult = await get(STORE_BLOB_PATH, {
    access: "private",
    useCache: false,
  });

  if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
    const initialStore = buildInitialStore();
    await writeBlobStore(initialStore);
    return normalizeStore(initialStore);
  }

  const rawText = await new Response(blobResult.stream).text();
  let parsedStore;
  try {
    parsedStore = rawText.trim() ? JSON.parse(rawText) : {};
  } catch (_error) {
    parsedStore = {};
  }

  const normalizedStore = normalizeStore(parsedStore);
  await writeBlobStore(normalizedStore);
  return normalizedStore;
}

async function writeBlobStore(store) {
  const normalizedStore = normalizeStore(store);
  await put(STORE_BLOB_PATH, JSON.stringify(normalizedStore, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}

function ensureLocalDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureLocalStore() {
  ensureLocalDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(buildInitialStore(), null, 2), "utf8");
    return;
  }

  const currentStore = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const normalizedStore = normalizeStore(currentStore);
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizedStore, null, 2), "utf8");
}

function readLocalStore() {
  ensureLocalStore();
  return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
}

function writeLocalStore(store) {
  ensureLocalDataDir();
  const normalizedStore = normalizeStore(store);
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizedStore, null, 2), "utf8");
}

async function readStore() {
  if (isBlobStorageEnabled()) {
    return readBlobStore();
  }
  return readLocalStore();
}

async function writeStore(store) {
  if (isBlobStorageEnabled()) {
    await writeBlobStore(store);
    return;
  }
  writeLocalStore(store);
}

async function mutateStore(mutator) {
  const store = await readStore();
  const result = await mutator(store);
  await writeStore(store);
  return result;
}

async function saveUploadedFile({ storedName, buffer, mimeType }) {
  if (isBlobStorageEnabled()) {
    const blobResult = await put(blobPathForStoredName(storedName), buffer, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: mimeType || "application/octet-stream",
    });

    return {
      storedName,
      storedUrl: blobResult.url,
    };
  }

  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_UPLOADS_DIR, storedName), buffer);
  return {
    storedName,
    storedUrl: "",
  };
}

async function loadUploadedFile(file) {
  if (!file?.storedName) {
    return null;
  }

  if (isBlobStorageEnabled()) {
    const reference = file.storedUrl || blobPathForStoredName(file.storedName);
    const blobResult = await get(reference, {
      access: "private",
      useCache: false,
    });

    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return null;
    }

    const body = await streamToBuffer(blobResult.stream);
    return {
      body,
      size: body.length,
    };
  }

  const filePath = path.resolve(LOCAL_UPLOADS_DIR, file.storedName);
  if (!filePath.startsWith(LOCAL_UPLOADS_DIR) || !fs.existsSync(filePath)) {
    return null;
  }

  const body = fs.readFileSync(filePath);
  return {
    body,
    size: body.length,
  };
}

async function removeUploadedFile(file) {
  if (!file?.storedName) {
    return;
  }

  if (isBlobStorageEnabled()) {
    const reference = file.storedUrl || blobPathForStoredName(file.storedName);
    await del(reference);
    return;
  }

  const filePath = path.resolve(LOCAL_UPLOADS_DIR, file.storedName);
  if (filePath.startsWith(LOCAL_UPLOADS_DIR) && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  getDataFileLabel,
  isBlobStorageEnabled,
  loadUploadedFile,
  mutateStore,
  readStore,
  removeUploadedFile,
  saveUploadedFile,
  writeStore,
};
