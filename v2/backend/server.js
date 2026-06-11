const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { signToken, verifyToken } = require("./auth");
const {
  DEFAULT_ADMIN_EMAIL,
  normalizeManagedEmail,
  appendAudit,
  createId,
  hashPassword,
  rebuildCustomerDeviceIds,
  verifyPassword,
} = require("./store");
const {
  getDataFileLabel,
  loadUploadedFile,
  mutateStore,
  readStore,
  removeUploadedFile,
  saveUploadedFile,
} = require("./storage");

const PORT = Number(process.env.PORT || process.env.V2_SERVER_PORT || 8787);
const ADMIN_DIR = path.join(__dirname, "..", "admin");
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const JSON_BODY_LIMIT = 1024 * 64;
const FILE_BODY_LIMIT = 1024 * 1024 * 120;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Content-Type": `${contentType}; charset=utf-8`,
  });
  response.end(body);
}

function sendBinary(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Content-Type": contentType,
  });
  response.end(body);
}

function sendDownload(response, filePath, file) {
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Length": fs.statSync(filePath).size,
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.originalName || file.title || "arquivo")}"`,
  });
  fs.createReadStream(filePath).pipe(response);
}

function sendDownloadBuffer(response, file, body) {
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Length": body.length,
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.originalName || file.title || "arquivo")}"`,
  });
  response.end(body);
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  });
  response.end();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > JSON_BODY_LIMIT) {
        reject(new Error("Corpo da requisicao excedeu o limite permitido."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!rawBody.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (_error) {
        reject(new Error("JSON invalido."));
      }
    });

    request.on("error", reject);
  });
}

function readRawBody(request, limit = FILE_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error("Arquivo excedeu o limite permitido."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipartForm(request, bodyBuffer) {
  const contentType = request.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Formulario de upload invalido.");
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const fields = {};
  const files = [];
  let offset = 0;

  while (offset < bodyBuffer.length) {
    const boundaryStart = bodyBuffer.indexOf(boundary, offset);
    if (boundaryStart < 0) {
      break;
    }
    const partStart = boundaryStart + boundary.length;
    if (bodyBuffer.slice(partStart, partStart + 2).toString() === "--") {
      break;
    }

    let cursor = partStart;
    if (bodyBuffer.slice(cursor, cursor + 2).toString() === "\r\n") {
      cursor += 2;
    }

    const headerEnd = bodyBuffer.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd < 0) {
      break;
    }

    const nextBoundary = bodyBuffer.indexOf(boundary, headerEnd + 4);
    if (nextBoundary < 0) {
      break;
    }

    const rawHeaders = bodyBuffer.slice(cursor, headerEnd).toString("utf8");
    let content = bodyBuffer.slice(headerEnd + 4, nextBoundary);
    if (content.slice(-2).toString() === "\r\n") {
      content = content.slice(0, -2);
    }

    const disposition = rawHeaders.match(/content-disposition:\s*form-data;\s*([^\r\n]+)/i);
    const name = disposition?.[1]?.match(/name="([^"]+)"/i)?.[1] || "";
    const filename = disposition?.[1]?.match(/filename="([^"]*)"/i)?.[1] || "";
    const type = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";

    if (name && filename) {
      files.push({
        fieldName: name,
        originalName: path.basename(filename),
        mimeType: type,
        buffer: content,
      });
    } else if (name) {
      fields[name] = content.toString("utf8").trim();
    }

    offset = nextBoundary;
  }

  return { fields, files };
}

function normalizeEmail(value) {
  const rawValue = `${value || ""}`.trim();
  if (!rawValue) {
    return "";
  }
  return normalizeManagedEmail(rawValue);
}

function normalizeText(value, fallback = "") {
  const text = `${value || ""}`.trim();
  return text || fallback;
}

function normalizeFileCategory(value) {
  const category = `${value || ""}`.trim().toLowerCase();
  if (category === "app" || category === "document" || category === "log") {
    return category;
  }
  return "document";
}

function sanitizeFilename(value) {
  const baseName = path.basename(`${value || "arquivo"}`.trim() || "arquivo");
  return baseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 180) || "arquivo";
}

function normalizePlanName(value) {
  return normalizeText(value, "Plano Mensal");
}

function parsePriceAmount(value) {
  if (value === null || typeof value === "undefined" || `${value}`.trim() === "") {
    return null;
  }

  const amount = Number(`${value}`.trim().replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Informe um valor valido para a assinatura.");
  }
  return Number(amount.toFixed(2));
}

function parseDeviceCount(value) {
  const count = Number(`${value ?? ""}`.trim());
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Informe um numero de dispositivos valido.");
  }
  return count;
}

function normalizeUrlPath(urlString) {
  return new URL(urlString, "http://localhost").pathname;
}

function getPublicServerUrl(request) {
  const forwardedProto = `${request.headers["x-forwarded-proto"] || ""}`.trim();
  const host = `${request.headers.host || ""}`.trim();
  if (host) {
    return `${forwardedProto || "https"}://${host}`.replace(/\/+$/, "");
  }
  return "https://alfatec01.vercel.app";
}

function getBearerToken(request) {
  const authHeader = request.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }
  return authHeader.slice("Bearer ".length).trim();
}

function findUserById(store, userId) {
  return store.users.find((user) => user.id === userId) || null;
}

function findUserByEmail(store, email) {
  const normalizedEmail = normalizeEmail(email);
  return store.users.find((user) => normalizeEmail(user.email) === normalizedEmail) || null;
}

function findCustomerById(store, customerId) {
  return store.customers.find((customer) => customer.id === customerId) || null;
}

function getCustomerUsers(store, customerId) {
  return store.users.filter((user) => user.customerId === customerId);
}

function getManagerUsers(store, customerId) {
  return getCustomerUsers(store, customerId).filter((user) => user.role === "customer_manager");
}

function getTeacherUsers(store, customerId) {
  return getCustomerUsers(store, customerId).filter((user) => user.role === "teacher");
}

function getActiveTeacherCount(store, customerId) {
  return getTeacherUsers(store, customerId).filter((user) => user.status === "active").length;
}

function getActiveManagedUserCount(store, customerId) {
  return getCustomerUsers(store, customerId).filter(
    (user) => user.status === "active" && (user.role === "customer_manager" || user.role === "teacher")
  ).length;
}

function getPricePerDevice(customer) {
  if (typeof customer.pricePerDevice === "number" && Number.isFinite(customer.pricePerDevice)) {
    return Number(customer.pricePerDevice.toFixed(2));
  }

  return null;
}

function getDeviceCount(customer) {
  if (Number.isInteger(customer.deviceCount) && customer.deviceCount > 0) {
    return customer.deviceCount;
  }
  return 1;
}

function getCurrentDeviceValue(customer) {
  const pricePerDevice = getPricePerDevice(customer);
  if (typeof pricePerDevice !== "number") {
    return null;
  }
  return Number((pricePerDevice * getDeviceCount(customer)).toFixed(2));
}

