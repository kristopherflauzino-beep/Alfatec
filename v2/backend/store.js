const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.V2_DATA_DIR
  ? path.resolve(process.env.V2_DATA_DIR)
  : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const STORE_VERSION = 9;
const DEFAULT_OFFLINE_GRACE_HOURS = 24 * 10;
const ALFATEC_EMAIL_DOMAIN = "alfatec.com";
const DEFAULT_ADMIN_EMAIL = "admin@alfatec.com";
const DEFAULT_DEMO_EMAIL = "cliente@alfatec.com";

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha256").toString("hex");
  return {
    passwordHash,
    passwordSalt: salt,
  };
}

function verifyPassword(password, passwordHash, passwordSalt) {
  const candidateHash = crypto.pbkdf2Sync(password, passwordSalt, 120000, 64, "sha256").toString("hex");
  return candidateHash === passwordHash;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendAudit(store, type, summary, details = {}) {
  store.audit.unshift({
    id: createId("audit"),
    type,
    summary,
    details,
    createdAt: new Date().toISOString(),
  });

  if (store.audit.length > 100) {
    store.audit = store.audit.slice(0, 100);
  }
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => `${value || ""}`.trim())
        .filter(Boolean)
    )
  );
}

function sanitizeRole(role) {
  if (role === "customer") {
    return "customer_manager";
  }
  if (role === "customer_manager" || role === "teacher" || role === "admin") {
    return role;
  }
  return "teacher";
}

