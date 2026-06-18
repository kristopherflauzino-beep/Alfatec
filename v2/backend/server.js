const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
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

function parseFinancialMonth(value) {
  const month = `${value || ""}`.trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Informe o mes no formato AAAA-MM.");
  }
  return month;
}

function parseFinancialAmount(value, label) {
  const rawValue = `${value ?? ""}`.trim().replace(",", ".");
  if (!rawValue) {
    return 0;
  }

  const amount = Number(rawValue);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Informe um valor valido em ${label}.`);
  }
  return Number(amount.toFixed(2));
}

function parseFinancialCount(value, label) {
  const rawValue = `${value ?? ""}`.trim();
  if (!rawValue) {
    return 0;
  }

  const count = Number(rawValue);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Informe um numero valido em ${label}.`);
  }
  return count;
}

function roundFinancialAmount(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function splitFinancialAmount(totalAmount, partsCount) {
  const safePartsCount = Math.max(partsCount || 1, 1);
  const totalCents = Math.round(roundFinancialAmount(totalAmount) * 100);
  const baseCents = Math.trunc(totalCents / safePartsCount);
  const remainder = totalCents - baseCents * safePartsCount;

  return Array.from({ length: safePartsCount }, (_unused, index) =>
    Number(((baseCents + (index < remainder ? 1 : 0)) / 100).toFixed(2))
  );
}

function splitFinancialCount(totalCount, partsCount) {
  const safePartsCount = Math.max(partsCount || 1, 1);
  const safeTotalCount = Math.max(parseFinancialCount(totalCount, "Pagantes"), 0);
  const baseCount = Math.trunc(safeTotalCount / safePartsCount);
  const remainder = safeTotalCount - baseCount * safePartsCount;

  return Array.from({ length: safePartsCount }, (_unused, index) => baseCount + (index < remainder ? 1 : 0));
}

function parseFinancialMonths(value, fallbackMonth = "") {
  const monthCandidates = Array.isArray(value)
    ? value
    : [value || fallbackMonth].filter(Boolean);
  const normalizedMonths = Array.from(new Set(monthCandidates.map((month) => parseFinancialMonth(month)))).sort(
    (left, right) => left.localeCompare(right)
  );

  if (!normalizedMonths.length) {
    throw new Error("Selecione ao menos um mes.");
  }

  return normalizedMonths;
}

function calculateMissingAmount(expectedAmount, receivedAmount) {
  return Number((expectedAmount - receivedAmount).toFixed(2));
}

function formatCurrencyValue(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMonthValue(month) {
  if (!month) {
    return "-";
  }
  const date = new Date(`${month}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return month;
  }
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatIsoDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("pt-BR");
}

function normalizeFinancialReportCustomerName(value, fallback = "") {
  return normalizeText(value, fallback);
}

function buildFinancialCalculationSummary(entry) {
  const summaryParts = [];

  if (typeof entry?.monthlyFee === "number" && Number.isFinite(entry.monthlyFee)) {
    summaryParts.push(`Mensalidade ${formatCurrencyValue(entry.monthlyFee)}`);
  }
  if (Number.isInteger(entry?.payingCount)) {
    summaryParts.push(`${entry.payingCount} pagante(s)`);
  }
  if (Number.isInteger(entry?.totalCount)) {
    summaryParts.push(`${entry.totalCount} no total`);
  }
  if (Number.isInteger(entry?.monthsCount) && entry.monthsCount > 1) {
    summaryParts.push(`rateado em ${entry.monthsCount} meses`);
  }

  return summaryParts.join(" | ");
}

function sanitizeFinancialEntry(entry) {
  const expectedAmount = Number.isFinite(entry?.expectedAmount) ? Number(entry.expectedAmount) : 0;
  const receivedAmount = Number.isFinite(entry?.receivedAmount) ? Number(entry.receivedAmount) : 0;
  const calculationSummary = buildFinancialCalculationSummary(entry);

  return {
    id: entry?.id || "",
    groupId: `${entry?.groupId || ""}`.trim(),
    month: entry?.month || "",
    monthLabel: formatMonthValue(entry?.month),
    groupMonths: Array.isArray(entry?.groupMonths) ? entry.groupMonths : [entry?.month || ""].filter(Boolean),
    monthsCount: Number.isInteger(entry?.monthsCount) && entry.monthsCount > 0 ? entry.monthsCount : 1,
    reportCustomerName: normalizeFinancialReportCustomerName(entry?.reportCustomerName),
    monthlyFee: typeof entry?.monthlyFee === "number" && Number.isFinite(entry.monthlyFee)
      ? Number(entry.monthlyFee.toFixed(2))
      : null,
    payingCount: Number.isInteger(entry?.payingCount) ? entry.payingCount : null,
    totalCount: Number.isInteger(entry?.totalCount) ? entry.totalCount : null,
    calculationSummary,
    expectedAmount: Number(expectedAmount.toFixed(2)),
    receivedAmount: Number(receivedAmount.toFixed(2)),
    missingAmount: calculateMissingAmount(expectedAmount, receivedAmount),
    notes: `${entry?.notes || ""}`.trim(),
    createdAt: entry?.createdAt || null,
    updatedAt: entry?.updatedAt || null,
  };
}

function sortFinancialEntries(entries) {
  return [...(entries || [])].sort((left, right) => `${right.month || ""}`.localeCompare(`${left.month || ""}`));
}

function buildFinancialSummary(entries) {
  const safeEntries = (entries || []).map(sanitizeFinancialEntry);
  const totals = safeEntries.reduce(
    (summary, entry) => {
      summary.expectedAmount += entry.expectedAmount;
      summary.receivedAmount += entry.receivedAmount;
      summary.missingAmount += entry.missingAmount;
      if (entry.missingAmount > 0) {
        summary.pendingMonths += 1;
      }
      return summary;
    },
    {
      totalEntries: safeEntries.length,
      expectedAmount: 0,
      receivedAmount: 0,
      missingAmount: 0,
      pendingMonths: 0,
    }
  );

  return {
    totalEntries: totals.totalEntries,
    expectedAmount: Number(totals.expectedAmount.toFixed(2)),
    receivedAmount: Number(totals.receivedAmount.toFixed(2)),
    missingAmount: Number(totals.missingAmount.toFixed(2)),
    pendingMonths: totals.pendingMonths,
  };
}

function findFinancialEntry(customer, entryId) {
  return (customer?.financialEntries || []).find((entry) => entry.id === entryId) || null;
}

function rebuildFinancialGroupMetadata(financialEntries, groupId) {
  const normalizedGroupId = `${groupId || ""}`.trim();
  if (!normalizedGroupId) {
    return;
  }

  const groupedEntries = (financialEntries || [])
    .filter((entry) => `${entry.groupId || ""}`.trim() === normalizedGroupId)
    .sort((left, right) => `${left.month || ""}`.localeCompare(`${right.month || ""}`));

  if (!groupedEntries.length) {
    return;
  }

  const groupMonths = groupedEntries.map((entry) => entry.month);
  const nextGroupId = groupedEntries.length > 1 ? normalizedGroupId : "";

  groupedEntries.forEach((entry) => {
    entry.groupId = nextGroupId;
    entry.groupMonths = groupMonths;
    entry.monthsCount = groupMonths.length;
  });
}

function resolveFinancialReportCustomerName(customer, overrideName = "") {
  const explicitName = normalizeFinancialReportCustomerName(overrideName);
  if (explicitName) {
    return explicitName;
  }

  const latestNamedEntry = sortFinancialEntries(customer?.financialEntries || []).find(
    (entry) => normalizeFinancialReportCustomerName(entry?.reportCustomerName)
  );
  if (latestNamedEntry) {
    return normalizeFinancialReportCustomerName(latestNamedEntry.reportCustomerName);
  }

  return normalizeFinancialReportCustomerName(customer?.name, "Cliente");
}

function parseFinancialPayingCountsByMonth(value, months) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return months.map((month) =>
      parseFinancialCount(value[month] ?? 0, `Pagantes de ${formatMonthValue(month)}`)
    );
  }

  const fallbackCount = parseFinancialCount(value ?? 0, "Total de pagantes");
  return splitFinancialCount(fallbackCount, months.length);
}

function buildFinancialEntriesFromBody(body, options = {}) {
  const {
    notes = normalizeText(body.notes),
    groupId = "",
    createIdFactory = () => createId("finance"),
    defaultReportCustomerName = "",
  } = options;
  const months = parseFinancialMonths(body.months, body.month);
  const usesBaseModel =
    Object.prototype.hasOwnProperty.call(body, "monthlyFee") ||
    Object.prototype.hasOwnProperty.call(body, "payingCount") ||
    Object.prototype.hasOwnProperty.call(body, "totalCount") ||
    Object.prototype.hasOwnProperty.call(body, "payingCountsByMonth");
  const reportCustomerName = normalizeFinancialReportCustomerName(body.reportCustomerName, defaultReportCustomerName);

  if (!reportCustomerName) {
    throw new Error("Digite o nome do cliente que deve aparecer no relatorio.");
  }

  let monthlyFee = null;
  let totalCount = null;
  let payingCounts = [];
  let expectedAmountTotal = 0;
  let receivedShares = [];

  if (usesBaseModel) {
    monthlyFee = parseFinancialAmount(body.monthlyFee, "Valor da mensalidade");
    totalCount = parseFinancialCount(body.totalCount, "Quantidade total");
    payingCounts = parseFinancialPayingCountsByMonth(body.payingCountsByMonth ?? body.payingCount, months);
    expectedAmountTotal = roundFinancialAmount(monthlyFee * totalCount);
    receivedShares = payingCounts.map((count) => roundFinancialAmount(monthlyFee * count));
  } else {
    expectedAmountTotal = parseFinancialAmount(body.expectedAmount, "Valor esperado");
    receivedShares = splitFinancialAmount(parseFinancialAmount(body.receivedAmount, "Valor recebido"), months.length);
  }

  const expectedShares = splitFinancialAmount(expectedAmountTotal, months.length);
  const normalizedGroupId = months.length > 1 ? `${groupId || createId("finance-group")}`.trim() : "";
  const safeNotes = normalizeText(notes);

  return months.map((month, index) => ({
    id: createIdFactory(index, month),
    groupId: normalizedGroupId,
    month,
    groupMonths: months,
    monthsCount: months.length,
    reportCustomerName,
    monthlyFee,
    payingCount: Number.isInteger(payingCounts[index]) ? payingCounts[index] : null,
    totalCount,
    expectedAmount: expectedShares[index],
    receivedAmount: receivedShares[index],
    notes: safeNotes,
  }));
}

function pdfColor(hexValue) {
  const normalized = `${hexValue}`.replace("#", "");
  const safeHex = normalized.length === 3
    ? normalized.split("").map((chunk) => `${chunk}${chunk}`).join("")
    : normalized;
  return rgb(
    Number.parseInt(safeHex.slice(0, 2), 16) / 255,
    Number.parseInt(safeHex.slice(2, 4), 16) / 255,
    Number.parseInt(safeHex.slice(4, 6), 16) / 255
  );
}

function wrapPdfText(text, font, size, maxWidth) {
  const normalized = `${text || ""}`.trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidateLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidateLine, size) <= maxWidth) {
      currentLine = candidateLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [normalized];
}

function drawPdfLines(page, lines, x, topY, options) {
  const { font, size, lineHeight, color } = options;
  lines.forEach((line, index) => {
    page.drawText(`${line || ""}`, {
      x,
      y: topY - size - index * lineHeight,
      size,
      font,
      color,
    });
  });
}

function drawPdfRect(page, x, y, width, height, color, borderColor) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    borderColor,
    borderWidth: 1,
  });
}

function loadFinancialLogoBuffer() {
  const candidatePaths = [
    path.join(ADMIN_DIR, "alfatec-logo.png"),
    path.join(__dirname, "..", "..", "assets", "report-logo.png"),
    path.join(__dirname, "..", "..", "assets", "alfatec-logo.png"),
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return fs.readFileSync(candidatePath);
    }
  }

  return null;
}

async function buildFinancialReportPdf(customer, options = {}) {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const colors = {
    ink: pdfColor("#173C64"),
    brand: pdfColor("#2C6FD3"),
    muted: pdfColor("#557390"),
    panel: pdfColor("#F3F9FF"),
    panelBorder: pdfColor("#DCEBFA"),
    card: pdfColor("#FFFFFF"),
    cardBorder: pdfColor("#D8E7F7"),
    success: pdfColor("#1F7047"),
    warning: pdfColor("#B45309"),
  };
  const pageConfig = {
    width: 595,
    height: 842,
    margin: 30,
  };
  const financialEntries = sortFinancialEntries(customer.financialEntries || []).map(sanitizeFinancialEntry);
  const summary = buildFinancialSummary(financialEntries);
  const reportCustomerName = resolveFinancialReportCustomerName(customer, options.reportCustomerName);
  const logoBuffer = loadFinancialLogoBuffer();
  const logoImage = logoBuffer ? await pdfDoc.embedPng(logoBuffer) : null;
  const logoRatio = logoImage ? logoImage.height / logoImage.width : 0;

  let page = pdfDoc.addPage([pageConfig.width, pageConfig.height]);
  let cursorY = pageConfig.height - pageConfig.margin;

  const drawHeader = (currentPage, isContinuation = false) => {
    const cardHeight = isContinuation ? 84 : 126;
    const x = pageConfig.margin;
    const y = cursorY - cardHeight;
    const width = pageConfig.width - pageConfig.margin * 2;
    drawPdfRect(currentPage, x, y, width, cardHeight, colors.panel, colors.panelBorder);

    drawPdfLines(currentPage, ["CONTROLE ALFATEC"], x + 16, cursorY - 14, {
      font: fonts.bold,
      size: 10,
      lineHeight: 12,
      color: colors.brand,
    });

    const title = isContinuation ? "Relatorio financeiro - continuacao" : "Relatorio financeiro";
    drawPdfLines(currentPage, [title], x + 16, cursorY - 32, {
      font: fonts.bold,
      size: 22,
      lineHeight: 24,
      color: colors.ink,
    });

    const subtitleLines = wrapPdfText(
      `Cliente: ${reportCustomerName} | Gerado em ${formatIsoDateTime(new Date().toISOString())}`,
      fonts.regular,
      10.5,
      320
    );
    drawPdfLines(currentPage, subtitleLines, x + 16, cursorY - 62, {
      font: fonts.regular,
      size: 10.5,
      lineHeight: 13,
      color: colors.muted,
    });

    if (logoImage && logoRatio) {
      const logoWidth = isContinuation ? 118 : 148;
      const logoHeight = logoWidth * logoRatio;
      currentPage.drawImage(logoImage, {
        x: x + width - 16 - logoWidth,
        y: y + cardHeight - 16 - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
    }

    return y - 18;
  };

  const drawSummary = (currentPage) => {
    const gap = 10;
    const totalWidth = pageConfig.width - pageConfig.margin * 2;
    const cardWidth = (totalWidth - gap * 3) / 4;
    const cardHeight = 70;
    const startX = pageConfig.margin;
    const y = cursorY - cardHeight;
    const cards = [
      ["Meses", `${summary.totalEntries}`],
      ["Esperado", formatCurrencyValue(summary.expectedAmount)],
      ["Recebido", formatCurrencyValue(summary.receivedAmount)],
      ["Faltante", formatCurrencyValue(summary.missingAmount)],
    ];

    cards.forEach(([label, value], index) => {
      const x = startX + index * (cardWidth + gap);
      drawPdfRect(currentPage, x, y, cardWidth, cardHeight, colors.card, colors.cardBorder);
      drawPdfLines(currentPage, [label], x + 10, y + cardHeight - 10, {
        font: fonts.bold,
        size: 9,
        lineHeight: 11,
        color: colors.brand,
      });
      drawPdfLines(currentPage, wrapPdfText(value, fonts.bold, 14, cardWidth - 20), x + 10, y + cardHeight - 31, {
        font: fonts.bold,
        size: 14,
        lineHeight: 16,
        color: label === "Faltante" && summary.missingAmount > 0 ? colors.warning : colors.ink,
      });
    });

    return y - 16;
  };

  const drawTableHeader = (currentPage) => {
    const x = pageConfig.margin;
    const y = cursorY - 28;
    const columns = [
      { label: "Mes", width: 86 },
      { label: "Pagantes", width: 62 },
      { label: "Esperado", width: 78 },
      { label: "Recebido", width: 78 },
      { label: "Faltante", width: 78 },
      { label: "Observacoes", width: 153 },
    ];
    let cursorX = x;

    columns.forEach((column) => {
      drawPdfRect(currentPage, cursorX, y, column.width, 28, colors.brand, colors.panelBorder);
      drawPdfLines(currentPage, [column.label], cursorX + 8, y + 20, {
        font: fonts.bold,
        size: 9,
        lineHeight: 11,
        color: pdfColor("#FFFFFF"),
      });
      cursorX += column.width;
    });

    return y;
  };

  cursorY = drawHeader(page, false);
  cursorY = drawSummary(page);
  cursorY = drawTableHeader(page) - 8;

  if (!financialEntries.length) {
    const emptyLines = wrapPdfText(
      "Nenhum lancamento financeiro foi cadastrado para este cliente ainda.",
      fonts.regular,
      11,
      pageConfig.width - pageConfig.margin * 2 - 24
    );
    drawPdfRect(
      page,
      pageConfig.margin,
      cursorY - 74,
      pageConfig.width - pageConfig.margin * 2,
      74,
      colors.card,
      colors.cardBorder
    );
    drawPdfLines(page, emptyLines, pageConfig.margin + 12, cursorY - 16, {
      font: fonts.regular,
      size: 11,
      lineHeight: 14,
      color: colors.muted,
    });
  } else {
    for (const entry of financialEntries) {
      const noteText = [entry.reportCustomerName, entry.calculationSummary, entry.notes].filter(Boolean).join(" | ") || "-";
      const notesLines = wrapPdfText(noteText, fonts.regular, 8.5, 137);
      const rowHeight = Math.max(28, notesLines.length * 11 + 12);
      if (cursorY - rowHeight < pageConfig.margin + 24) {
        page = pdfDoc.addPage([pageConfig.width, pageConfig.height]);
        cursorY = pageConfig.height - pageConfig.margin;
        cursorY = drawHeader(page, true);
        cursorY = drawTableHeader(page) - 8;
      }

      const rowY = cursorY - rowHeight;
      const columns = [
        { width: 86, text: entry.monthLabel, color: colors.ink, font: fonts.bold, size: 9 },
        { width: 62, text: `${entry.payingCount ?? 0}`, color: colors.ink, font: fonts.bold, size: 9 },
        { width: 78, text: formatCurrencyValue(entry.expectedAmount), color: colors.ink, font: fonts.regular, size: 9 },
        { width: 78, text: formatCurrencyValue(entry.receivedAmount), color: colors.ink, font: fonts.regular, size: 9 },
        {
          width: 78,
          text: formatCurrencyValue(entry.missingAmount),
          color: entry.missingAmount > 0 ? colors.warning : colors.success,
          font: fonts.bold,
          size: 9,
        },
        { width: 153, text: noteText, color: colors.muted, font: fonts.regular, size: 8.5, lines: notesLines },
      ];

      let currentX = pageConfig.margin;
      columns.forEach((column) => {
        drawPdfRect(page, currentX, rowY, column.width, rowHeight, colors.card, colors.cardBorder);
        const textLines = column.lines || wrapPdfText(column.text, column.font, column.size, column.width - 12);
        drawPdfLines(page, textLines, currentX + 6, rowY + rowHeight - 7, {
          font: column.font,
          size: column.size,
          lineHeight: 11,
          color: column.color,
        });
        currentX += column.width;
      });

      cursorY = rowY - 6;
    }
  }

  return Buffer.from(await pdfDoc.save());
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
  const financialEntries = sortFinancialEntries(customer.financialEntries || []).map(sanitizeFinancialEntry);

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
    financialEntries,
    financialSummary: buildFinancialSummary(financialEntries),
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

async function handleCreateFinancialEntry(request, response, customerId) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  if (!canManageCustomer(session, customerId)) {
    sendJson(response, 403, { error: "Voce nao pode alterar o financeiro deste cliente." });
    return;
  }

  const customer = findCustomerById(session.store, customerId);
  if (!customer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  const body = await readJsonBody(request);
  let entryDrafts;

  try {
    entryDrafts = buildFinancialEntriesFromBody(body);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Nao foi possivel validar o lancamento." });
    return;
  }

  const createdEntries = await mutateStore((mutableStore) => {
    const mutableCustomer = findCustomerById(mutableStore, customerId);
    if (!mutableCustomer) {
      throw new Error("Cliente nao encontrado.");
    }

    const nowIso = new Date().toISOString();
    const nextEntries = entryDrafts.map((entry) => ({
      ...entry,
      id: createId("finance"),
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    mutableCustomer.financialEntries = sortFinancialEntries([
      ...(mutableCustomer.financialEntries || []),
      ...nextEntries,
    ]);
    mutableCustomer.updatedAt = nowIso;
    appendAudit(
      mutableStore,
      "financial-create",
      `Lancamento financeiro de ${nextEntries.length} mes(es) salvo para ${mutableCustomer.name}.`,
      {
        customerId,
        financialEntryId: nextEntries[0]?.id || "",
        months: nextEntries.map((entry) => entry.month),
        by: session.user.email,
      }
    );
    return nextEntries;
  });

  sendJson(response, 201, {
    created: createdEntries.map(sanitizeFinancialEntry),
    createdCount: createdEntries.length,
  });
}

async function handleUpdateFinancialEntry(request, response, customerId, entryId) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  if (!canManageCustomer(session, customerId)) {
    sendJson(response, 403, { error: "Voce nao pode alterar o financeiro deste cliente." });
    return;
  }

  const customer = findCustomerById(session.store, customerId);
  if (!customer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  if (!findFinancialEntry(customer, entryId)) {
    sendJson(response, 404, { error: "Lancamento financeiro nao encontrado." });
    return;
  }

  const body = await readJsonBody(request);
  let updatedEntries;

  try {
    updatedEntries = await mutateStore((mutableStore) => {
      const mutableCustomer = findCustomerById(mutableStore, customerId);
      if (!mutableCustomer) {
        throw new Error("Cliente nao encontrado.");
      }

      const targetEntry = findFinancialEntry(mutableCustomer, entryId);
      if (!targetEntry) {
        throw new Error("Lancamento financeiro nao encontrado.");
      }

      const shouldUpdateGroup =
        Boolean(targetEntry.groupId) &&
        `${body.groupId || ""}`.trim() &&
        `${body.groupId || ""}`.trim() === `${targetEntry.groupId || ""}`.trim();
      const currentGroupId = `${targetEntry.groupId || ""}`.trim();
      const nowIso = new Date().toISOString();
      const entryDrafts = buildFinancialEntriesFromBody(body, {
        groupId: shouldUpdateGroup ? currentGroupId : "",
      });

      let nextEntries;

      if (shouldUpdateGroup) {
        const preservedEntries = (mutableCustomer.financialEntries || []).filter(
          (entry) => `${entry.groupId || ""}`.trim() !== currentGroupId
        );
        nextEntries = entryDrafts.map((entry, index) => ({
          ...entry,
          id: index === 0 ? targetEntry.id : createId("finance"),
          createdAt: index === 0 ? targetEntry.createdAt : nowIso,
          updatedAt: nowIso,
        }));
        mutableCustomer.financialEntries = sortFinancialEntries(preservedEntries.concat(nextEntries));
      } else {
        const [singleEntry] = entryDrafts;
        targetEntry.groupId = singleEntry.groupId || "";
        targetEntry.groupMonths = singleEntry.groupMonths;
        targetEntry.monthsCount = singleEntry.monthsCount;
        targetEntry.month = singleEntry.month;
        targetEntry.monthlyFee = singleEntry.monthlyFee;
        targetEntry.payingCount = singleEntry.payingCount;
        targetEntry.totalCount = singleEntry.totalCount;
        targetEntry.expectedAmount = singleEntry.expectedAmount;
        targetEntry.receivedAmount = singleEntry.receivedAmount;
        targetEntry.notes = singleEntry.notes;
        targetEntry.updatedAt = nowIso;
        mutableCustomer.financialEntries = sortFinancialEntries(mutableCustomer.financialEntries || []);
        rebuildFinancialGroupMetadata(mutableCustomer.financialEntries, currentGroupId);
        nextEntries = [targetEntry];
      }

      mutableCustomer.financialEntries = sortFinancialEntries(mutableCustomer.financialEntries || []);
      mutableCustomer.updatedAt = nowIso;
      appendAudit(
        mutableStore,
        "financial-update",
        `Lancamento financeiro atualizado para ${mutableCustomer.name}.`,
        {
          customerId,
          financialEntryId: targetEntry.id,
          months: nextEntries.map((entry) => entry.month),
          by: session.user.email,
        }
      );
      return nextEntries;
    });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Nao foi possivel validar o lancamento." });
    return;
  }

  sendJson(response, 200, {
    updated: updatedEntries.map(sanitizeFinancialEntry),
    updatedCount: updatedEntries.length,
  });
}

async function handleDeleteFinancialEntry(request, response, customerId, entryId) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  if (!canManageCustomer(session, customerId)) {
    sendJson(response, 403, { error: "Voce nao pode alterar o financeiro deste cliente." });
    return;
  }

  const removedEntry = await mutateStore((mutableStore) => {
    const mutableCustomer = findCustomerById(mutableStore, customerId);
    if (!mutableCustomer) {
      return null;
    }

    const entryIndex = (mutableCustomer.financialEntries || []).findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) {
      return null;
    }

    const [entry] = mutableCustomer.financialEntries.splice(entryIndex, 1);
    rebuildFinancialGroupMetadata(mutableCustomer.financialEntries, entry.groupId);
    mutableCustomer.updatedAt = new Date().toISOString();
    appendAudit(
      mutableStore,
      "financial-delete",
      `Lancamento financeiro ${entry.month} removido de ${mutableCustomer.name}.`,
      {
        customerId,
        financialEntryId: entry.id,
        month: entry.month,
        by: session.user.email,
      }
    );
    return entry;
  });

  if (!removedEntry) {
    sendJson(response, 404, { error: "Lancamento financeiro nao encontrado." });
    return;
  }

  sendJson(response, 200, { ok: true });
}

async function handleDownloadFinancialReport(request, response, customerId) {
  const session = await requirePortalUser(request, response);
  if (!session) {
    return;
  }

  if (!canManageCustomer(session, customerId)) {
    sendJson(response, 403, { error: "Voce nao pode gerar o relatorio deste cliente." });
    return;
  }

  const customer = findCustomerById(session.store, customerId);
  if (!customer) {
    sendJson(response, 404, { error: "Cliente nao encontrado." });
    return;
  }

  const requestUrl = new URL(request.url, getPublicServerUrl(request));
  const reportCustomerName = normalizeFinancialReportCustomerName(requestUrl.searchParams.get("reportCustomerName"));
  const resolvedReportCustomerName = resolveFinancialReportCustomerName(customer, reportCustomerName);
  const pdfBuffer = await buildFinancialReportPdf(customer, {
    reportCustomerName: resolvedReportCustomerName,
  });
  sendDownloadBuffer(
    response,
    {
      mimeType: "application/pdf",
      originalName: `relatorio-financeiro-${sanitizeFilename(resolvedReportCustomerName)}.pdf`,
    },
    pdfBuffer
  );
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

  const createFinancialEntryMatch = pathname.match(/^\/api\/portal\/customers\/([^/]+)\/financial$/);
  if (request.method === "POST" && createFinancialEntryMatch) {
    await handleCreateFinancialEntry(request, response, createFinancialEntryMatch[1]);
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

  const updateFinancialEntryMatch = pathname.match(/^\/api\/portal\/customers\/([^/]+)\/financial\/([^/]+)$/);
  if (request.method === "PATCH" && updateFinancialEntryMatch) {
    await handleUpdateFinancialEntry(request, response, updateFinancialEntryMatch[1], updateFinancialEntryMatch[2]);
    return;
  }

  if (request.method === "DELETE" && updateFinancialEntryMatch) {
    await handleDeleteFinancialEntry(request, response, updateFinancialEntryMatch[1], updateFinancialEntryMatch[2]);
    return;
  }

  const financialReportMatch = pathname.match(/^\/api\/portal\/customers\/([^/]+)\/financial-report$/);
  if (request.method === "GET" && financialReportMatch) {
    await handleDownloadFinancialReport(request, response, financialReportMatch[1]);
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