function inferCustomerIdFromAuditEntry(store, entry) {
  const explicitCustomerId = `${entry.details?.customerId || ""}`.trim();
  if (explicitCustomerId) {
    return explicitCustomerId;
  }

  const auditEmail = normalizeEmail(entry.details?.email || "");
  if (!auditEmail) {
    return "";
  }

  const matchedUser = findUserByEmail(store, auditEmail);
  return matchedUser?.customerId || "";
}

function formatFallbackDeviceLabel(deviceId) {
  const trimmedDeviceId = `${deviceId || ""}`.trim();
  if (!trimmedDeviceId) {
    return "";
  }
  if (trimmedDeviceId.startsWith("desktop-")) {
    return `Desktop ${trimmedDeviceId.slice("desktop-".length, "desktop-".length + 8)}`;
  }
  return trimmedDeviceId;
}

function extractEmailFromText(value) {
  const match = `${value || ""}`.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? normalizeEmail(match[0]) : "";
}

function addHours(isoDate, hours) {
  return new Date(new Date(isoDate).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function computeCustomerStatus(customer) {
  const now = Date.now();
  const expiresAtMs = Date.parse(customer.expiresAt);

  if (customer.blocked) {
    return {
      valid: false,
      status: "blocked",
      reason: customer.blockedReason || "A assinatura foi bloqueada pelo administrador.",
      expiresAt: customer.expiresAt,
      offlineAccessUntil: addHours(customer.expiresAt, 0),
    };
  }

  if (Number.isNaN(expiresAtMs) || now > expiresAtMs) {
    return {
      valid: false,
      status: "expired",
      reason: "A assinatura expirou e precisa ser renovada.",
      expiresAt: customer.expiresAt,
      offlineAccessUntil: addHours(customer.expiresAt, 0),
    };
  }

  return {
    valid: true,
    status: "active",
    reason: "Assinatura ativa.",
    expiresAt: customer.expiresAt,
    offlineAccessUntil: customer.expiresAt,
  };
}

function buildLicenseSnapshot(store, customer) {
  const status = computeCustomerStatus(customer);
  const pricePerDevice = getPricePerDevice(customer);
  const currentValue = getCurrentDeviceValue(customer);
  const offlineGraceHours =
    Number.isInteger(store.settings.offlineGraceHours) && store.settings.offlineGraceHours > 0
      ? store.settings.offlineGraceHours
      : 24 * 10;
  const offlineAccessUntil = status.valid
    ? addHours(new Date().toISOString(), offlineGraceHours)
    : status.offlineAccessUntil;

  return {
    ...status,
    offlineAccessUntil,
    customerId: customer.id,
    customerName: customer.name,
    email: customer.email,
    planName: customer.planName,
    pricePerDevice,
    priceAmount: pricePerDevice,
    currentValue,
    deviceCount: getDeviceCount(customer),
    devicesInUse: customer.deviceIds.length,
    blockedReason: customer.blockedReason || "",
    notes: customer.notes || "",
    offlineGraceHours,
  };
}

function sanitizePortalUser(user) {
  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    passwordPlaintext: user.passwordPlaintext || "",
    loginCount: user.loginCount || 0,
    lastLoginAt: user.lastLoginAt || null,
    lastSeenAt: user.lastSeenAt || null,
    boundDeviceId: user.boundDeviceId || "",
    boundDeviceLabel: user.boundDeviceLabel || "",
    studentCount: user.studentCount || 0,
    classCount: user.classCount || 0,
    lastSyncAt: user.lastSyncAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function sanitizeLibraryFile(file) {
  return {
    id: file.id,
    customerId: file.customerId,
    uploadedByUserId: file.uploadedByUserId,
    uploadedByName: file.uploadedByName,
    uploadedByEmail: file.uploadedByEmail,
    category: file.category,
    title: file.title,
    description: file.description,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt,
  };
}

function buildCustomerDeviceList(store, customer) {
  const devicesById = new Map();
  const customerUsers = getCustomerUsers(store, customer.id);
  const usersByEmail = new Map(customerUsers.map((user) => [normalizeEmail(user.email), user]));

  for (const entry of store.audit) {
    const deviceId = `${entry.details?.deviceId || ""}`.trim();
    if (!deviceId || inferCustomerIdFromAuditEntry(store, entry) !== customer.id) {
      continue;
    }

    const auditEmail = normalizeEmail(entry.details?.email || "") || extractEmailFromText(entry.summary);
    const matchedUser = auditEmail ? usersByEmail.get(auditEmail) : null;
    const currentDevice = devicesById.get(deviceId) || {
      deviceId,
      deviceLabel: "",
      userId: "",
      userDisplayName: "",
      userEmail: "",
      userRole: "",
      lastLoginAt: null,
      lastSeenAt: null,
      lastSyncAt: null,
      studentCount: 0,
      classCount: 0,
    };

    currentDevice.deviceLabel =
      currentDevice.deviceLabel ||
      `${entry.details?.deviceLabel || ""}`.trim() ||
      formatFallbackDeviceLabel(deviceId);
    currentDevice.userId = currentDevice.userId || matchedUser?.id || "";
    currentDevice.userDisplayName =
      currentDevice.userDisplayName ||
      matchedUser?.displayName ||
      `${entry.details?.userDisplayName || ""}`.trim();
    currentDevice.userEmail = currentDevice.userEmail || matchedUser?.email || auditEmail;
    currentDevice.userRole = currentDevice.userRole || matchedUser?.role || `${entry.details?.role || ""}`.trim();
    currentDevice.lastLoginAt =
      currentDevice.lastLoginAt ||
      (entry.type === "login" ? entry.createdAt || null : null) ||
      matchedUser?.lastLoginAt ||
      null;
    currentDevice.lastSeenAt = currentDevice.lastSeenAt || matchedUser?.lastSeenAt || null;
    currentDevice.lastSyncAt = currentDevice.lastSyncAt || matchedUser?.lastSyncAt || null;
    currentDevice.studentCount = Math.max(currentDevice.studentCount, matchedUser?.studentCount || 0);
    currentDevice.classCount = Math.max(currentDevice.classCount, matchedUser?.classCount || 0);

    devicesById.set(deviceId, currentDevice);
  }

  for (const deviceId of customer.deviceIds || []) {
    if (!devicesById.has(deviceId)) {
      devicesById.set(deviceId, {
        deviceId,
        deviceLabel: formatFallbackDeviceLabel(deviceId),
        userId: "",
        userDisplayName: "",
        userEmail: "",
        userRole: "",
        lastLoginAt: null,
        lastSeenAt: null,
        lastSyncAt: null,
        studentCount: 0,
        classCount: 0,
      });
    }
  }

  return Array.from(devicesById.values()).sort((left, right) =>
    (left.userDisplayName || left.deviceLabel || left.deviceId).localeCompare(
      right.userDisplayName || right.deviceLabel || right.deviceId,
      "pt-BR"
    )
  );
}

function sanitizeCustomerForPortal(store, customer) {
  const managerUsers = getManagerUsers(store, customer.id);
  const teacherUsers = getTeacherUsers(store, customer.id);
  const allUsers = managerUsers.concat(teacherUsers);
  const license = buildLicenseSnapshot(store, customer);

  return {
    ...license,
    id: customer.id,
    customerName: customer.name,
    pricePerDevice: getPricePerDevice(customer),
    priceAmount: getPricePerDevice(customer),
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    deviceIds: customer.deviceIds,
    devices: buildCustomerDeviceList(store, customer),
    files: (store.files || [])
      .filter((file) => file.customerId === customer.id)
      .map(sanitizeLibraryFile)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    managerUsers: managerUsers.map(sanitizePortalUser),
    teacherUsers: teacherUsers.map(sanitizePortalUser).sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "pt-BR")
    ),
    usage: {
      totalLogins: allUsers.reduce((sum, user) => sum + (user.loginCount || 0), 0),
      totalStudents: allUsers.reduce((sum, user) => sum + (user.studentCount || 0), 0),
      totalClasses: allUsers.reduce((sum, user) => sum + (user.classCount || 0), 0),
      totalManagedUsers: getActiveManagedUserCount(store, customer.id),
      teacherSlotsUsed: getActiveTeacherCount(store, customer.id),
      teacherSlotsAvailable: Math.max(getDeviceCount(customer) - getActiveManagedUserCount(store, customer.id), 0),
    },
  };
}

function renderOverview(store, viewer) {
  const visibleCustomers = viewer.role === "admin"
    ? store.customers
    : store.customers.filter((customer) => customer.id === viewer.customerId);

  const customers = visibleCustomers
    .map((customer) => sanitizeCustomerForPortal(store, customer))
    .sort((left, right) => left.customerName.localeCompare(right.customerName, "pt-BR"));

  const visibleCustomerIds = new Set(customers.map((customer) => customer.id));
  const audit = store.audit
    .filter((entry) => {
      if (viewer.role === "admin") {
        return true;
      }
      const entryCustomerId = entry.details?.customerId;
      return entryCustomerId && visibleCustomerIds.has(entryCustomerId);
    })
    .slice(0, 20);

  return {
    serverName: store.settings.serverName,
    dataFile: getDataFileLabel(),
    viewer: {
      id: viewer.id,
      role: viewer.role,
      email: viewer.email,
      displayName: viewer.displayName,
      customerId: viewer.customerId,
      canCreateCustomers: viewer.role === "admin",
      canManageUsers: viewer.role === "admin" || viewer.role === "customer_manager",
    },
    metrics: {
      totalCustomers: customers.length,
      activeCustomers: customers.filter((customer) => customer.status === "active").length,
      blockedCustomers: customers.filter((customer) => customer.status === "blocked").length,
      totalDevices: customers.reduce((sum, customer) => sum + customer.deviceCount, 0),
      devicesInUse: customers.reduce((sum, customer) => sum + customer.devicesInUse, 0),
      totalTeacherUsers: customers.reduce((sum, customer) => sum + customer.teacherUsers.length, 0),
      totalStudents: customers.reduce((sum, customer) => sum + customer.usage.totalStudents, 0),
      currentRevenue: Number(
        customers.reduce((sum, customer) => sum + (typeof customer.currentValue === "number" ? customer.currentValue : 0), 0).toFixed(2)
      ),
    },
    customers,
    audit,
  };
}

function listNetworkUrls() {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      urls.push(`http://${entry.address}:${PORT}`);
    }
  }
  return Array.from(new Set(urls)).sort();
}

