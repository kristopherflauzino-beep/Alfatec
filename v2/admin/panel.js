const state = {
  token: "",
  overview: null,
  currentUser: null,
  selectedCustomerId: "",
  searchQuery: "",
  statusFilter: "all",
  portalView: "overview",
  editingFinancialEntryId: "",
  editingFinancialGroupId: "",
  financialSelectedMonths: [],
  financialPayingCountsByMonth: {},
  financialContextCustomerId: "",
};

const FALLBACK_WEB_API_BASE_URL = "https://alfatec01.vercel.app";
const API_BASE_URL = window.location.protocol === "file:" ? FALLBACK_WEB_API_BASE_URL : "";

const elements = {
  entryPanel: document.getElementById("entry-panel"),
  portal: document.getElementById("portal"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  toggleLoginPassword: document.getElementById("toggle-login-password"),
  serverName: document.getElementById("server-name"),
  healthStatus: document.getElementById("health-status"),
  sessionStatus: document.getElementById("session-status"),
  headerRefreshButton: document.getElementById("header-refresh-button"),
  logoutButton: document.getElementById("logout-button"),
  customerSearch: document.getElementById("customer-search"),
  statusFilter: document.getElementById("status-filter"),
  dataFile: document.getElementById("data-file"),
  systemDataFile: document.getElementById("system-data-file"),
  metricTotal: document.getElementById("metric-total"),
  metricActive: document.getElementById("metric-active"),
  metricBlocked: document.getElementById("metric-blocked"),
  metricDevices: document.getElementById("metric-devices"),
  metricRevenue: document.getElementById("metric-revenue"),
  metricStudents: document.getElementById("metric-due-soon"),
  portalMenuBar: document.getElementById("portal-menu-bar"),
  resultsCount: document.getElementById("results-count"),
  customersList: document.getElementById("customers-list"),
  detailTitle: document.getElementById("detail-title"),
  detailEmpty: document.getElementById("detail-empty"),
  overviewContent: document.getElementById("overview-content"),
  overviewManagerEmail: document.getElementById("overview-manager-email"),
  overviewNotes: document.getElementById("overview-notes"),
  overviewBlockedReason: document.getElementById("overview-blocked-reason"),
  subscriptionTitle: document.getElementById("subscription-title"),
  subscriptionEmpty: document.getElementById("subscription-empty"),
  detailForm: document.getElementById("detail-form"),
  detailName: document.getElementById("detail-name"),
  detailEmail: document.getElementById("detail-email"),
  detailPlan: document.getElementById("detail-plan"),
  detailPrice: document.getElementById("detail-price"),
  detailDeviceCount: document.getElementById("detail-device-count"),
  detailExpiry: document.getElementById("detail-expiry"),
  detailPassword: document.getElementById("detail-password"),
  detailNotes: document.getElementById("detail-notes"),
  detailBlocked: document.getElementById("detail-blocked"),
  detailBlockedReason: document.getElementById("detail-blocked-reason"),
  detailStatus: document.getElementById("detail-status"),
  detailContractedDevices: document.getElementById("detail-contracted-devices"),
  detailDeviceUsage: document.getElementById("detail-device-usage"),
  detailPricePerDevice: document.getElementById("detail-price-per-device"),
  detailCurrentValue: document.getElementById("detail-current-value"),
  subscriptionStatusPreview: document.getElementById("subscription-status-preview"),
  subscriptionExpiryPreview: document.getElementById("subscription-expiry-preview"),
  subscriptionPlanPreview: document.getElementById("subscription-plan-preview"),
  detailDevicesList: document.getElementById("detail-devices-list"),
  saveCustomerButton: document.getElementById("save-customer-button"),
  copySelectedEmailButton: document.getElementById("copy-selected-email-button"),
  extendCustomerButton: document.getElementById("extend-customer-button"),
  cancelSubscriptionButton: document.getElementById("cancel-subscription-button"),
  reactivateSubscriptionButton: document.getElementById("reactivate-subscription-button"),
  resetPasswordButton: document.getElementById("reset-password-button"),
  clearDevicesButton: document.getElementById("clear-devices-button"),
  deleteCustomerButton: document.getElementById("delete-customer-button"),
  managerSwitchPanel: document.getElementById("manager-switch-panel"),
  managerUserSelect: document.getElementById("manager-user-select"),
  setManagerButton: document.getElementById("set-manager-button"),
  managerUsersList: document.getElementById("manager-users-list"),
  teacherUsersList: document.getElementById("teacher-users-list"),
  teacherUserForm: document.getElementById("teacher-user-form"),
  teacherName: document.getElementById("teacher-name"),
  teacherEmail: document.getElementById("teacher-email"),
  teacherPassword: document.getElementById("teacher-password"),
  teacherLimitNote: document.getElementById("teacher-limit-note"),
  financeTitle: document.getElementById("finance-title"),
  financeSelectedCustomerHint: document.getElementById("finance-selected-customer-hint"),
  financeEmpty: document.getElementById("finance-empty"),
  financeContent: document.getElementById("finance-content"),
  financialForm: document.getElementById("financial-form"),
  financialEntryId: document.getElementById("financial-entry-id"),
  financialGroupId: document.getElementById("financial-group-id"),
  financialReportCustomerName: document.getElementById("financial-report-customer-name"),
  financialUseSelectedCustomerButton: document.getElementById("financial-use-selected-customer-button"),
  financialMonthInput: document.getElementById("financial-month-input"),
  addFinancialMonthButton: document.getElementById("add-financial-month-button"),
  financialMonthList: document.getElementById("financial-month-list"),
  financialMonthHint: document.getElementById("financial-month-hint"),
  financialDistributionHint: document.getElementById("financial-distribution-hint"),
  financialMonthPayersList: document.getElementById("financial-month-payers-list"),
  financialPayingSummary: document.getElementById("financial-paying-summary"),
  financialMonthlyFee: document.getElementById("financial-monthly-fee"),
  financialTotalCount: document.getElementById("financial-total-count"),
  financialTotalPayingCount: document.getElementById("financial-total-paying-count"),
  financialExpected: document.getElementById("financial-expected"),
  financialReceived: document.getElementById("financial-received"),
  financialMissing: document.getElementById("financial-missing"),
  financialNotes: document.getElementById("financial-notes"),
  saveFinancialButton: document.getElementById("save-financial-button"),
  clearFinancialFormButton: document.getElementById("clear-financial-form-button"),
  downloadFinancialReportButton: document.getElementById("download-financial-report-button"),
  financialSummaryGrid: document.getElementById("financial-summary-grid"),
  financialSummaryCount: document.getElementById("financial-summary-count"),
  financialSummaryExpected: document.getElementById("financial-summary-expected"),
  financialSummaryReceived: document.getElementById("financial-summary-received"),
  financialSummaryMissing: document.getElementById("financial-summary-missing"),
  financialList: document.getElementById("financial-list"),
  customerForm: document.getElementById("customer-form"),
  customerName: document.getElementById("customer-name"),
  customerEmail: document.getElementById("customer-email"),
  customerPassword: document.getElementById("customer-password"),
  customerPlan: document.getElementById("customer-plan"),
  customerPrice: document.getElementById("customer-price"),
  customerDeviceCount: document.getElementById("customer-device-count"),
  customerExpiry: document.getElementById("customer-expiry"),
  customerNotes: document.getElementById("customer-notes"),
  adminEmailDisplay: document.getElementById("admin-email-display"),
  viewerRoleDisplay: document.getElementById("viewer-role-display"),
  adminSettingsForm: document.getElementById("admin-settings-form"),
  adminCurrentPassword: document.getElementById("admin-current-password"),
  adminNewPassword: document.getElementById("admin-new-password"),
  adminConfirmPassword: document.getElementById("admin-confirm-password"),
  auditList: document.getElementById("audit-list"),
  toast: document.getElementById("toast"),
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 3200);
}