function normalizeLocalPart(value, fallback = "usuario") {
  const normalizedValue = `${value || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  return normalizedValue || fallback;
}

function isAdminEmail(email) {
  const normalizedEmail = `${email || ""}`.trim().toLowerCase();
  return normalizedEmail === DEFAULT_ADMIN_EMAIL || normalizedEmail === "admin@chamada.local" || normalizedEmail === "admin";
}

function normalizeManagedEmail(value, fallbackLocalPart = "usuario") {
  const rawValue = `${value || ""}`.trim();
  if (!rawValue) {
    return `${normalizeLocalPart(fallbackLocalPart)}@${ALFATEC_EMAIL_DOMAIN}`;
  }

  if (isAdminEmail(rawValue)) {
    return DEFAULT_ADMIN_EMAIL;
  }

  const normalizedValue = rawValue.toLowerCase();
  const emailLocalPart = normalizedValue.includes("@") ? normalizedValue.split("@")[0] : normalizedValue;
  const fallback = normalizeLocalPart(fallbackLocalPart);
  const normalizedLocalPart = normalizeLocalPart(emailLocalPart, fallback);
  return `${normalizedLocalPart}@${ALFATEC_EMAIL_DOMAIN}`;
}

function normalizeOfflineGraceHours(value) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return DEFAULT_OFFLINE_GRACE_HOURS;
  }

  // Atualiza automaticamente o default legado de 72h para a nova regra de 10 dias.
  if (parsedValue === 72) {
    return DEFAULT_OFFLINE_GRACE_HOURS;
  }

  return parsedValue;
}

function defaultPasswordForEmail(email, role = "") {
  const normalizedEmail = `${email || ""}`.trim().toLowerCase();
  if (role === "admin" || isAdminEmail(normalizedEmail)) {
    return "admin123";
  }

  if (normalizedEmail === DEFAULT_DEMO_EMAIL || normalizedEmail === "cliente@demo.com") {
    return "demo123";
  }

  const compactLocalPart = normalizeLocalPart(normalizedEmail.split("@")[0], "alfatec")
    .replace(/\./g, "")
    .slice(0, 18);
  return `${compactLocalPart || "alfatec"}123`;
}

function replaceLegacyEmailsInText(value) {
  return `${value || ""}`
    .replaceAll("admin@chamada.local", DEFAULT_ADMIN_EMAIL)
    .replaceAll("cliente@demo.com", DEFAULT_DEMO_EMAIL);
}

function normalizeAuditValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeAuditValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeAuditValue(entryValue)])
    );
  }

  if (typeof value === "string") {
    if (value === "customer") {
      return "customer_manager";
    }
    return replaceLegacyEmailsInText(value);
  }

  return value;
}

function normalizeAuditEntry(rawEntry, nowIso) {
  return {
    id: rawEntry.id || createId("audit"),
    type: `${rawEntry.type || "event"}`.trim() || "event",
    summary: replaceLegacyEmailsInText(rawEntry.summary || "Evento registrado."),
    details: normalizeAuditValue(rawEntry.details || {}),
    createdAt: rawEntry.createdAt || nowIso,
  };
}

function normalizeAuditEmail(value) {
  const rawValue = `${value || ""}`.trim();
  if (!rawValue) {
    return "";
  }
  return isAdminEmail(rawValue) ? DEFAULT_ADMIN_EMAIL : normalizeManagedEmail(rawValue);
}

function rehydrateUsersFromAudit(store, rawUsers) {
  const rawUsersByEmail = new Map(
    (Array.isArray(rawUsers) ? rawUsers : []).map((rawUser) => [
      normalizeAuditEmail(rawUser.email),
      rawUser,
    ])
  );
  const loginCountsByEmail = new Map();
  const lastLoginAtByEmail = new Map();
  const lastDeviceIdByEmail = new Map();

  for (const entry of store.audit) {
    if (entry.type !== "login") {
      continue;
    }

    const email = normalizeAuditEmail(entry.details?.email);
    if (!email) {
      continue;
    }

    loginCountsByEmail.set(email, (loginCountsByEmail.get(email) || 0) + 1);

    if (!lastLoginAtByEmail.has(email)) {
      lastLoginAtByEmail.set(email, entry.createdAt || null);
    }

    const deviceId = `${entry.details?.deviceId || ""}`.trim();
    if (deviceId && !lastDeviceIdByEmail.has(email)) {
      lastDeviceIdByEmail.set(email, deviceId);
    }
  }

  for (const user of store.users) {
    const rawUser = rawUsersByEmail.get(user.email);
    const hasNativeLoginCount = rawUser && Number.isInteger(rawUser.loginCount) && rawUser.loginCount > 0;

    if (!hasNativeLoginCount && loginCountsByEmail.has(user.email)) {
      user.loginCount = Math.max(user.loginCount || 0, loginCountsByEmail.get(user.email));
    }

    if (!user.lastLoginAt && lastLoginAtByEmail.has(user.email)) {
      user.lastLoginAt = lastLoginAtByEmail.get(user.email);
    }

    if (!user.lastSeenAt && lastLoginAtByEmail.has(user.email)) {
      user.lastSeenAt = lastLoginAtByEmail.get(user.email);
    }

    if (user.role === "teacher" && !user.boundDeviceId && lastDeviceIdByEmail.has(user.email)) {
      user.boundDeviceId = lastDeviceIdByEmail.get(user.email);
    }
  }
}

function rehydrateCustomerDeviceIdsFromAudit(store) {
  const customersById = new Map(store.customers.map((customer) => [customer.id, customer]));

  for (const entry of store.audit) {
    const customerId = entry.details?.customerId;
    const deviceId = `${entry.details?.deviceId || ""}`.trim();
    if (!customerId || !deviceId) {
      continue;
    }

    const customer = customersById.get(customerId);
    if (!customer) {
      continue;
    }

    customer.deviceIds = uniqueStrings([...(customer.deviceIds || []), deviceId]);
  }
}

function normalizeCustomer(rawCustomer, nowIso) {
  return {
    id: rawCustomer.id || createId("customer"),
    name: `${rawCustomer.name || "Cliente"}`.trim() || "Cliente",
    email: normalizeManagedEmail(rawCustomer.email, rawCustomer.name || "cliente"),
    planName: `${rawCustomer.planName || "Plano Mensal"}`.trim() || "Plano Mensal",
    pricePerDevice: Number.isFinite(rawCustomer.pricePerDevice)
      ? Number(rawCustomer.pricePerDevice)
      : Number.isFinite(rawCustomer.priceAmount)
        ? Number(rawCustomer.priceAmount)
        : null,
    deviceCount: Number.isInteger(rawCustomer.deviceCount) && rawCustomer.deviceCount > 0
      ? rawCustomer.deviceCount
      : Number.isInteger(rawCustomer.maxDevices) && rawCustomer.maxDevices > 0
        ? rawCustomer.maxDevices
        : 1,
    expiresAt: rawCustomer.expiresAt || nowIso,
    blocked: Boolean(rawCustomer.blocked),
    blockedReason: `${rawCustomer.blockedReason || ""}`.trim(),
    notes: `${rawCustomer.notes || ""}`.trim(),
    deviceIds: uniqueStrings(rawCustomer.deviceIds),
    financialEntries: Array.isArray(rawCustomer.financialEntries)
      ? rawCustomer.financialEntries
        .map((entry) => normalizeFinancialEntry(entry, nowIso))
        .sort((left, right) => `${right.month}`.localeCompare(`${left.month}`))
      : [],
    createdAt: rawCustomer.createdAt || nowIso,
    updatedAt: rawCustomer.updatedAt || nowIso,
  };
}

function normalizeFinancialMonths(values, fallbackMonth) {
  const safeFallback = /^\d{4}-\d{2}$/.test(`${fallbackMonth || ""}`.trim()) ? `${fallbackMonth}`.trim() : nowMonth();
  const normalizedMonths = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => `${value || ""}`.trim())
        .filter((value) => /^\d{4}-\d{2}$/.test(value))
    )
  ).sort((left, right) => left.localeCompare(right));

  return normalizedMonths.length ? normalizedMonths : [safeFallback];
}

function nowMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeFinancialEntry(rawEntry, nowIso) {
  const month = `${rawEntry?.month || ""}`.trim();
  const expectedAmount = Number.isFinite(rawEntry?.expectedAmount)
    ? Number(rawEntry.expectedAmount)
    : Number.isFinite(rawEntry?.valueExpected)
      ? Number(rawEntry.valueExpected)
      : 0;
  const receivedAmount = Number.isFinite(rawEntry?.receivedAmount)
    ? Number(rawEntry.receivedAmount)
    : Number.isFinite(rawEntry?.valueReceived)
      ? Number(rawEntry.valueReceived)
      : 0;
  const normalizedMonth = /^\d{4}-\d{2}$/.test(month) ? month : nowIso.slice(0, 7);
  const monthlyFee = Number.isFinite(rawEntry?.monthlyFee) ? Number(rawEntry.monthlyFee) : null;
  const payingCount = Number.isInteger(rawEntry?.payingCount)
    ? rawEntry.payingCount
    : Number.isFinite(rawEntry?.payingCount)
      ? Math.max(0, Math.round(Number(rawEntry.payingCount)))
      : null;
  const totalCount = Number.isInteger(rawEntry?.totalCount)
    ? rawEntry.totalCount
    : Number.isFinite(rawEntry?.totalCount)
      ? Math.max(0, Math.round(Number(rawEntry.totalCount)))
      : null;
  const repasseDivisor = Number.isInteger(rawEntry?.repasseDivisor)
    ? rawEntry.repasseDivisor
    : Number.isFinite(rawEntry?.repasseDivisor)
      ? Math.max(0, Math.round(Number(rawEntry.repasseDivisor)))
      : null;
  const groupMonths = normalizeFinancialMonths(rawEntry?.groupMonths, normalizedMonth);
  const monthsCount = Number.isInteger(rawEntry?.monthsCount) && rawEntry.monthsCount > 0
    ? rawEntry.monthsCount
    : groupMonths.length;

  return {
    id: rawEntry?.id || createId("finance"),
    groupId: `${rawEntry?.groupId || ""}`.trim(),
    month: normalizedMonth,
    groupMonths,
    monthsCount,
    reportCustomerName: `${rawEntry?.reportCustomerName || ""}`.trim(),
    monthlyFee: monthlyFee === null ? null : Number(monthlyFee.toFixed(2)),
    payingCount,
    totalCount,
    repasseDivisor,
    expectedAmount: Number(expectedAmount.toFixed(2)),
    receivedAmount: Number(receivedAmount.toFixed(2)),
    notes: `${rawEntry?.notes || ""}`.trim(),
    createdAt: rawEntry?.createdAt || nowIso,
    updatedAt: rawEntry?.updatedAt || nowIso,
  };
}

function normalizeUser(rawUser, nowIso) {
  const role = sanitizeRole(rawUser.role);
  const email = role === "admin"
    ? DEFAULT_ADMIN_EMAIL
    : normalizeManagedEmail(rawUser.email, rawUser.displayName || rawUser.name || "usuario");
  const storedPlaintext = `${rawUser.passwordPlaintext || ""}`.trim();
  const passwordPlaintext = storedPlaintext || defaultPasswordForEmail(email, role);
  const hasPasswordHash = Boolean(rawUser.passwordHash && rawUser.passwordSalt);
  const shouldRepairManagedPassword = role !== "admin" && !storedPlaintext;
  const credentials = shouldRepairManagedPassword
    ? hashPassword(passwordPlaintext || "123456")
    : hasPasswordHash
      ? {
        passwordHash: rawUser.passwordHash,
        passwordSalt: rawUser.passwordSalt,
      }
      : hashPassword(passwordPlaintext || "123456");

  return {
    id: rawUser.id || createId("user"),
    role,
    displayName: `${rawUser.displayName || rawUser.name || rawUser.email || "Usuario"}`.trim() || "Usuario",
    email,
    status: rawUser.status === "inactive" ? "inactive" : "active",
    customerId: rawUser.customerId || null,
    passwordPlaintext,
    passwordHash: credentials.passwordHash,
    passwordSalt: credentials.passwordSalt,
    loginCount: Number.isInteger(rawUser.loginCount) && rawUser.loginCount >= 0 ? rawUser.loginCount : 0,
    lastLoginAt: rawUser.lastLoginAt || null,
    lastSeenAt: rawUser.lastSeenAt || null,
    boundDeviceId: role === "teacher" ? `${rawUser.boundDeviceId || rawUser.deviceId || ""}`.trim() : "",
    boundDeviceLabel: role === "teacher" ? `${rawUser.boundDeviceLabel || rawUser.deviceLabel || ""}`.trim() : "",
    studentCount: Number.isInteger(rawUser.studentCount) && rawUser.studentCount >= 0 ? rawUser.studentCount : 0,
    classCount: Number.isInteger(rawUser.classCount) && rawUser.classCount >= 0 ? rawUser.classCount : 0,
    lastSyncAt: rawUser.lastSyncAt || null,
    createdAt: rawUser.createdAt || nowIso,
    updatedAt: rawUser.updatedAt || nowIso,
  };
}

function normalizeLibraryFile(rawFile, nowIso) {
  return {
    id: rawFile.id || createId("file"),
    customerId: `${rawFile.customerId || ""}`.trim(),
    uploadedByUserId: `${rawFile.uploadedByUserId || ""}`.trim(),
    uploadedByName: `${rawFile.uploadedByName || ""}`.trim() || "Usuario",
    uploadedByEmail: `${rawFile.uploadedByEmail || ""}`.trim(),
    category: ["app", "document", "log"].includes(rawFile.category) ? rawFile.category : "document",
    title: `${rawFile.title || rawFile.originalName || "Arquivo"}`.trim() || "Arquivo",
    description: `${rawFile.description || ""}`.trim(),
    originalName: `${rawFile.originalName || rawFile.filename || "arquivo"}`.trim() || "arquivo",
    storedName: `${rawFile.storedName || rawFile.filename || ""}`.trim(),
    storedUrl: `${rawFile.storedUrl || ""}`.trim(),
    mimeType: `${rawFile.mimeType || "application/octet-stream"}`.trim(),
    size: Number.isInteger(rawFile.size) && rawFile.size >= 0 ? rawFile.size : 0,
    createdAt: rawFile.createdAt || nowIso,
  };
}

function rebuildCustomerDeviceIds(store) {
  for (const customer of store.customers) {
    customer.deviceIds = uniqueStrings(
      (customer.deviceIds || []).concat(
        store.users
          .filter((user) => user.customerId === customer.id && user.boundDeviceId)
          .map((user) => user.boundDeviceId)
      )
    );
  }
}

function ensureAdminUser(store, nowIso, options = {}) {
  const shouldResetToDefault = Boolean(options.resetToDefaultCredentials);
  let adminUser = store.users.find((user) => user.role === "admin");
  if (!adminUser) {
    const credentials = hashPassword("admin123");
    adminUser = {
      id: createId("user"),
      role: "admin",
      displayName: "Administrador",
      email: DEFAULT_ADMIN_EMAIL,
      status: "active",
      customerId: null,
      passwordPlaintext: "admin123",
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
    };
    store.users.unshift(adminUser);
    return;
  }

  adminUser.role = "admin";
  adminUser.email = DEFAULT_ADMIN_EMAIL;
  adminUser.displayName = adminUser.displayName || "Administrador";
  adminUser.status = "active";
  adminUser.customerId = null;
  adminUser.updatedAt = nowIso;

  if (!adminUser.passwordPlaintext || shouldResetToDefault) {
    adminUser.passwordPlaintext = "admin123";
  }

  if (shouldResetToDefault) {
    const credentials = hashPassword("admin123");
    adminUser.passwordHash = credentials.passwordHash;
    adminUser.passwordSalt = credentials.passwordSalt;
    adminUser.updatedAt = nowIso;
  }
}

function ensureDemoCustomer(store, nowIso) {
  if (store.customers.length > 0) {
    return;
  }

  const customerId = createId("customer");
  const customer = {
    id: customerId,
    name: "Cliente Demo",
    email: DEFAULT_DEMO_EMAIL,
    planName: "Plano Mensal",
    pricePerDevice: 49.9,
    deviceCount: 1,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    blocked: false,
    blockedReason: "",
    notes: "Conta de demonstracao criada automaticamente.",
    deviceIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const credentials = hashPassword("demo123");
  const managerUser = {
    id: createId("user"),
    role: "customer_manager",
    displayName: "Cliente Demo",
    email: DEFAULT_DEMO_EMAIL,
    status: "active",
    customerId,
    passwordPlaintext: "demo123",
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
  };

  store.customers.push(customer);
  store.users.push(managerUser);
}

function normalizeStore(rawStore) {
  const nowIso = new Date().toISOString();
  const incomingStore = rawStore && typeof rawStore === "object" ? rawStore : {};
  const isLegacyStore = Number(incomingStore.version || 0) < STORE_VERSION;
  const normalizedStore = {
    version: STORE_VERSION,
    settings: {
      tokenSecret:
        incomingStore.settings?.tokenSecret || crypto.randomBytes(32).toString("hex"),
      offlineGraceHours: normalizeOfflineGraceHours(incomingStore.settings?.offlineGraceHours),
      serverName: "Controle AlfaTec",
    },
    customers: Array.isArray(incomingStore.customers)
      ? incomingStore.customers.map((customer) => normalizeCustomer(customer, nowIso))
      : [],
    users: Array.isArray(incomingStore.users)
      ? incomingStore.users.map((user) => normalizeUser(user, nowIso))
      : [],
    audit: Array.isArray(incomingStore.audit)
      ? incomingStore.audit.map((entry) => normalizeAuditEntry(entry, nowIso))
      : [],
    files: Array.isArray(incomingStore.files)
      ? incomingStore.files
        .map((file) => normalizeLibraryFile(file, nowIso))
        .filter((file) => file.customerId && file.storedName)
      : [],
  };

  ensureAdminUser(normalizedStore, nowIso, {
    resetToDefaultCredentials: isLegacyStore,
  });
  ensureDemoCustomer(normalizedStore, nowIso);
  rehydrateUsersFromAudit(normalizedStore, incomingStore.users);
  rehydrateCustomerDeviceIdsFromAudit(normalizedStore);
  rebuildCustomerDeviceIds(normalizedStore);
  return normalizedStore;
}

function buildInitialStore() {
  const store = normalizeStore({});
  appendAudit(
    store,
    "bootstrap",
    "Base inicial criada com admin AlfaTec e cliente de demonstracao.",
    {
      adminEmail: DEFAULT_ADMIN_EMAIL,
      customerEmail: DEFAULT_DEMO_EMAIL,
    }
  );
  return store;
}

function ensureStore() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(buildInitialStore(), null, 2), "utf8");
    return;
  }

  const currentStore = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const normalizedStore = normalizeStore(currentStore);
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizedStore, null, 2), "utf8");
}

function readStore() {
  ensureStore();
  return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
}

function writeStore(store) {
  ensureDataDir();
  const normalizedStore = normalizeStore(store);
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizedStore, null, 2), "utf8");
}

function mutateStore(mutator) {
  const store = readStore();
  const result = mutator(store);
  writeStore(store);
  return result;
}

module.exports = {
  DATA_FILE,
  DEFAULT_DEMO_EMAIL,
  DEFAULT_ADMIN_EMAIL,
  normalizeManagedEmail,
  appendAudit,
  buildInitialStore,
  createId,
  hashPassword,
  mutateStore,
  normalizeStore,
  readStore,
  rebuildCustomerDeviceIds,
  verifyPassword,
  writeStore,
};