function serveAdminAsset(requestPath, response) {
  const relativePath =
    requestPath === "/" || requestPath === "/admin" || requestPath === "/admin/"
      ? "index.html"
      : requestPath.replace(/^\/admin\/?/, "");
  const filePath = path.resolve(ADMIN_DIR, relativePath);

  if (!filePath.startsWith(ADMIN_DIR) || !fs.existsSync(filePath)) {
    sendText(response, 404, "text/plain", "Arquivo nao encontrado.");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const textTypes = {
    ".css": "text/css",
    ".js": "application/javascript",
    ".html": "text/html",
  };
  const binaryTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
  };

  if (binaryTypes[extension]) {
    sendBinary(response, 200, binaryTypes[extension], fs.readFileSync(filePath));
    return;
  }

  sendText(response, 200, textTypes[extension] || "text/html", fs.readFileSync(filePath, "utf8"));
}

async function requireAuthenticatedUser(request, response) {
  const store = await readStore();
  const token = getBearerToken(request);

  try {
    const payload = verifyToken(token, store.settings.tokenSecret);
    const user = findUserById(store, payload.userId);

    if (!user || user.status !== "active") {
      sendJson(response, 401, { error: "Sessao invalida." });
      return null;
    }

    return { store, user, payload };
  } catch (error) {
    sendJson(response, 401, { error: error.message || "Token invalido." });
    return null;
  }
}

async function requireAdmin(request, response) {
  const session = await requireAuthenticatedUser(request, response);
  if (!session) {
    return null;
  }

  if (session.user.role !== "admin") {
    sendJson(response, 403, { error: "Apenas administradores podem acessar este recurso." });
    return null;
  }

  return session;
}

async function requirePortalUser(request, response) {
  const session = await requireAuthenticatedUser(request, response);
  if (!session) {
    return null;
  }

  if (!["admin", "customer_manager"].includes(session.user.role)) {
    sendJson(response, 403, { error: "Essa conta nao pode abrir o portal de controle." });
    return null;
  }

  return session;
}

async function requireLicensedUser(request, response) {
  const session = await requireAuthenticatedUser(request, response);
  if (!session) {
    return null;
  }

  if (session.user.role === "admin") {
    return session;
  }

  const customer = findCustomerById(session.store, session.user.customerId);
  if (!customer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return null;
  }

  return {
    ...session,
    customer,
  };
}

function canManageCustomer(session, customerId) {
  if (session.user.role === "admin") {
    return true;
  }
  return session.user.role === "customer_manager" && session.user.customerId === customerId;
}

function ensureUserCanUseDevice(user, deviceId) {
  if (user.role !== "teacher") {
    return {
      ok: true,
      shouldBind: false,
    };
  }

  const normalizedDeviceId = `${deviceId || ""}`.trim();
  if (!normalizedDeviceId) {
    return {
      ok: false,
      error: "Dispositivo nao informado para esta conta.",
    };
  }

  if (user.boundDeviceId && user.boundDeviceId !== normalizedDeviceId) {
    return {
      ok: false,
      error: "Esse usuario ja esta vinculado a outro dispositivo. Limpe o vinculo no Controle AlfaTec ou use outro usuario.",
    };
  }

  return {
    ok: true,
    shouldBind: !user.boundDeviceId,
  };
}