function escapeHtml(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function normalizeAlfaTecEmailValue(value) {
  const rawValue = `${value || ""}`.trim().toLowerCase();
  if (!rawValue) {
    return "";
  }

  const normalizedBase = rawValue.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const localPartSource = normalizedBase.includes("@") ? normalizedBase.split("@")[0] : normalizedBase;
  const localPart = localPartSource
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");

  if (!localPart) {
    return "";
  }

  if (localPart === "admin") {
    return "admin@alfatec.com";
  }

  return `${localPart}@alfatec.com`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Falha ao comunicar com o servidor.");
  }

  return payload;
}

async function apiForm(path, formData) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Falha ao enviar arquivo.");
  }

  return payload;
}

async function downloadFromApi(path, fallbackFilename) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Nao foi possivel gerar o relatorio.");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
  const filename = decodeURIComponent(filenameMatch?.[1] || fallbackFilename || "download.bin");
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function loadHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("pt-BR");
}

function formatDateOnly(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function formatMonth(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(`${value}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Nao informado";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileCategory(value) {
  if (value === "app") {
    return "Aplicativo";
  }
  if (value === "log") {
    return "Log";
  }
  return "Documento";
}

function nextMonthDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function nextMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function parseMoneyValue(value) {
  const normalizedValue = `${value ?? ""}`.trim().replace(",", ".");
  if (!normalizedValue) {
    return 0;
  }
  const amount = Number(normalizedValue);
  return Number.isFinite(amount) ? amount : 0;
}

function parseCountValue(value) {
  const normalizedValue = `${value ?? ""}`.trim();
  if (!normalizedValue) {
    return 0;
  }
  const count = Number(normalizedValue);
  if (!Number.isInteger(count) || count < 0) {
    return 0;
  }
  return count;
}

function calculateFinancialMissingAmount(expectedAmount, receivedAmount) {
  return Number((expectedAmount - receivedAmount).toFixed(2));
}

function roundCurrency(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function splitAmountAcrossMonths(amount, monthsCount) {
  const safeMonthsCount = Math.max(monthsCount || 1, 1);
  const totalCents = Math.round(roundCurrency(amount) * 100);
  const baseCents = Math.trunc(totalCents / safeMonthsCount);
  const remainder = totalCents - baseCents * safeMonthsCount;

  return Array.from({ length: safeMonthsCount }, (_unused, index) =>
    Number(((baseCents + (index < remainder ? 1 : 0)) / 100).toFixed(2))
  );
}

function normalizeMonthValue(value) {
  const normalizedValue = `${value || ""}`.trim();
  return /^\d{4}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function sortMonthValues(values) {
  return [...(values || [])].sort((left, right) => `${left}`.localeCompare(`${right}`));
}

function sanitizeFinancialCustomerName(value) {
  return `${value || ""}`.trim();
}

function getSelectedCustomerName() {
  return getSelectedCustomer()?.customerName || "";
}

function cloneMonthCountMap(source = {}) {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([month]) => normalizeMonthValue(month))
      .map(([month, value]) => [month, parseCountValue(value)])
  );
}

function togglePasswordVisibility(input, button) {
  if (!input || !button) {
    return;
  }

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.textContent = shouldShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-pressed", shouldShow ? "true" : "false");
  button.setAttribute("aria-label", shouldShow ? "Ocultar senha" : "Mostrar senha");
}

function toEndOfDayIso(dateInputValue) {
  const value = `${dateInputValue || ""}`.trim();
  if (!value) {
    throw new Error("Informe uma data valida.");
  }

  const date = new Date(`${value}T23:59:59`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("A data informada nao e valida.");
  }

  return date.toISOString();
}

function getViewer() {
  return state.overview?.viewer || null;
}

function isAdminViewer() {
  return getViewer()?.role === "admin";
}

function getAllCustomers() {
  return state.overview?.customers || [];
}

function getSelectedCustomer() {
  return getAllCustomers().find((customer) => customer.id === state.selectedCustomerId) || null;
}

function buildStatusLabel(customer) {
  if (customer.blockedReason) {
    return customer.blockedReason;
  }
  return customer.reason || "Sem observacoes";
}

function formatCustomerStatus(status) {
  if (status === "active") {
    return "Ativa";
  }
  if (status === "blocked") {
    return "Bloqueada";
  }
  if (status === "expired") {
    return "Expirada";
  }
  return "Indefinida";
}

function formatUserRole(role) {
  if (role === "customer_manager") {
    return "Gerente";
  }
  if (role === "teacher") {
    return "Professor";
  }
  return "Sem usuario";
}

function matchesFilter(customer) {
  if (state.statusFilter === "all") {
    return true;
  }
  return customer.status === state.statusFilter;
}

function matchesSearch(customer) {
  if (!state.searchQuery) {
    return true;
  }
  const haystack = [
    customer.customerName,
    customer.email,
    customer.planName,
    ...(customer.managerUsers || []).map((user) => user.email),
    ...(customer.teacherUsers || []).map((user) => user.email),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(state.searchQuery);
}

function getFilteredCustomers() {
  return getAllCustomers().filter((customer) => matchesFilter(customer) && matchesSearch(customer));
}

function getVisiblePortalViews() {
  return isAdminViewer()
    ? ["overview", "subscription", "users", "finance", "system", "admin", "audit"]
    : ["overview", "subscription", "users", "finance", "system", "audit"];
}

function setPortalView(view) {
  const allowedViews = getVisiblePortalViews();
  const nextView = allowedViews.includes(view) ? view : allowedViews[0];
  state.portalView = nextView;

  document.querySelectorAll("[data-portal-view]").forEach((button) => {
    const isActive = button.dataset.portalView === nextView;
    button.classList.toggle("portal-menu-button-active", isActive);
  });

  document.querySelectorAll(".portal-view").forEach((panel) => {
    const shouldShow = panel.id === `portal-view-${nextView}`;
    panel.classList.toggle("hidden", !shouldShow);
  });
}

function renderShellVisibility() {
  const loggedIn = Boolean(state.token);
  document.body.classList.toggle("portal-mode", loggedIn);
  elements.entryPanel.classList.toggle("hidden", loggedIn);
  elements.portal.classList.toggle("hidden", !loggedIn);
  elements.logoutButton.classList.toggle("hidden", !loggedIn);
}

function updateHeader(health, overview) {
  if (overview?.serverName) {
    elements.serverName.textContent = overview.serverName;
  } else if (health?.serverName) {
    elements.serverName.textContent = health.serverName;
  }

  if (!health && overview) {
    elements.healthStatus.textContent = "Conectado";
    return;
  }

  if (!health) {
    elements.healthStatus.textContent = "Indisponivel";
    return;
  }

  elements.healthStatus.textContent = "Online";
}

function renderMetrics(metrics) {
  elements.metricTotal.textContent = `${metrics.totalCustomers || 0}`;
  elements.metricActive.textContent = `${metrics.activeCustomers || 0}`;
  elements.metricBlocked.textContent = `${metrics.blockedCustomers || 0}`;
  elements.metricDevices.textContent = `${metrics.totalDevices || 0}`;
  elements.metricRevenue.textContent = formatCurrency(metrics.currentRevenue || 0);
  elements.metricStudents.textContent = `${metrics.totalStudents || 0}`;
}

function renderCustomerList() {
  const customers = getFilteredCustomers();
  elements.resultsCount.textContent = `${customers.length} resultado${customers.length === 1 ? "" : "s"}`;

  if (!customers.length) {
    elements.customersList.innerHTML = `<div class="empty-state compact-empty"><strong>Nenhum cliente encontrado.</strong><p>Ajuste os filtros ou cadastre um novo cliente.</p></div>`;
    return;
  }

  elements.customersList.innerHTML = customers
    .map((customer) => {
      const selectedClass = customer.id === state.selectedCustomerId ? " customer-card-active" : "";
      return `
        <button class="customer-card${selectedClass}" type="button" data-customer-id="${escapeHtml(customer.id)}">
          <span class="customer-card-status customer-status-${escapeHtml(customer.status)}">${escapeHtml(formatCustomerStatus(customer.status))}</span>
          <strong>${escapeHtml(customer.customerName)}</strong>
          <span>${escapeHtml(customer.email)}</span>
          <span>${escapeHtml(`${customer.planName || "Plano"} | ${customer.usage.totalManagedUsers || 0}/${customer.deviceCount} usuarios`)}</span>
        </button>
      `;
    })
    .join("");
}

function renderManagerSelector(customer) {
  if (!isAdminViewer() || !customer) {
    elements.managerSwitchPanel.classList.add("hidden");
    elements.managerUserSelect.innerHTML = "";
    return;
  }

  const managerOptions = [...(customer.managerUsers || []), ...(customer.teacherUsers || [])];
  if (!managerOptions.length) {
    elements.managerSwitchPanel.classList.add("hidden");
    elements.managerUserSelect.innerHTML = "";
    return;
  }

  const currentManagerId = customer.managerUsers?.[0]?.id || "";
  elements.managerUserSelect.innerHTML = managerOptions
    .map((user) => {
      const roleLabel = user.role === "customer_manager" ? "Gerente atual" : "Professor";
      return `<option value="${escapeHtml(user.id)}" ${user.id === currentManagerId ? "selected" : ""}>${escapeHtml(`${user.displayName} - ${user.email} (${roleLabel})`)}</option>`;
    })
    .join("");

  elements.managerSwitchPanel.classList.remove("hidden");
}

function renderManagers(customer) {
  const managers = customer.managerUsers || [];
  if (!managers.length) {
    elements.managerUsersList.innerHTML = `<div class="empty-state compact-empty"><strong>Sem gerente cadastrado.</strong></div>`;
    return;
  }

  elements.managerUsersList.innerHTML = managers
    .map(
      (user) => `
        <article class="user-card user-card-manager">
          <div class="user-card-head">
            <div>
              <h3>${escapeHtml(user.displayName)}</h3>
            </div>
            <span class="pill">Gerente</span>
          </div>
          <div class="user-meta-grid">
            <div><span>Email</span><strong>${escapeHtml(user.email)}</strong></div>
            <div><span>Senha atual</span><strong>${escapeHtml(user.passwordPlaintext || "-")}</strong></div>
            <div><span>Logins</span><strong>${escapeHtml(String(user.loginCount || 0))}</strong></div>
            <div><span>Alunos sincronizados</span><strong>${escapeHtml(String(user.studentCount || 0))}</strong></div>
            <div><span>Turmas</span><strong>${escapeHtml(String(user.classCount || 0))}</strong></div>
            <div><span>Dispositivo principal</span><strong>${escapeHtml(user.boundDeviceId || "Gerenciado pela lista abaixo")}</strong></div>
          </div>
          <p class="helper-copy">Ultimo login: ${escapeHtml(formatDate(user.lastLoginAt))} | Ultima sincronizacao: ${escapeHtml(formatDate(user.lastSyncAt))}</p>
        </article>
      `
    )
    .join("");
}

function renderTeacherUsers(customer) {
  const teacherUsers = customer.teacherUsers || [];
  const canDeleteUsers = isAdminViewer();
  elements.teacherLimitNote.textContent =
    `Em uso: ${customer.usage.totalManagedUsers || 0}/${customer.deviceCount}. Livres: ${customer.usage.teacherSlotsAvailable}.`;

  if (!teacherUsers.length) {
    elements.teacherUsersList.innerHTML =
      `<div class="empty-state compact-empty"><strong>Nenhum professor cadastrado.</strong></div>`;
    return;
  }

  elements.teacherUsersList.innerHTML = teacherUsers
    .map(
      (user) => `
        <form class="user-card user-card-form" data-user-id="${escapeHtml(user.id)}">
          <div class="user-card-head">
            <div>
              <h3>${escapeHtml(user.displayName)}</h3>
            </div>
            <span class="pill">${escapeHtml(user.status === "active" ? "Ativo" : "Inativo")}</span>
          </div>

          <div class="inline-grid">
            <label>
              <span>Nome</span>
              <input data-field="displayName" type="text" value="${escapeHtml(user.displayName)}" />
            </label>
            <label>
              <span>Email</span>
              <input data-field="email" type="email" value="${escapeHtml(user.email)}" />
            </label>
            <label>
              <span>Nova senha</span>
              <input data-field="password" type="text" placeholder="Preencha so se quiser trocar" />
            </label>
            <label>
              <span>Status</span>
              <select data-field="status">
                <option value="active" ${user.status === "active" ? "selected" : ""}>Ativo</option>
                <option value="inactive" ${user.status === "inactive" ? "selected" : ""}>Inativo</option>
              </select>
            </label>
          </div>

          <div class="user-meta-grid">
            <div><span>Senha atual</span><strong>${escapeHtml(user.passwordPlaintext || "-")}</strong></div>
            <div><span>Logins</span><strong>${escapeHtml(String(user.loginCount || 0))}</strong></div>
            <div><span>Alunos</span><strong>${escapeHtml(String(user.studentCount || 0))}</strong></div>
            <div><span>Turmas</span><strong>${escapeHtml(String(user.classCount || 0))}</strong></div>
            <div><span>Dispositivo</span><strong>${escapeHtml(user.boundDeviceId || "Sem vinculo")}</strong></div>
            <div><span>Ultima sync</span><strong>${escapeHtml(formatDate(user.lastSyncAt))}</strong></div>
          </div>

          <div class="action-cluster">
            <button type="submit">Salvar usuario</button>
            <button class="ghost" type="button" data-action="clear-device" data-user-id="${escapeHtml(user.id)}">Limpar dispositivo</button>
            ${canDeleteUsers
              ? `<button class="ghost" type="button" data-action="delete-user" data-user-id="${escapeHtml(user.id)}">Remover usuario</button>`
              : ""}
          </div>
        </form>
      `
    )
    .join("");
}

function renderDevices(customer) {
  const devices = customer.devices || [];

  if (!devices.length) {
    elements.detailDevicesList.innerHTML =
      `<div class="empty-state compact-empty"><strong>Nenhum dispositivo vinculado.</strong><p>Quando um gerente ou professor entrar no app, o aparelho aparece aqui automaticamente.</p></div>`;
    return;
  }

  elements.detailDevicesList.innerHTML = devices
    .map(
      (device) => `
        <article class="device-card">
          <div class="device-card-head">
            <div>
              <h3>${escapeHtml(device.deviceLabel || device.deviceId)}</h3>
            </div>
            <span class="pill info">${escapeHtml(formatUserRole(device.userRole))}</span>
          </div>
          <div class="user-meta-grid">
            <div><span>ID do dispositivo</span><strong>${escapeHtml(device.deviceId || "-")}</strong></div>
            <div><span>Usuario vinculado</span><strong>${escapeHtml(device.userDisplayName || "Sem responsavel")}</strong></div>
            <div><span>Email</span><strong>${escapeHtml(device.userEmail || "-")}</strong></div>
            <div><span>Alunos</span><strong>${escapeHtml(String(device.studentCount || 0))}</strong></div>
            <div><span>Turmas</span><strong>${escapeHtml(String(device.classCount || 0))}</strong></div>
            <div><span>Ultimo login</span><strong>${escapeHtml(formatDate(device.lastLoginAt))}</strong></div>
          </div>
          <p class="helper-copy">Ultima presenca do app: ${escapeHtml(formatDate(device.lastSeenAt || device.lastSyncAt))}</p>
        </article>
      `
    )
    .join("");
}

function resetFinancialForm(options = {}) {
  const { preserveMonth = false, preserveReportCustomerName = false } = options;
  const existingMonth = preserveMonth ? normalizeMonthValue(elements.financialMonthInput.value) : "";
  const fallbackMonth = existingMonth || nextMonthValue();
  state.editingFinancialEntryId = "";
  state.editingFinancialGroupId = "";
  state.financialSelectedMonths = sortMonthValues([fallbackMonth]);
  state.financialPayingCountsByMonth = { [fallbackMonth]: 0 };
  elements.financialEntryId.value = "";
  elements.financialGroupId.value = "";
  elements.financialReportCustomerName.value = preserveReportCustomerName
    ? sanitizeFinancialCustomerName(elements.financialReportCustomerName.value)
    : "";
  elements.financialMonthInput.value = fallbackMonth;
  elements.financialMonthlyFee.value = "";
  elements.financialTotalCount.value = "";
  elements.financialTotalPayingCount.value = "0";
  elements.financialExpected.value = "";
  elements.financialReceived.value = "";
  elements.financialNotes.value = "";
  elements.saveFinancialButton.textContent = "Salvar lancamento";
  elements.clearFinancialFormButton.classList.add("hidden");
  syncFinancialPreview();
}

function renderFinancialMonthSelection() {
  const selectedMonths = sortMonthValues(state.financialSelectedMonths);
  state.financialSelectedMonths = selectedMonths;

  if (!selectedMonths.length) {
    elements.financialMonthList.innerHTML = "";
    elements.financialMonthHint.textContent = "Adicione um ou mais meses para o lancamento.";
    return;
  }

  elements.financialMonthList.innerHTML = selectedMonths
    .map(
      (month) => `
        <div class="finance-month-chip">
          <button class="chip-button" type="button" data-financial-month-remove="${escapeHtml(month)}">
            <strong>${escapeHtml(formatMonth(month))}</strong> ×
          </button>
        </div>
      `
    )
    .join("");

  elements.financialMonthHint.textContent =
    selectedMonths.length > 1
      ? `${selectedMonths.length} meses selecionados para rateio.`
      : "1 mes selecionado para este lancamento.";
}

function syncFinancialMonthPayingCounts() {
  const nextCounts = {};
  state.financialSelectedMonths.forEach((month) => {
    nextCounts[month] = parseCountValue(state.financialPayingCountsByMonth[month]);
  });
  state.financialPayingCountsByMonth = nextCounts;
}

function setFinancialSelectedMonths(months) {
  const normalizedMonths = sortMonthValues(
    Array.from(new Set((months || []).map((month) => normalizeMonthValue(month)).filter(Boolean)))
  );
  state.financialSelectedMonths = normalizedMonths.length ? normalizedMonths : [nextMonthValue()];
  syncFinancialMonthPayingCounts();
  elements.financialMonthInput.value = state.financialSelectedMonths[state.financialSelectedMonths.length - 1];
  renderFinancialMonthSelection();
}

function addFinancialMonth(month) {
  const normalizedMonth = normalizeMonthValue(month);
  if (!normalizedMonth) {
    throw new Error("Selecione um mes valido.");
  }

  setFinancialSelectedMonths(state.financialSelectedMonths.concat(normalizedMonth));
  syncFinancialPreview();
}

function removeFinancialMonth(month) {
  const normalizedMonth = normalizeMonthValue(month);
  if (!normalizedMonth) {
    return;
  }

  const nextMonths = state.financialSelectedMonths.filter((item) => item !== normalizedMonth);
  setFinancialSelectedMonths(nextMonths);
  syncFinancialPreview();
}

function setFinancialPayingCount(month, value) {
  const normalizedMonth = normalizeMonthValue(month);
  if (!normalizedMonth) {
    return;
  }

  state.financialPayingCountsByMonth = {
    ...state.financialPayingCountsByMonth,
    [normalizedMonth]: parseCountValue(value),
  };
}

function renderFinancialMonthPayers(preview) {
  if (!state.financialSelectedMonths.length) {
    elements.financialMonthPayersList.innerHTML = "";
    elements.financialPayingSummary.textContent = "Adicione meses para distribuir os pagantes.";
    return;
  }

  elements.financialMonthPayersList.innerHTML = state.financialSelectedMonths
    .map((month, index) => {
      const payingCount = parseCountValue(state.financialPayingCountsByMonth[month]);
      const receivedAmount = preview.receivedShares[index] || 0;
      const expectedAmount = preview.expectedShares[index] || 0;
      const missingAmount = preview.missingShares[index] || 0;

      return `
        <label class="finance-month-payer-card">
          <strong>${escapeHtml(formatMonth(month))}</strong>
          <input
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(String(payingCount))}"
            data-financial-paying-month="${escapeHtml(month)}"
          />
          <p>
            Recebido no mes ${escapeHtml(formatCurrency(receivedAmount))} | Esperado ${escapeHtml(
              formatCurrency(expectedAmount)
            )} | Faltante ${escapeHtml(formatCurrency(missingAmount))}
          </p>
        </label>
      `;
    })
    .join("");

  elements.financialPayingSummary.textContent =
    preview.monthsCount > 1
      ? `Total de ${preview.totalPayingCount} pagante(s) distribuido(s) em ${preview.monthsCount} meses.`
      : `Total de ${preview.totalPayingCount} pagante(s) registrado(s) para o mes selecionado.`;
}

function buildFinancialCalculationPreview() {
  const monthlyFee = roundCurrency(parseMoneyValue(elements.financialMonthlyFee.value));
  const totalCount = parseCountValue(elements.financialTotalCount.value);
  const selectedMonths = state.financialSelectedMonths.length ? state.financialSelectedMonths : [nextMonthValue()];
  const monthsCount = Math.max(selectedMonths.length || 1, 1);
  const payingCounts = selectedMonths.map((month) => parseCountValue(state.financialPayingCountsByMonth[month]));
  const totalPayingCount = payingCounts.reduce((sum, count) => sum + count, 0);
  const expectedAmount = roundCurrency(monthlyFee * totalCount);
  const receivedShares = payingCounts.map((count) => roundCurrency(monthlyFee * count));
  const receivedAmount = roundCurrency(receivedShares.reduce((sum, amount) => sum + amount, 0));
  const missingAmount = calculateFinancialMissingAmount(expectedAmount, receivedAmount);
  const expectedShares = splitAmountAcrossMonths(expectedAmount, monthsCount);
  const missingShares = expectedShares.map((expectedShare, index) =>
    calculateFinancialMissingAmount(expectedShare, receivedShares[index] || 0)
  );

  return {
    monthlyFee,
    totalCount,
    monthsCount,
    selectedMonths,
    payingCounts,
    totalPayingCount,
    expectedAmount,
    receivedAmount,
    missingAmount,
    expectedShares,
    receivedShares,
    missingShares,
  };
}

function syncFinancialPreview() {
  renderFinancialMonthSelection();

  const preview = buildFinancialCalculationPreview();
  elements.financialTotalPayingCount.value = `${preview.totalPayingCount}`;
  elements.financialExpected.value = formatCurrency(preview.expectedAmount);
  elements.financialReceived.value = formatCurrency(preview.receivedAmount);
  elements.financialMissing.value = formatCurrency(preview.missingAmount);
  elements.financialMissing.classList.toggle("finance-negative", preview.missingAmount > 0);
  elements.financialMissing.classList.toggle("finance-positive", preview.missingAmount <= 0);
  renderFinancialMonthPayers(preview);

  if (preview.monthsCount <= 1) {
    elements.financialDistributionHint.innerHTML =
      `O valor base de <strong>${escapeHtml(formatCurrency(preview.monthlyFee))}</strong> foi aplicado em um unico mes, com ${preview.totalPayingCount} pagante(s).`;
    return;
  }

  elements.financialDistributionHint.innerHTML =
    `Rateio em <strong>${preview.monthsCount} meses</strong>: o esperado continua dividido por mes e o recebido acompanha os pagantes que voce informou em cada mes.`;
}

function renderFinancial(customer) {
  if (!customer) {
    state.editingFinancialEntryId = "";
    state.financialContextCustomerId = "";
    elements.financeTitle.textContent = "Financeiro";
    elements.financeSelectedCustomerHint.textContent = "Vinculo interno: selecione um cliente para liberar o financeiro.";
    elements.financeEmpty.classList.remove("hidden");
    elements.financeContent.classList.add("hidden");
    elements.financialSummaryGrid.classList.add("hidden");
    elements.financialList.innerHTML =
      `<div class="empty-state compact-empty"><strong>Selecione um cliente para visualizar os lancamentos.</strong></div>`;
    resetFinancialForm();
    return;
  }

  const entries = customer.financialEntries || [];
  const summary = customer.financialSummary || {
    totalEntries: 0,
    expectedAmount: 0,
    receivedAmount: 0,
    missingAmount: 0,
  };

  if (state.financialContextCustomerId && state.financialContextCustomerId !== customer.id) {
    resetFinancialForm();
  }
  state.financialContextCustomerId = customer.id;

  if (state.editingFinancialEntryId && !entries.some((entry) => entry.id === state.editingFinancialEntryId)) {
    resetFinancialForm({ preserveMonth: true, preserveReportCustomerName: true });
  }

  elements.financeTitle.textContent = "Financeiro";
  elements.financeSelectedCustomerHint.textContent = `Vinculo interno selecionado: ${customer.customerName}`;
  elements.financeEmpty.classList.add("hidden");
  elements.financeContent.classList.remove("hidden");
  elements.financialSummaryGrid.classList.remove("hidden");
  elements.financialSummaryCount.textContent = `${summary.totalEntries || 0}`;
  elements.financialSummaryExpected.textContent = formatCurrency(summary.expectedAmount || 0);
  elements.financialSummaryReceived.textContent = formatCurrency(summary.receivedAmount || 0);
  elements.financialSummaryMissing.textContent = formatCurrency(summary.missingAmount || 0);

  if (!entries.length) {
    elements.financialList.innerHTML =
      `<div class="empty-state compact-empty"><strong>Nenhum lancamento financeiro cadastrado.</strong><p>Digite o nome do cliente que deve sair no relatorio, distribua os pagantes por mes e salve o lancamento.</p></div>`;
    return;
  }

  elements.financialList.innerHTML = entries
    .map((entry) => {
      const missingClass = entry.missingAmount > 0 ? "pill expired" : "pill active";
      const missingLabel = entry.missingAmount > 0 ? "Faltante" : "Fechado";

      return `
        <article class="financial-card">
          <div class="financial-card-head">
            <div>
              <h3>${escapeHtml(entry.monthLabel || formatMonth(entry.month))}</h3>
              <p>${escapeHtml(entry.calculationSummary || entry.notes || "Sem observacoes para este mes.")}</p>
            </div>
            <span class="${missingClass}">${escapeHtml(missingLabel)}</span>
          </div>
          <div class="user-meta-grid">
            <div><span>Cliente no relatorio</span><strong>${escapeHtml(entry.reportCustomerName || customer.customerName || "-")}</strong></div>
            <div><span>Mensalidade base</span><strong>${escapeHtml(formatCurrency(entry.monthlyFee || 0))}</strong></div>
            <div><span>Pagantes no mes</span><strong>${escapeHtml(String(entry.payingCount ?? 0))}</strong></div>
            <div><span>Quantidade total</span><strong>${escapeHtml(String(entry.totalCount ?? 0))}</strong></div>
            <div><span>Meses no rateio</span><strong>${escapeHtml(String(entry.monthsCount || 1))}</strong></div>
            <div><span>Esperado</span><strong>${escapeHtml(formatCurrency(entry.expectedAmount || 0))}</strong></div>
            <div><span>Recebido</span><strong>${escapeHtml(formatCurrency(entry.receivedAmount || 0))}</strong></div>
            <div><span>Faltante</span><strong>${escapeHtml(formatCurrency(entry.missingAmount || 0))}</strong></div>
            <div><span>Atualizado</span><strong>${escapeHtml(formatDate(entry.updatedAt))}</strong></div>
          </div>
          ${entry.notes ? `<p class="helper-copy">${escapeHtml(entry.notes)}</p>` : ""}
          <div class="action-cluster">
            <button class="ghost" type="button" data-financial-action="edit" data-financial-id="${escapeHtml(entry.id)}">Editar</button>
            <button class="ghost" type="button" data-financial-action="delete" data-financial-id="${escapeHtml(entry.id)}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function setDetailEditable(enabled) {
  [
    elements.detailName,
    elements.detailEmail,
    elements.detailPlan,
    elements.detailPrice,
    elements.detailDeviceCount,
    elements.detailExpiry,
    elements.detailNotes,
    elements.detailBlocked,
    elements.detailBlockedReason,
    elements.detailPassword,
    elements.saveCustomerButton,
    elements.extendCustomerButton,
    elements.cancelSubscriptionButton,
    elements.reactivateSubscriptionButton,
    elements.resetPasswordButton,
    elements.clearDevicesButton,
    elements.deleteCustomerButton,
  ].forEach((element) => {
    if (element && "disabled" in element) {
      element.disabled = !enabled;
    }
  });
}

function renderDetail() {
  const customer = getSelectedCustomer();
  if (!customer) {
    elements.detailTitle.textContent = "Selecione um cliente";
    elements.subscriptionTitle.textContent = "Assinatura";
    elements.detailEmpty.classList.remove("hidden");
    elements.overviewContent.classList.add("hidden");
    elements.subscriptionEmpty.classList.remove("hidden");
    elements.detailForm.classList.add("hidden");
    elements.copySelectedEmailButton.classList.add("hidden");
    elements.managerSwitchPanel.classList.add("hidden");
    elements.managerUsersList.innerHTML = "";
    elements.teacherUsersList.innerHTML = "";
    elements.teacherLimitNote.textContent = "Escolha um cliente para criar usuarios de professor.";
    elements.detailDevicesList.innerHTML = "";
    elements.overviewManagerEmail.textContent = "-";
    elements.overviewNotes.textContent = "-";
    elements.overviewBlockedReason.textContent = "-";
    elements.subscriptionStatusPreview.textContent = "-";
    elements.subscriptionExpiryPreview.textContent = "-";
    elements.subscriptionPlanPreview.textContent = "-";
    renderFinancial(null);
    return;
  }

  elements.detailEmpty.classList.add("hidden");
  elements.overviewContent.classList.remove("hidden");
  elements.subscriptionEmpty.classList.add("hidden");
  elements.detailForm.classList.remove("hidden");
  elements.copySelectedEmailButton.classList.remove("hidden");
  elements.detailTitle.textContent = customer.customerName;
  elements.subscriptionTitle.textContent = `Assinatura de ${customer.customerName}`;

  elements.detailName.value = customer.customerName || "";
  elements.detailEmail.value = customer.email || "";
  elements.detailPlan.value = customer.planName || "";
  elements.detailPrice.value = typeof customer.pricePerDevice === "number" ? customer.pricePerDevice.toFixed(2) : "";
  elements.detailDeviceCount.value = `${customer.deviceCount || 1}`;
  elements.detailExpiry.value = formatDateOnly(customer.expiresAt);
  elements.detailNotes.value = customer.notes || "";
  elements.detailBlocked.checked = Boolean(customer.blockedReason || customer.status === "blocked");
  elements.detailBlockedReason.value = customer.blockedReason || "";
  elements.detailPassword.value = "";
  elements.detailStatus.textContent = formatCustomerStatus(customer.status);
  elements.detailContractedDevices.textContent = `${customer.usage.totalManagedUsers || 0}/${customer.deviceCount}`;
  elements.detailDeviceUsage.textContent = `${customer.devicesInUse || 0}`;
  elements.detailPricePerDevice.textContent = formatCurrency(customer.pricePerDevice);
  elements.detailCurrentValue.textContent = formatCurrency(customer.currentValue);
  elements.overviewManagerEmail.textContent = customer.managerUsers?.[0]?.email || "-";
  elements.overviewNotes.textContent = customer.notes || "Sem observacoes.";
  elements.overviewBlockedReason.textContent = customer.blockedReason || "Sem bloqueio.";
  elements.subscriptionStatusPreview.textContent = formatCustomerStatus(customer.status);
  elements.subscriptionExpiryPreview.textContent = formatDateOnly(customer.expiresAt) || "-";
  elements.subscriptionPlanPreview.textContent = customer.planName || "-";
  elements.reactivateSubscriptionButton.classList.toggle("hidden", customer.status !== "blocked");
  elements.cancelSubscriptionButton.classList.toggle("hidden", customer.status === "blocked");

  renderManagerSelector(customer);
  renderManagers(customer);
  renderTeacherUsers(customer);
  renderDevices(customer);
  renderFinancial(customer);
  setDetailEditable(isAdminViewer());
}

function renderAudit(entries) {
  if (!entries.length) {
    elements.auditList.innerHTML =
      `<div class="empty-state compact-empty"><strong>Sem eventos por enquanto.</strong><p>Os proximos logins, criacoes e alteracoes vao aparecer aqui.</p></div>`;
    return;
  }

  elements.auditList.innerHTML = entries
    .map(
      (entry) => `
        <article class="audit-item">
          <strong>${escapeHtml(entry.summary || entry.type || "Evento")}</strong>
          <p>${escapeHtml(formatDate(entry.createdAt))}</p>
        </article>
      `
    )
    .join("");
}

function applyRoleVisibility() {
  const viewer = getViewer();
  const isAdmin = viewer?.role === "admin";

  elements.adminEmailDisplay.textContent = viewer?.email || "-";
  elements.viewerRoleDisplay.textContent = isAdmin ? "Administrador" : "Gerente";

  elements.adminSettingsForm.classList.toggle("hidden", !isAdmin);
  elements.customerForm.classList.toggle("hidden", !isAdmin);

  elements.teacherUserForm.classList.toggle("hidden", !isAdmin);
  elements.managerSwitchPanel.classList.toggle("hidden", !isAdmin || !getSelectedCustomer());

  elements.detailBlocked.disabled = !isAdmin;
  elements.detailBlockedReason.disabled = !isAdmin;
  elements.detailEmail.disabled = !isAdmin;

  document.querySelector('[data-portal-view="admin"]')?.classList.toggle("hidden", !isAdmin);
  if (!getVisiblePortalViews().includes(state.portalView)) {
    state.portalView = "overview";
  }
  setPortalView(state.portalView);
}

function renderOverview(overview) {
  state.overview = overview;
  const customers = overview.customers || [];
  if (!customers.some((customer) => customer.id === state.selectedCustomerId)) {
    state.selectedCustomerId = customers[0]?.id || "";
  }

  elements.serverName.textContent = overview.serverName || "Controle AlfaTec";
  elements.dataFile.textContent = overview.dataFile || "-";
  elements.systemDataFile.textContent = overview.dataFile || "-";
  elements.sessionStatus.textContent = `${overview.viewer.displayName || overview.viewer.email} (${overview.viewer.role})`;
  renderMetrics(overview.metrics);
  applyRoleVisibility();
  renderCustomerList();
  renderDetail();
  renderAudit(overview.audit || []);
  setPortalView(state.portalView);
}

async function refreshOverview() {
  const overview = await api("/api/portal/overview");
  const health = await loadHealth();
  updateHeader(health, overview);
  renderOverview(overview);
  renderShellVisibility();
}

async function handleLogin() {
  const payload = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: normalizeAlfaTecEmailValue(elements.loginEmail.value),
      password: elements.loginPassword.value,
    }),
  });

  if (!["admin", "customer_manager"].includes(payload.user.role)) {
    throw new Error("Essa conta nao pode abrir o Controle AlfaTec.");
  }

  state.token = payload.token;
  state.currentUser = payload.user;
  showToast(`Sessao iniciada para ${payload.user.email}.`);
  await refreshOverview();
}