function bindUserToDevice(mutableStore, userId, deviceId, deviceLabel = "") {
  const user = findUserById(mutableStore, userId);
  if (!user) {
    return null;
  }
  user.boundDeviceId = `${deviceId || ""}`.trim();
  user.boundDeviceLabel = normalizeText(deviceLabel);
  user.updatedAt = new Date().toISOString();
  rebuildCustomerDeviceIds(mutableStore);
  return user;
}

function issueToken(store, user) {
  return signToken(
    {
      userId: user.id,
      role: user.role,
      customerId: user.customerId,
      email: user.email,
      issuedAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    },
    store.settings.tokenSecret
  );
}

async function handleLogin(request, response) {
  const body = await readJsonBody(request);
  const store = await readStore();
  const email = normalizeEmail(body.email);
  const password = `${body.password || ""}`;
  const deviceId = `${body.deviceId || ""}`.trim();
  const deviceLabel = normalizeText(body.deviceLabel);

  if (!email || !password) {
    sendJson(response, 400, { error: "Informe email e senha." });
    return;
  }

  const user = findUserByEmail(store, email);
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    sendJson(response, 401, { error: "Email ou senha invalidos." });
    return;
  }

  if (user.status !== "active") {
    sendJson(response, 403, { error: "Conta desativada." });
    return;
  }

  let customer = null;
  let license = null;
  if (user.role !== "admin") {
    customer = findCustomerById(store, user.customerId);
    if (!customer) {
      sendJson(response, 404, { error: "Cliente da conta nao encontrado." });
      return;
    }

    const deviceCheck = ensureUserCanUseDevice(user, deviceId);
    if (!deviceCheck.ok) {
      sendJson(response, 403, { error: deviceCheck.error });
      return;
    }

    license = buildLicenseSnapshot(store, customer);
  }

  await mutateStore((mutableStore) => {
    const mutableUser = findUserById(mutableStore, user.id);
    if (!mutableUser) {
      return;
    }

    mutableUser.loginCount = (mutableUser.loginCount || 0) + 1;
    mutableUser.lastLoginAt = new Date().toISOString();
    mutableUser.lastSeenAt = mutableUser.lastLoginAt;
    mutableUser.updatedAt = mutableUser.lastLoginAt;

    if (mutableUser.role === "teacher" && deviceId) {
      bindUserToDevice(mutableStore, mutableUser.id, deviceId, deviceLabel);
    }

    appendAudit(
      mutableStore,
      "login",
      `Login realizado por ${mutableUser.email}.`,
      {
        email: mutableUser.email,
        userDisplayName: mutableUser.displayName,
        role: mutableUser.role,
        customerId: mutableUser.customerId,
        deviceId,
        deviceLabel,
      }
    );
  });

  const freshStore = await readStore();
  const freshUser = findUserByEmail(freshStore, email);
  const freshCustomer = freshUser && freshUser.customerId ? findCustomerById(freshStore, freshUser.customerId) : null;

  sendJson(response, 200, {
    token: issueToken(freshStore, freshUser),
    serverTime: new Date().toISOString(),
    user: {
      id: freshUser.id,
      role: freshUser.role,
      email: freshUser.email,
      displayName: freshUser.displayName,
      customerId: freshUser.customerId,
      boundDeviceId: freshUser.boundDeviceId || "",
    },
    license: freshCustomer ? buildLicenseSnapshot(freshStore, freshCustomer) : {
      valid: true,
      status: "active",
      reason: "Conta administrativa liberada.",
    },
  });
}

async function handleLicenseValidate(request, response) {
  const session = await requireLicensedUser(request, response);
  if (!session) {
    return;
  }

  if (session.user.role === "admin") {
    sendJson(response, 200, {
      serverTime: new Date().toISOString(),
      license: {
        valid: true,
        status: "active",
        reason: "Conta administrativa liberada.",
      },
    });
    return;
  }

  const deviceId = `${request.headers["x-device-id"] || ""}`.trim();
  const deviceCheck = ensureUserCanUseDevice(session.user, deviceId);
  if (!deviceCheck.ok) {
    sendJson(response, 403, { error: deviceCheck.error });
    return;
  }

  if (deviceCheck.shouldBind && deviceId) {
    await mutateStore((mutableStore) => {
      bindUserToDevice(mutableStore, session.user.id, deviceId);
      appendAudit(
        mutableStore,
        "device-bind",
        `Dispositivo vinculado para ${session.user.email}.`,
        {
          customerId: session.user.customerId,
          userId: session.user.id,
          deviceId,
        }
      );
    });
  }

  const freshStore = await readStore();
  const freshCustomer = findCustomerById(freshStore, session.user.customerId);
  sendJson(response, 200, {
    serverTime: new Date().toISOString(),
    license: buildLicenseSnapshot(freshStore, freshCustomer),
  });
}

async function handlePortalOverview(request, response) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  sendJson(response, 200, renderOverview(session.store, session.user));
}

async function handleClientSync(request, response) {
  const session = await requireLicensedUser(request, response);
  if (!session) {
    return;
  }

  if (session.user.role === "admin") {
    sendJson(response, 400, { error: "Conta administrativa nao envia sincronizacao de cliente." });
    return;
  }

  const body = await readJsonBody(request);
  const deviceId = `${request.headers["x-device-id"] || body.deviceId || ""}`.trim();
  const deviceLabel = normalizeText(body.deviceLabel);
  const studentCount = Number.isInteger(body.studentCount) && body.studentCount >= 0 ? body.studentCount : 0;
  const classCount = Number.isInteger(body.classCount) && body.classCount >= 0 ? body.classCount : 0;

  const deviceCheck = ensureUserCanUseDevice(session.user, deviceId);
  if (!deviceCheck.ok) {
    sendJson(response, 403, { error: deviceCheck.error });
    return;
  }

  await mutateStore((mutableStore) => {
    const mutableUser = findUserById(mutableStore, session.user.id);
    if (!mutableUser) {
      return;
    }

    if (mutableUser.role === "teacher" && !mutableUser.boundDeviceId && deviceId) {
      bindUserToDevice(mutableStore, mutableUser.id, deviceId, deviceLabel);
    }

    mutableUser.studentCount = studentCount;
    mutableUser.classCount = classCount;
    mutableUser.lastSeenAt = new Date().toISOString();
    mutableUser.lastSyncAt = mutableUser.lastSeenAt;
    if (deviceLabel) {
      mutableUser.boundDeviceLabel = deviceLabel;
    }
    mutableUser.updatedAt = mutableUser.lastSeenAt;
    rebuildCustomerDeviceIds(mutableStore);
  });

  const freshStore = await readStore();
  const freshUser = findUserById(freshStore, session.user.id);
  sendJson(response, 200, {
    ok: true,
    usage: sanitizePortalUser(freshUser),
  });
}