function logout() {
  state.token = "";
  state.overview = null;
  state.currentUser = null;
  state.selectedCustomerId = "";
  state.portalView = "overview";
  state.editingFinancialEntryId = "";
  state.financialContextCustomerId = "";
  renderShellVisibility();
  elements.sessionStatus.textContent = "Aguardando login";
  elements.customersList.innerHTML = "";
  elements.auditList.innerHTML = "";
  elements.managerUsersList.innerHTML = "";
  elements.teacherUsersList.innerHTML = "";
  elements.teacherLimitNote.textContent = "";
  elements.financialList.innerHTML = "";
  elements.financialSummaryGrid.classList.add("hidden");
  elements.financeContent.classList.add("hidden");
  elements.financeEmpty.classList.remove("hidden");
  elements.financeTitle.textContent = "Financeiro";
  elements.financeSelectedCustomerHint.textContent = "Vinculo interno: selecione um cliente para liberar o financeiro.";
  elements.loginPassword.value = "";
  resetFinancialForm();
  elements.portalMenuBar.querySelectorAll("[data-portal-view]").forEach((button) => {
    button.classList.remove("portal-menu-button-active");
  });
  showToast("Sessao encerrada.");
}

async function handleSaveCustomer(event) {
  event.preventDefault();
  const customer = getSelectedCustomer();
  if (!customer || !isAdminViewer()) {
    showToast("Somente o admin pode alterar o contrato do cliente.");
    return;
  }

  const payload = {
    name: elements.detailName.value,
    email: normalizeAlfaTecEmailValue(elements.detailEmail.value),
    planName: elements.detailPlan.value,
    priceAmount: elements.detailPrice.value,
    deviceCount: elements.detailDeviceCount.value,
    expiresAt: toEndOfDayIso(elements.detailExpiry.value),
    notes: elements.detailNotes.value,
    blocked: elements.detailBlocked.checked,
    blockedReason: elements.detailBlockedReason.value,
  };

  await api(`/api/admin/customers/${customer.id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  showToast("Cliente atualizado.");
  await refreshOverview();
}

async function handleExtendCustomer() {
  const customer = getSelectedCustomer();
  if (!customer || !isAdminViewer()) {
    showToast("Somente o admin pode prorrogar o contrato.");
    return;
  }

  const nextDate = elements.detailExpiry.value || nextMonthDate();
  const date = new Date(`${nextDate}T12:00:00`);
  date.setDate(date.getDate() + 30);

  await api(`/api/admin/customers/${customer.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      expiresAt: new Date(`${date.toISOString().slice(0, 10)}T23:59:59`).toISOString(),
    }),
  });
  showToast("Assinatura prorrogada em 30 dias.");
  await refreshOverview();
}