async function handleCreateCustomer(request, response) {
  const session = await requireAdmin(request, response);
  if (!session) {
    return;
  }

  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const password = normalizeText(body.password);
  const name = normalizeText(body.name);
  const planName = normalizePlanName(body.planName);
  const notes = normalizeText(body.notes);
  const expiresAt = normalizeText(body.expiresAt);

  if (!name || !email || !password || !expiresAt) {
    sendJson(response, 400, { error: "Nome, email, senha e vencimento sao obrigatorios." });
    return;
  }

  let priceAmount;
  let deviceCount;
  try {
    priceAmount = parsePriceAmount(body.priceAmount);
    deviceCount = parseDeviceCount(body.deviceCount);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Dados do cliente invalidos." });
    return;
  }

  if (priceAmount === null) {
    sendJson(response, 400, { error: "Informe o preco por dispositivo do plano." });
    return;
  }

  if (findUserByEmail(session.store, email)) {
    sendJson(response, 409, { error: "Ja existe uma conta com este email." });
    return;
  }

  const result = await mutateStore((mutableStore) => {
    const customerId = createId("customer");
    const userId = createId("user");
    const credentials = hashPassword(password);
    const nowIso = new Date().toISOString();

    mutableStore.customers.push({
      id: customerId,
      name,
      email,
      planName,
      pricePerDevice: priceAmount,
      deviceCount,
      expiresAt,
      blocked: false,
      blockedReason: "",
      notes,
      deviceIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    mutableStore.users.push({
      id: userId,
      role: "customer_manager",
      displayName: name,
      email,
      status: "active",
      customerId,
      passwordPlaintext: password,
      passwordHash: credentials.passwordHash,
      passwordSalt: credentials.passwordSalt,
      loginCount: 0,
      lastLoginAt: null,
      lastSeenAt: null,
      boundDeviceId: "",
      boundDeviceLabel: "",
      studentCount: 0,
      classCount: 0,
      lastSyncAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    appendAudit(
      mutableStore,
      "customer-create",
      `Cliente ${email} criado por ${session.user.email}.`,
      { customerId, email }
    );

    return customerId;
  });

  const freshStore = await readStore();
  const customer = findCustomerById(freshStore, result);
  sendJson(response, 201, sanitizeCustomerForPortal(freshStore, customer));
}

async function handleUpdateCustomer(request, response, customerId) {
  const session = await requireAdmin(request, response);
  if (!session) {
    return;
  }

  const body = await readJsonBody(request);
  let result;

  try {
    result = await mutateStore((mutableStore) => {
      const customer = findCustomerById(mutableStore, customerId);
      if (!customer) {
        return null;
      }

      if (typeof body.name === "string" && body.name.trim()) {
        customer.name = body.name.trim();
      }
      if (typeof body.planName === "string") {
        customer.planName = normalizePlanName(body.planName);
      }
      if (typeof body.priceAmount !== "undefined") {
        customer.pricePerDevice = parsePriceAmount(body.priceAmount);
      }
      if (typeof body.deviceCount !== "undefined") {
        customer.deviceCount = parseDeviceCount(body.deviceCount);
      }
      if (typeof body.notes === "string") {
        customer.notes = body.notes.trim();
      }
      if (typeof body.expiresAt === "string" && body.expiresAt.trim()) {
        customer.expiresAt = body.expiresAt.trim();
      }
      if (typeof body.blocked !== "undefined") {
        customer.blocked = Boolean(body.blocked);
      }
      if (typeof body.blockedReason === "string") {
        customer.blockedReason = body.blockedReason.trim();
      }
      if (typeof body.email === "string" && normalizeEmail(body.email)) {
        const nextEmail = normalizeEmail(body.email);
        const conflict = mutableStore.users.find(
          (user) => normalizeEmail(user.email) === nextEmail && user.customerId !== customer.id
        );
        if (conflict) {
          throw new Error("Ja existe outra conta usando este email.");
        }
        customer.email = nextEmail;
        const managerUser = getManagerUsers(mutableStore, customer.id)[0];
        if (managerUser) {
          managerUser.email = nextEmail;
          managerUser.updatedAt = new Date().toISOString();
        }
      }

      customer.updatedAt = new Date().toISOString();
      appendAudit(
        mutableStore,
        "customer-update",
        `Cliente ${customer.email} atualizado por ${session.user.email}.`,
        { customerId: customer.id }
      );
      return customer.id;
    });
  } catch (error) {
    sendJson(response, 409, { error: error.message || "Nao foi possivel atualizar o cliente." });
    return;
  }

  if (result === null) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  const freshStore = await readStore();
  const customer = findCustomerById(freshStore, result);
  sendJson(response, 200, sanitizeCustomerForPortal(freshStore, customer));
}

async function handleResetCustomerPassword(request, response, customerId) {
  const session = await requireAdmin(request, response);
  if (!session) {
    return;
  }

  const body = await readJsonBody(request);
  const nextPassword = normalizeText(body.password);
  if (!nextPassword) {
    sendJson(response, 400, { error: "Informe a nova senha." });
    return;
  }

  const updated = await mutateStore((mutableStore) => {
    const user = getManagerUsers(mutableStore, customerId)[0];
    if (!user) {
      return false;
    }

    const credentials = hashPassword(nextPassword);
    user.passwordPlaintext = nextPassword;
    user.passwordHash = credentials.passwordHash;
    user.passwordSalt = credentials.passwordSalt;
    user.updatedAt = new Date().toISOString();
    appendAudit(
      mutableStore,
      "password-reset",
      `Senha do cliente ${user.email} redefinida.`,
      { customerId, by: session.user.email }
    );
    return true;
  });

  if (!updated) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  sendJson(response, 200, { ok: true });
}

async function handleDeleteCustomer(request, response, customerId) {
  const session = await requireAdmin(request, response);
  if (!session) {
    return;
  }

  const targetCustomer = findCustomerById(session.store, customerId);
  if (!targetCustomer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  const removed = await mutateStore((mutableStore) => {
    const customerIndex = mutableStore.customers.findIndex((customer) => customer.id === customerId);
    if (customerIndex < 0) {
      return null;
    }

    const [customer] = mutableStore.customers.splice(customerIndex, 1);
    const removedUsers = (mutableStore.users || []).filter((user) => user.customerId === customerId);
    mutableStore.users = (mutableStore.users || []).filter((user) => user.customerId !== customerId);

    const removedFiles = (mutableStore.files || []).filter((file) => file.customerId === customerId);
    mutableStore.files = (mutableStore.files || []).filter((file) => file.customerId !== customerId);

    rebuildCustomerDeviceIds(mutableStore);
    appendAudit(
      mutableStore,
      "customer-delete",
      `Cliente ${customer.email} excluido por ${session.user.email}.`,
      {
        customerId: "",
        deletedCustomerId: customerId,
        deletedEmail: customer.email,
        deletedUserCount: removedUsers.length,
        deletedFileCount: removedFiles.length,
        by: session.user.email,
      }
    );

    return {
      customer,
      files: removedFiles,
    };
  });

  if (!removed) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  for (const file of removed.files || []) {
    if (file?.storedName) {
      await removeUploadedFile(file);
    }
  }

  sendJson(response, 200, {
    ok: true,
    deletedCustomerId: customerId,
  });
}

async function handleClearDevices(request, response, customerId) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  if (!canManageCustomer(session, customerId)) {
    sendJson(response, 403, { error: "Voce nao pode limpar dispositivos desse cliente." });
    return;
  }

  const updated = await mutateStore((mutableStore) => {
    const users = getCustomerUsers(mutableStore, customerId);
    if (!users.length) {
      return false;
    }

    for (const user of users) {
      user.boundDeviceId = "";
      user.boundDeviceLabel = "";
      user.updatedAt = new Date().toISOString();
    }
    rebuildCustomerDeviceIds(mutableStore);
    appendAudit(
      mutableStore,
      "devices-clear",
      `Todos os dispositivos do cliente foram limpos por ${session.user.email}.`,
      { customerId, by: session.user.email }
    );
    return true;
  });

  if (!updated) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  sendJson(response, 200, { ok: true });
}

async function handleCreatePortalUser(request, response) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  if (session.user.role !== "admin") {
    sendJson(response, 403, { error: "Somente o controle/admin pode criar usuarios." });
    return;
  }

  const body = await readJsonBody(request);
  const customerId = normalizeText(body.customerId);
  const displayName = normalizeText(body.displayName);
  const email = normalizeEmail(body.email);
  const password = normalizeText(body.password);

  if (!customerId || !displayName || !email || !password) {
    sendJson(response, 400, { error: "Cliente, nome, email e senha sao obrigatorios." });
    return;
  }

  if (!canManageCustomer(session, customerId)) {
    sendJson(response, 403, { error: "Voce nao pode criar usuarios para esse cliente." });
    return;
  }

  const customer = findCustomerById(session.store, customerId);
  if (!customer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  if (findUserByEmail(session.store, email)) {
    sendJson(response, 409, { error: "Ja existe uma conta com este email." });
    return;
  }

  if (getActiveManagedUserCount(session.store, customerId) >= getDeviceCount(customer)) {
    sendJson(response, 409, {
      error: "O limite total de dispositivos/usuarios foi atingido para esse cliente.",
    });
    return;
  }

  const createdUserId = await mutateStore((mutableStore) => {
    const credentials = hashPassword(password);
    const userId = createId("user");
    const nowIso = new Date().toISOString();
    mutableStore.users.push({
      id: userId,
      role: "teacher",
      displayName,
      email,
      status: "active",
      customerId,
      passwordPlaintext: password,
      passwordHash: credentials.passwordHash,
      passwordSalt: credentials.passwordSalt,
      loginCount: 0,
      lastLoginAt: null,
      lastSeenAt: null,
      boundDeviceId: "",
      boundDeviceLabel: "",
      studentCount: 0,
      classCount: 0,
      lastSyncAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    appendAudit(
      mutableStore,
      "teacher-create",
      `Usuario ${email} criado para o cliente.`,
      { customerId, userId, by: session.user.email }
    );
    return userId;
  });

  const freshStore = await readStore();
  const user = findUserById(freshStore, createdUserId);
  sendJson(response, 201, sanitizePortalUser(user));
}

async function handleUpdatePortalUser(request, response, userId) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  const targetUser = findUserById(session.store, userId);
  if (!targetUser || targetUser.role === "admin") {
    sendJson(response, 404, { error: "Usuario nao encontrado." });
    return;
  }

  if (!canManageCustomer(session, targetUser.customerId)) {
    sendJson(response, 403, { error: "Voce nao pode editar esse usuario." });
    return;
  }

  if (session.user.role !== "admin" && targetUser.role !== "teacher") {
    sendJson(response, 403, { error: "A conta do cliente nao pode editar esse usuario." });
    return;
  }

  const body = await readJsonBody(request);

  try {
    const updated = await mutateStore((mutableStore) => {
      const mutableUser = findUserById(mutableStore, userId);
      if (!mutableUser) {
        return false;
      }

      if (typeof body.displayName === "string" && body.displayName.trim()) {
        mutableUser.displayName = body.displayName.trim();
      }

      if (typeof body.email === "string" && normalizeEmail(body.email)) {
        const nextEmail = normalizeEmail(body.email);
        const conflict = mutableStore.users.find(
          (user) => user.id !== mutableUser.id && normalizeEmail(user.email) === nextEmail
        );
        if (conflict) {
          throw new Error("Ja existe outra conta usando este email.");
        }
        mutableUser.email = nextEmail;
      }

      if (typeof body.password === "string" && body.password.trim()) {
        const credentials = hashPassword(body.password.trim());
        mutableUser.passwordPlaintext = body.password.trim();
        mutableUser.passwordHash = credentials.passwordHash;
        mutableUser.passwordSalt = credentials.passwordSalt;
      }

      if (typeof body.status !== "undefined") {
        mutableUser.status = body.status === "inactive" ? "inactive" : "active";
      }

      if (body.clearDeviceBinding) {
        mutableUser.boundDeviceId = "";
        mutableUser.boundDeviceLabel = "";
      }

      mutableUser.updatedAt = new Date().toISOString();
      rebuildCustomerDeviceIds(mutableStore);
      appendAudit(
        mutableStore,
        "teacher-update",
        `Usuario ${mutableUser.email} atualizado.`,
        { customerId: mutableUser.customerId, userId: mutableUser.id, by: session.user.email }
      );
      return true;
    });

    if (!updated) {
      sendJson(response, 404, { error: "Usuario nao encontrado." });
      return;
    }
  } catch (error) {
    sendJson(response, 409, { error: error.message || "Nao foi possivel atualizar o usuario." });
    return;
  }

  const freshStore = await readStore();
  const freshUser = findUserById(freshStore, userId);
  sendJson(response, 200, sanitizePortalUser(freshUser));
}

async function handleDeletePortalUser(request, response, userId) {
  const session = await requireAdmin(request, response);
  if (!session) {
    return;
  }

  const targetUser = findUserById(session.store, userId);
  if (!targetUser || targetUser.role === "admin") {
    sendJson(response, 404, { error: "Usuario nao encontrado." });
    return;
  }

  const removed = await mutateStore((mutableStore) => {
    const userIndex = mutableStore.users.findIndex((user) => user.id === userId && user.role !== "admin");
    if (userIndex < 0) {
      return null;
    }

    const [user] = mutableStore.users.splice(userIndex, 1);
    rebuildCustomerDeviceIds(mutableStore);
    appendAudit(
      mutableStore,
      "user-delete",
      `Usuario ${user.email} removido por ${session.user.email}.`,
      { customerId: user.customerId, userId: user.id, by: session.user.email }
    );
    return user;
  });

  if (!removed) {
    sendJson(response, 404, { error: "Usuario nao encontrado." });
    return;
  }

  sendJson(response, 200, { ok: true });
}

async function handleSetCustomerManager(request, response, customerId) {
  const session = await requireAdmin(request, response);
  if (!session) {
    return;
  }

  const body = await readJsonBody(request);
  const userId = normalizeText(body.userId);

  if (!userId) {
    sendJson(response, 400, { error: "Informe qual usuario sera o gerente." });
    return;
  }

  const customer = findCustomerById(session.store, customerId);
  if (!customer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  const targetUser = findUserById(session.store, userId);
  if (!targetUser || targetUser.customerId !== customerId || targetUser.role === "admin") {
    sendJson(response, 404, { error: "Usuario do cliente nao encontrado." });
    return;
  }

  await mutateStore((mutableStore) => {
    const mutableCustomer = findCustomerById(mutableStore, customerId);
    const mutableTargetUser = findUserById(mutableStore, userId);
    if (!mutableCustomer || !mutableTargetUser) {
      throw new Error("Nao foi possivel localizar o cliente ou usuario.");
    }

    const nowIso = new Date().toISOString();
    const currentManagers = getManagerUsers(mutableStore, customerId);

    for (const manager of currentManagers) {
      if (manager.id !== mutableTargetUser.id) {
        manager.role = "teacher";
        manager.updatedAt = nowIso;
      }
    }

    mutableTargetUser.role = "customer_manager";
    mutableTargetUser.status = "active";
    mutableTargetUser.updatedAt = nowIso;
    mutableCustomer.email = mutableTargetUser.email;
    mutableCustomer.updatedAt = nowIso;

    appendAudit(
      mutableStore,
      "manager-set",
      `Usuario ${mutableTargetUser.email} definido como gerente por ${session.user.email}.`,
      {
        customerId,
        userId: mutableTargetUser.id,
        by: session.user.email,
      }
    );
  });

  const freshStore = await readStore();
  const freshCustomer = findCustomerById(freshStore, customerId);
  sendJson(response, 200, sanitizeCustomerForPortal(freshStore, freshCustomer));
}

async function handleUploadLibraryFile(request, response) {
  const session = await requireAuthenticatedUser(request, response);
  if (!session) {
    return;
  }

  const rawBody = await readRawBody(request);
  const { fields, files } = parseMultipartForm(request, rawBody);
  const uploadedFile = files.find((file) => file.fieldName === "file") || files[0];
  const customerId = session.user.role === "admin" ? normalizeText(fields.customerId) : session.user.customerId;

  if (!customerId || !uploadedFile || !uploadedFile.buffer.length) {
    sendJson(response, 400, { error: "Cliente e arquivo sao obrigatorios." });
    return;
  }

  const customer = findCustomerById(session.store, customerId);
  if (!customer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  if (!canManageCustomer(session, customerId) && session.user.customerId !== customerId) {
    sendJson(response, 403, { error: "Voce nao pode enviar arquivos para esse cliente." });
    return;
  }

  const fileId = createId("file");
  const originalName = sanitizeFilename(uploadedFile.originalName);
  const storedName = `${fileId}-${originalName}`;
  const storedFile = await saveUploadedFile({
    storedName,
    buffer: uploadedFile.buffer,
    mimeType: uploadedFile.mimeType || "application/octet-stream",
  });

  const createdFile = await mutateStore((mutableStore) => {
    const nowIso = new Date().toISOString();
    const libraryFile = {
      id: fileId,
      customerId,
      uploadedByUserId: session.user.id,
      uploadedByName: session.user.displayName || session.user.email,
      uploadedByEmail: session.user.email,
      category: normalizeFileCategory(fields.category),
      title: normalizeText(fields.title, originalName),
      description: normalizeText(fields.description),
      originalName,
      storedName: storedFile.storedName,
      storedUrl: storedFile.storedUrl,
      mimeType: uploadedFile.mimeType || "application/octet-stream",
      size: uploadedFile.buffer.length,
      createdAt: nowIso,
    };

    mutableStore.files = mutableStore.files || [];
    mutableStore.files.unshift(libraryFile);
    appendAudit(
      mutableStore,
      "file-upload",
      `Arquivo ${originalName} enviado por ${session.user.email}.`,
      { customerId, fileId, category: libraryFile.category }
    );
    return libraryFile;
  });

  sendJson(response, 201, sanitizeLibraryFile(createdFile));
}

async function handleDownloadLibraryFile(request, response, fileId) {
  const session = await requireAuthenticatedUser(request, response);
  if (!session) {
    return;
  }

  const file = (session.store.files || []).find((entry) => entry.id === fileId);
  if (!file) {
    sendJson(response, 404, { error: "Arquivo nao encontrado." });
    return;
  }

  if (session.user.role !== "admin" && session.user.customerId !== file.customerId) {
    sendJson(response, 403, { error: "Voce nao pode baixar esse arquivo." });
    return;
  }

  const loadedFile = await loadUploadedFile(file);
  if (!loadedFile) {
    sendJson(response, 404, { error: "Arquivo fisico nao encontrado." });
    return;
  }

  sendDownloadBuffer(response, file, loadedFile.body);
}

async function handleDeleteLibraryFile(request, response, fileId) {
  const session = await requireAuthenticatedUser(request, response);
  if (!session) {
    return;
  }

  const targetFile = (session.store.files || []).find((entry) => entry.id === fileId);
  if (!targetFile) {
    sendJson(response, 404, { error: "Arquivo nao encontrado." });
    return;
  }

  if (session.user.role !== "admin" && targetFile.uploadedByUserId !== session.user.id) {
    sendJson(response, 403, { error: "Somente o admin ou quem enviou pode remover esse arquivo." });
    return;
  }

  const removed = await mutateStore((mutableStore) => {
    const index = (mutableStore.files || []).findIndex((entry) => entry.id === fileId);
    if (index < 0) {
      return null;
    }
    const [file] = mutableStore.files.splice(index, 1);
    appendAudit(
      mutableStore,
      "file-delete",
      `Arquivo ${file.originalName} removido por ${session.user.email}.`,
      { customerId: file.customerId, fileId, by: session.user.email }
    );
    return file;
  });

  if (removed?.storedName) {
    await removeUploadedFile(removed);
  }

  sendJson(response, 200, { ok: true });
}

async function handleAdminPasswordChange(request, response) {
  const session = await requireAdmin(request, response);
  if (!session) {
    return;
  }

  const body = await readJsonBody(request);
  const currentPassword = `${body.currentPassword || ""}`;
  const newPassword = `${body.newPassword || ""}`;

  if (!currentPassword || !newPassword) {
    sendJson(response, 400, { error: "Informe a senha atual e a nova senha." });
    return;
  }

  if (newPassword.length < 6) {
    sendJson(response, 400, { error: "A nova senha precisa ter pelo menos 6 caracteres." });
    return;
  }

  if (!verifyPassword(currentPassword, session.user.passwordHash, session.user.passwordSalt)) {
    sendJson(response, 401, { error: "A senha atual nao confere." });
    return;
  }

  const credentials = hashPassword(newPassword);
  await mutateStore((mutableStore) => {
    const adminUser = findUserById(mutableStore, session.user.id);
    if (!adminUser) {
      throw new Error("Conta administrativa nao encontrada.");
    }
    adminUser.passwordPlaintext = newPassword;
    adminUser.passwordHash = credentials.passwordHash;
    adminUser.passwordSalt = credentials.passwordSalt;
    adminUser.updatedAt = new Date().toISOString();
    appendAudit(
      mutableStore,
      "admin-password-change",
      `Senha do admin ${adminUser.email} atualizada.`,
      { by: session.user.email }
    );
  });

  sendJson(response, 200, { ok: true });
}

async function handleAuthenticatedPasswordChange(request, response) {
  const session = await requireAuthenticatedUser(request, response);
  if (!session) {
    return;
  }

  const body = await readJsonBody(request);
  const currentPassword = `${body.currentPassword || ""}`;
  const newPassword = `${body.newPassword || ""}`;

  if (!currentPassword || !newPassword) {
    sendJson(response, 400, { error: "Informe a senha atual e a nova senha." });
    return;
  }

  if (newPassword.length < 6) {
    sendJson(response, 400, { error: "A nova senha precisa ter pelo menos 6 caracteres." });
    return;
  }

  if (!verifyPassword(currentPassword, session.user.passwordHash, session.user.passwordSalt)) {
    sendJson(response, 401, { error: "A senha atual nao confere." });
    return;
  }

  const credentials = hashPassword(newPassword);
  await mutateStore((mutableStore) => {
    const user = findUserById(mutableStore, session.user.id);
    if (!user) {
      throw new Error("Conta nao encontrada.");
    }

    user.passwordPlaintext = newPassword;
    user.passwordHash = credentials.passwordHash;
    user.passwordSalt = credentials.passwordSalt;
    user.updatedAt = new Date().toISOString();
    appendAudit(
      mutableStore,
      "self-password-change",
      `Senha da conta ${user.email} atualizada pelo proprio usuario.`,
      {
        by: user.email,
        customerId: user.customerId || "",
        userId: user.id,
        role: user.role,
      }
    );
  });

  sendJson(response, 200, { ok: true });
}

async function routeRequest(request, response) {
  const pathname = normalizeUrlPath(request.url || "/");

  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && pathname === "/admin") {
    redirect(response, "/admin/");
    return;
  }

  if (request.method === "GET" && pathname === "/api/health") {
    const store = await readStore();
    sendJson(response, 200, {
      ok: true,
      serverTime: new Date().toISOString(),
      serverName: store.settings.serverName,
      networkUrls: listNetworkUrls(),
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/mobile-config") {
    const store = await readStore();
    sendJson(response, 200, {
      ok: true,
      apiUrl: getPublicServerUrl(request),
      serverName: store.settings.serverName,
      publishedAt: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    await handleLogin(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/change-password") {
    await handleAuthenticatedPasswordChange(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/license/validate") {
    await handleLicenseValidate(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/client/sync") {
    await handleClientSync(request, response);
    return;
  }

  if (request.method === "GET" && (pathname === "/api/portal/overview" || pathname === "/api/admin/overview")) {
    await handlePortalOverview(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/customers") {
    await handleCreateCustomer(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/settings/password") {
    await handleAdminPasswordChange(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/portal/users") {
    await handleCreatePortalUser(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/files") {
    await handleUploadLibraryFile(request, response);
    return;
  }

  const updateCustomerMatch = pathname.match(/^\/api\/admin\/customers\/([^/]+)$/);
  if (request.method === "PATCH" && updateCustomerMatch) {
    await handleUpdateCustomer(request, response, updateCustomerMatch[1]);
    return;
  }

  if (request.method === "DELETE" && updateCustomerMatch) {
    await handleDeleteCustomer(request, response, updateCustomerMatch[1]);
    return;
  }

  const resetPasswordMatch = pathname.match(/^\/api\/admin\/customers\/([^/]+)\/reset-password$/);
  if (request.method === "POST" && resetPasswordMatch) {
    await handleResetCustomerPassword(request, response, resetPasswordMatch[1]);
    return;
  }

  const clearDevicesMatch = pathname.match(/^\/api\/admin\/customers\/([^/]+)\/clear-devices$/);
  if (request.method === "POST" && clearDevicesMatch) {
    await handleClearDevices(request, response, clearDevicesMatch[1]);
    return;
  }

  const setManagerMatch = pathname.match(/^\/api\/admin\/customers\/([^/]+)\/manager$/);
  if (request.method === "POST" && setManagerMatch) {
    await handleSetCustomerManager(request, response, setManagerMatch[1]);
    return;
  }

  const updatePortalUserMatch = pathname.match(/^\/api\/portal\/users\/([^/]+)$/);
  if (request.method === "PATCH" && updatePortalUserMatch) {
    await handleUpdatePortalUser(request, response, updatePortalUserMatch[1]);
    return;
  }

  if (request.method === "DELETE" && updatePortalUserMatch) {
    await handleDeletePortalUser(request, response, updatePortalUserMatch[1]);
    return;
  }

  const downloadFileMatch = pathname.match(/^\/api\/files\/([^/]+)\/download$/);
  if (request.method === "GET" && downloadFileMatch) {
    await handleDownloadLibraryFile(request, response, downloadFileMatch[1]);
    return;
  }

  const deleteFileMatch = pathname.match(/^\/api\/files\/([^/]+)$/);
  if (request.method === "DELETE" && deleteFileMatch) {
    await handleDeleteLibraryFile(request, response, deleteFileMatch[1]);
    return;
  }

  if (request.method === "GET" && (pathname === "/" || pathname.startsWith("/admin"))) {
    serveAdminAsset(pathname, response);
    return;
  }

  sendJson(response, 404, { error: "Rota nao encontrada." });
}

function handleRequest(request, response) {
  return routeRequest(request, response).catch((error) => {
    sendJson(response, 500, {
      error: error.message || "Erro interno do servidor.",
    });
  });
}

function createServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[V2] Servidor iniciado em http://localhost:${PORT}`);
    console.log(`[V2] Controle AlfaTec em http://localhost:${PORT}/admin`);
    const networkUrls = listNetworkUrls();
    if (networkUrls.length) {
      console.log("[V2] URLs de rede local:");
      for (const url of networkUrls) {
        console.log(`  ${url}`);
      }
    }
    console.log("[V2] Credenciais iniciais:");
    console.log(`  Admin   -> ${DEFAULT_ADMIN_EMAIL} / admin123`);
    console.log("  Cliente -> cliente@alfatec.com / demo123");
  });
}

module.exports = {
  createServer,
  handleRequest,
  routeRequest,
};