async function handleCancelSubscription() {
  const customer = getSelectedCustomer();
  if (!customer || !isAdminViewer()) {
    showToast("Somente o admin pode cancelar a assinatura.");
    return;
  }

  await api(`/api/admin/customers/${customer.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      blocked: true,
      blockedReason: elements.detailBlockedReason.value.trim() || "Assinatura cancelada",
    }),
  });
  showToast("Assinatura cancelada.");
  await refreshOverview();
}

async function handleReactivateSubscription() {
  const customer = getSelectedCustomer();
  if (!customer || !isAdminViewer()) {
    showToast("Somente o admin pode reativar a assinatura.");
    return;
  }

  await api(`/api/admin/customers/${customer.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      blocked: false,
      blockedReason: "",
      expiresAt: toEndOfDayIso(elements.detailExpiry.value || nextMonthDate()),
    }),
  });
  showToast("Assinatura reativada.");
  await refreshOverview();
}

async function handleResetManagerPassword() {
  const customer = getSelectedCustomer();
  if (!customer || !isAdminViewer()) {
    showToast("Somente o admin pode redefinir a senha do cliente gerente.");
    return;
  }

  const password = elements.detailPassword.value.trim();
  if (!password) {
    throw new Error("Digite a nova senha do cliente gerente.");
  }

  await api(`/api/admin/customers/${customer.id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  elements.detailPassword.value = "";
  showToast("Senha do cliente gerente atualizada.");
  await refreshOverview();
}

async function handleClearDevices() {
  const customer = getSelectedCustomer();
  if (!customer) {
    return;
  }

  await api(`/api/admin/customers/${customer.id}/clear-devices`, {
    method: "POST",
  });
  showToast("Todos os dispositivos desse cliente foram limpos.");
  await refreshOverview();
}

async function handleDeleteCustomer() {
  const customer = getSelectedCustomer();
  if (!customer || !isAdminViewer()) {
    showToast("Somente o admin pode excluir clientes.");
    return;
  }

  const confirmed = window.confirm(
    `Excluir o cliente ${customer.customerName}?\n\nEssa acao remove usuarios, arquivos e vinculos desse cliente.`
  );
  if (!confirmed) {
    return;
  }

  await api(`/api/admin/customers/${customer.id}`, {
    method: "DELETE",
  });

  state.selectedCustomerId = "";
  showToast("Cliente excluido.");
  await refreshOverview();
}

async function handleSetManager() {
  const customer = getSelectedCustomer();
  if (!customer || !isAdminViewer()) {
    showToast("Somente o admin pode definir o gerente.");
    return;
  }

  const userId = elements.managerUserSelect.value;
  if (!userId) {
    throw new Error("Selecione qual usuario sera o gerente.");
  }

  await api(`/api/admin/customers/${customer.id}/manager`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  showToast("Gerente atualizado.");
  await refreshOverview();
}

async function handleCreateCustomer(event) {
  event.preventDefault();
  if (!isAdminViewer()) {
    showToast("Somente o admin pode criar clientes.");
    return;
  }

  await api("/api/admin/customers", {
    method: "POST",
    body: JSON.stringify({
      name: elements.customerName.value,
      email: normalizeAlfaTecEmailValue(elements.customerEmail.value),
      password: elements.customerPassword.value,
      planName: elements.customerPlan.value,
      priceAmount: elements.customerPrice.value,
      deviceCount: elements.customerDeviceCount.value,
      expiresAt: toEndOfDayIso(elements.customerExpiry.value),
      notes: elements.customerNotes.value,
    }),
  });

  elements.customerForm.reset();
  elements.customerPlan.value = "Plano Mensal";
  elements.customerDeviceCount.value = "1";
  elements.customerExpiry.value = nextMonthDate();
  showToast("Cliente criado com sucesso.");
  await refreshOverview();
}

function startFinancialEditing(entry) {
  const customer = getSelectedCustomer();
  const relatedEntries = entry.groupId
    ? (customer?.financialEntries || []).filter((item) => item.groupId === entry.groupId)
    : [entry];
  const months = relatedEntries.map((item) => item.month).filter(Boolean);
  const monthPayingCounts = Object.fromEntries(
    relatedEntries.map((item) => [item.month, parseCountValue(item.payingCount)])
  );
  const fallbackMonthlyFee =
    typeof entry.monthlyFee === "number"
      ? entry.monthlyFee
      : typeof entry.expectedAmount === "number"
        ? entry.expectedAmount
        : 0;
  const fallbackTotalCount =
    Number.isInteger(entry.totalCount)
      ? entry.totalCount
      : fallbackMonthlyFee > 0 && typeof entry.expectedAmount === "number"
        ? Math.max(1, Math.round(entry.expectedAmount / fallbackMonthlyFee))
        : 1;

  state.editingFinancialEntryId = entry.id;
  state.editingFinancialGroupId = entry.groupId || "";
  elements.financialEntryId.value = entry.id;
  elements.financialGroupId.value = entry.groupId || "";
  setFinancialSelectedMonths(months.length ? months : [entry.month || nextMonthValue()]);
  state.financialPayingCountsByMonth = cloneMonthCountMap(monthPayingCounts);
  syncFinancialMonthPayingCounts();
  elements.financialReportCustomerName.value = sanitizeFinancialCustomerName(
    entry.reportCustomerName || customer?.customerName || ""
  );
  elements.financialMonthlyFee.value = fallbackMonthlyFee > 0 ? fallbackMonthlyFee.toFixed(2) : "";
  elements.financialTotalCount.value = `${fallbackTotalCount}`;
  elements.financialNotes.value = entry.notes || "";
  elements.saveFinancialButton.textContent = relatedEntries.length > 1 ? "Salvar rateio" : "Salvar alteracoes";
  elements.clearFinancialFormButton.classList.remove("hidden");
  syncFinancialPreview();
}

async function handleFinancialFormSubmit(event) {
  event.preventDefault();
  const customer = getSelectedCustomer();
  if (!customer) {
    throw new Error("Selecione um cliente antes de salvar o financeiro.");
  }

  if (!state.financialSelectedMonths.length) {
    throw new Error("Selecione ao menos um mes para o lancamento.");
  }

  const reportCustomerName = sanitizeFinancialCustomerName(elements.financialReportCustomerName.value);
  if (!reportCustomerName) {
    throw new Error("Digite o nome do cliente que deve aparecer no relatorio.");
  }

  const payload = {
    groupId: elements.financialGroupId.value,
    months: state.financialSelectedMonths,
    reportCustomerName,
    monthlyFee: elements.financialMonthlyFee.value,
    payingCountsByMonth: cloneMonthCountMap(state.financialPayingCountsByMonth),
    totalCount: elements.financialTotalCount.value,
    expectedAmount: buildFinancialCalculationPreview().expectedAmount,
    receivedAmount: buildFinancialCalculationPreview().receivedAmount,
    notes: elements.financialNotes.value,
  };

  if (state.editingFinancialEntryId) {
    await api(`/api/portal/customers/${customer.id}/financial/${state.editingFinancialEntryId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    showToast("Lancamento financeiro atualizado.");
  } else {
    await api(`/api/portal/customers/${customer.id}/financial`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("Lancamento financeiro salvo.");
  }

  resetFinancialForm({ preserveMonth: true, preserveReportCustomerName: true });
  await refreshOverview();
  setPortalView("finance");
}

async function handleDownloadFinancialReport() {
  const customer = getSelectedCustomer();
  if (!customer) {
    throw new Error("Selecione um cliente antes de gerar o relatorio.");
  }

  const reportCustomerName = sanitizeFinancialCustomerName(elements.financialReportCustomerName.value);
  const query = reportCustomerName
    ? `?reportCustomerName=${encodeURIComponent(reportCustomerName)}`
    : "";

  await downloadFromApi(
    `/api/portal/customers/${customer.id}/financial-report${query}`,
    `relatorio-financeiro-${reportCustomerName || customer.customerName || "cliente"}.pdf`
  );
  showToast("Relatorio financeiro em PDF gerado.");
}

async function handleFinancialListClick(event) {
  const button = event.target.closest("[data-financial-action]");
  if (!button) {
    return;
  }

  const customer = getSelectedCustomer();
  if (!customer) {
    return;
  }

  const entry = (customer.financialEntries || []).find((item) => item.id === button.dataset.financialId);
  if (!entry) {
    throw new Error("Lancamento financeiro nao encontrado.");
  }

  if (button.dataset.financialAction === "edit") {
    startFinancialEditing(entry);
    return;
  }

  if (button.dataset.financialAction === "delete") {
    const confirmed = window.confirm(`Excluir o lancamento de ${entry.monthLabel || formatMonth(entry.month)}?`);
    if (!confirmed) {
      return;
    }

    await api(`/api/portal/customers/${customer.id}/financial/${entry.id}`, {
      method: "DELETE",
    });

    showToast("Lancamento financeiro excluido.");
    if (state.editingFinancialEntryId === entry.id) {
      resetFinancialForm({ preserveMonth: true, preserveReportCustomerName: true });
    }
    await refreshOverview();
    setPortalView("finance");
  }
}

async function handleCreateTeacher(event) {
  event.preventDefault();
  if (!isAdminViewer()) {
    showToast("Somente o controle/admin pode criar usuarios.");
    return;
  }
  const customer = getSelectedCustomer();
  if (!customer) {
    throw new Error("Selecione um cliente antes de criar usuarios.");
  }

  await api("/api/portal/users", {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.id,
      displayName: elements.teacherName.value,
      email: normalizeAlfaTecEmailValue(elements.teacherEmail.value),
      password: elements.teacherPassword.value,
    }),
  });

  elements.teacherUserForm.reset();
  showToast("Usuario do professor criado.");
  await refreshOverview();
}

async function handleTeacherCardSubmit(event) {
  const form = event.target.closest(".user-card-form");
  if (!form) {
    return;
  }
  event.preventDefault();

  const userId = form.dataset.userId;
  const payload = {
    displayName: form.querySelector('[data-field="displayName"]').value,
    email: normalizeAlfaTecEmailValue(form.querySelector('[data-field="email"]').value),
    status: form.querySelector('[data-field="status"]').value,
  };
  const password = form.querySelector('[data-field="password"]').value.trim();
  if (password) {
    payload.password = password;
  }

  await api(`/api/portal/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  showToast("Usuario atualizado.");
  await refreshOverview();
}

async function handleTeacherCardClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "clear-device") {
    await api(`/api/portal/users/${button.dataset.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ clearDeviceBinding: true }),
    });
    showToast("Dispositivo desvinculado do usuario.");
    await refreshOverview();
  }

  if (button.dataset.action === "delete-user") {
    if (!isAdminViewer()) {
      showToast("Somente o controle/admin pode remover usuarios.");
      return;
    }
    await api(`/api/portal/users/${button.dataset.userId}`, {
      method: "DELETE",
    });
    showToast("Usuario removido.");
    await refreshOverview();
  }
}

async function handleAdminPasswordChange(event) {
  event.preventDefault();
  if (!isAdminViewer()) {
    showToast("Somente o admin pode trocar essa senha.");
    return;
  }

  if (elements.adminNewPassword.value !== elements.adminConfirmPassword.value) {
    throw new Error("A confirmacao da senha do admin nao confere.");
  }

  await api("/api/admin/settings/password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: elements.adminCurrentPassword.value,
      newPassword: elements.adminNewPassword.value,
    }),
  });

  elements.adminSettingsForm.reset();
  showToast("Senha do admin atualizada.");
}

async function copySelectedEmail() {
  const customer = getSelectedCustomer();
  if (!customer) {
    return;
  }
  await navigator.clipboard.writeText(customer.email || "");
  showToast("Email copiado.");
}

elements.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLogin().catch((error) => showToast(error.message || "Nao foi possivel entrar."));
});

if (elements.toggleLoginPassword) {
  elements.toggleLoginPassword.addEventListener("click", () => {
    togglePasswordVisibility(elements.loginPassword, elements.toggleLoginPassword);
  });
}

document.querySelectorAll("[data-toggle-password-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.getAttribute("data-toggle-password-target");
    if (!targetId) {
      return;
    }
    togglePasswordVisibility(document.getElementById(targetId), button);
  });
});

elements.headerRefreshButton.addEventListener("click", () => {
  if (!state.token) {
    loadHealth()
      .then((health) => updateHeader(health));
    return;
  }

  refreshOverview().catch((error) => showToast(error.message || "Nao foi possivel atualizar."));
});

elements.logoutButton.addEventListener("click", logout);
elements.portalMenuBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-portal-view]");
  if (!button) {
    return;
  }
  setPortalView(button.dataset.portalView);
});
elements.customerSearch.addEventListener("input", (event) => {
  state.searchQuery = normalizeText(event.target.value);
  renderCustomerList();
});
elements.statusFilter.addEventListener("change", (event) => {
  state.statusFilter = event.target.value;
  renderCustomerList();
});
elements.customersList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-customer-id]");
  if (!button) {
    return;
  }
  state.selectedCustomerId = button.dataset.customerId;
  renderCustomerList();
  renderDetail();
});
elements.detailForm.addEventListener("submit", (event) => {
  handleSaveCustomer(event).catch((error) => showToast(error.message || "Nao foi possivel salvar o cliente."));
});
elements.extendCustomerButton.addEventListener("click", () => {
  handleExtendCustomer().catch((error) => showToast(error.message || "Nao foi possivel prorrogar."));
});
elements.cancelSubscriptionButton.addEventListener("click", () => {
  handleCancelSubscription().catch((error) => showToast(error.message || "Nao foi possivel cancelar a assinatura."));
});
elements.reactivateSubscriptionButton.addEventListener("click", () => {
  handleReactivateSubscription().catch((error) => showToast(error.message || "Nao foi possivel reativar a assinatura."));
});
elements.resetPasswordButton.addEventListener("click", () => {
  handleResetManagerPassword().catch((error) => showToast(error.message || "Nao foi possivel redefinir a senha."));
});
elements.clearDevicesButton.addEventListener("click", () => {
  handleClearDevices().catch((error) => showToast(error.message || "Nao foi possivel limpar os dispositivos."));
});
elements.deleteCustomerButton.addEventListener("click", () => {
  handleDeleteCustomer().catch((error) => showToast(error.message || "Nao foi possivel excluir o cliente."));
});
elements.copySelectedEmailButton.addEventListener("click", () => {
  copySelectedEmail().catch((error) => showToast(error.message || "Nao foi possivel copiar o email."));
});
elements.customerForm.addEventListener("submit", (event) => {
  handleCreateCustomer(event).catch((error) => showToast(error.message || "Nao foi possivel criar o cliente."));
});
elements.teacherUserForm.addEventListener("submit", (event) => {
  handleCreateTeacher(event).catch((error) => showToast(error.message || "Nao foi possivel criar o usuario."));
});
elements.financialForm.addEventListener("submit", (event) => {
  handleFinancialFormSubmit(event).catch((error) => showToast(error.message || "Nao foi possivel salvar o lancamento financeiro."));
});
elements.setManagerButton.addEventListener("click", () => {
  handleSetManager().catch((error) => showToast(error.message || "Nao foi possivel trocar o gerente."));
});
elements.teacherUsersList.addEventListener("submit", (event) => {
  handleTeacherCardSubmit(event).catch((error) => showToast(error.message || "Nao foi possivel salvar o usuario."));
});
elements.teacherUsersList.addEventListener("click", (event) => {
  handleTeacherCardClick(event).catch((error) => showToast(error.message || "Nao foi possivel atualizar o usuario."));
});
elements.financialList.addEventListener("click", (event) => {
  handleFinancialListClick(event).catch((error) => showToast(error.message || "Nao foi possivel atualizar o financeiro."));
});
elements.downloadFinancialReportButton.addEventListener("click", () => {
  handleDownloadFinancialReport().catch((error) => showToast(error.message || "Nao foi possivel gerar o relatorio financeiro."));
});
elements.clearFinancialFormButton.addEventListener("click", () => {
  resetFinancialForm({ preserveMonth: true, preserveReportCustomerName: true });
});
elements.addFinancialMonthButton.addEventListener("click", () => {
  try {
    addFinancialMonth(elements.financialMonthInput.value || nextMonthValue());
  } catch (error) {
    showToast(error.message || "Nao foi possivel adicionar o mes.");
  }
});
elements.financialMonthList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-financial-month-remove]");
  if (!button) {
    return;
  }
  removeFinancialMonth(button.dataset.financialMonthRemove || "");
});
elements.financialMonthPayersList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-financial-paying-month]");
  if (!input) {
    return;
  }
  setFinancialPayingCount(input.dataset.financialPayingMonth || "", input.value);
  syncFinancialPreview();
});
elements.financialUseSelectedCustomerButton.addEventListener("click", () => {
  const selectedCustomerName = getSelectedCustomerName();
  if (!selectedCustomerName) {
    showToast("Selecione um cliente interno antes de usar esse nome.");
    return;
  }
  elements.financialReportCustomerName.value = selectedCustomerName;
  syncFinancialPreview();
});
elements.adminSettingsForm.addEventListener("submit", (event) => {
  handleAdminPasswordChange(event).catch((error) => showToast(error.message || "Nao foi possivel atualizar a senha."));
});

[
  elements.loginEmail,
  elements.customerEmail,
  elements.teacherEmail,
  elements.detailEmail,
].forEach((input) => {
  input.addEventListener("blur", () => {
    const normalizedEmail = normalizeAlfaTecEmailValue(input.value);
    if (normalizedEmail) {
      input.value = normalizedEmail;
    }
  });
});

[
  elements.financialMonthlyFee,
  elements.financialTotalCount,
  elements.financialReportCustomerName,
].forEach((input) => {
  input.addEventListener("input", () => {
    syncFinancialPreview();
  });
});

elements.customerExpiry.value = nextMonthDate();
resetFinancialForm();
renderShellVisibility();
loadHealth()
  .then((health) => updateHeader(health));
