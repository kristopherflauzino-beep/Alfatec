const state = {
  token: "",
  overview: null,
  currentUser: null,
  selectedCustomerId: "",
  searchQuery: "",
  statusFilter: "all",
};

const elements = {
  entryPanel: document.getElementById("entry-panel"),
  portal: document.getElementById("portal"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  serverName: document.getElementById("server-name"),
  healthStatus: document.getElementById("health-status"),
  sessionStatus: document.getElementById("session-status"),
  headerRefreshButton: document.getElementById("header-refresh-button"),
  logoutButton: document.getElementById("logout-button"),
  customerSearch: document.getElementById("customer-search"),
  statusFilter: document.getElementById("status-filter"),
  dataFile: document.getElementById("data-file"),
  metricTotal: document.getElementById("metric-total"),
  metricActive: document.getElementById("metric-active"),
  metricBlocked: document.getElementById("metric-blocked"),
  metricDevices: document.getElementById("metric-devices"),
  metricRevenue: document.getElementById("metric-revenue"),
  metricStudents: document.getElementById("metric-due-soon"),
  resultsCount: document.getElementById("results-count"),
  customersList: document.getElementById("customers-list"),
  detailTitle: document.getElementById("detail-title"),
  detailEmpty: document.getElementById("detail-empty"),
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
  detailDevicesList: document.getElementById("detail-devices-list"),
  fileUploadForm: document.getElementById("file-upload-form"),
  fileUploadButton: document.getElementById("file-upload-button"),
  fileCategory: document.getElementById("file-category"),
  fileTitle: document.getElementById("file-title"),
  fileInput: document.getElementById("file-input"),
  fileDescription: document.getElementById("file-description"),
  libraryFilesList: document.getElementById("library-files-list"),
  copySelectedEmailButton: document.getElementById("copy-selected-email-button"),
  extendCustomerButton: document.getElementById("extend-customer-button"),
  resetPasswordButton: document.getElementById("reset-password-button"),
  clearDevicesButton: document.getElementById("clear-devices-button"),
  managerUsersList: document.getElementById("manager-users-list"),
  teacherUsersList: document.getElementById("teacher-users-list"),
  teacherUserForm: document.getElementById("teacher-user-form"),
  teacherName: document.getElementById("teacher-name"),
  teacherEmail: document.getElementById("teacher-email"),
  teacherPassword: document.getElementById("teacher-password"),
  teacherLimitNote: document.getElementById("teacher-limit-note"),
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
  const response = await fetch(path, {
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
  const response = await fetch(path, {
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

async function loadHealth() {
  const response = await fetch("/api/health");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Servidor sem resposta.");
  }
  return payload;
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

function renderShellVisibility() {
  const loggedIn = Boolean(state.token);
  elements.entryPanel.classList.toggle("hidden", loggedIn);
  elements.portal.classList.toggle("hidden", !loggedIn);
  elements.logoutButton.classList.toggle("hidden", !loggedIn);
}

function updateHeader(health) {
  if (health?.serverName) {
    elements.serverName.textContent = health.serverName;
  }

  if (!health) {
    elements.healthStatus.textContent = "Sem resposta";
    return;
  }

  const urls = Array.isArray(health.networkUrls) && health.networkUrls.length ? ` | Rede: ${health.networkUrls[0]}` : "";
  elements.healthStatus.textContent = `Online${urls}`;
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
          <span class="customer-card-status customer-status-${escapeHtml(customer.status)}">${escapeHtml(customer.status)}</span>
          <strong>${escapeHtml(customer.customerName)}</strong>
          <span>${escapeHtml(customer.email)}</span>
          <span>${escapeHtml(customer.planName || "Plano")}</span>
          <span>${escapeHtml(`Dispositivos ${customer.usage.totalManagedUsers || 0}/${customer.deviceCount} | Alunos ${customer.usage.totalStudents}`)}</span>
        </button>
      `;
    })
    .join("");
}

function renderManagers(customer) {
  const managers = customer.managerUsers || [];
  if (!managers.length) {
    elements.managerUsersList.innerHTML = `<div class="empty-state compact-empty"><strong>Sem gerente cadastrado.</strong><p>Esse cliente ainda nao tem uma conta principal.</p></div>`;
    return;
  }

  elements.managerUsersList.innerHTML = managers
    .map(
      (user) => `
        <article class="user-card user-card-manager">
          <div class="user-card-head">
            <div>
              <p class="section-kicker">Cliente gerente</p>
              <h3>${escapeHtml(user.displayName)}</h3>
            </div>
            <span class="pill">${escapeHtml(user.status)}</span>
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
  elements.teacherLimitNote.textContent =
    `Total em uso: ${customer.usage.totalManagedUsers || 0}/${customer.deviceCount}. ` +
    `A secretaria ocupa 1 vaga e os demais usuarios usam as restantes. Espacos livres: ${customer.usage.teacherSlotsAvailable}.`;

  if (!teacherUsers.length) {
    elements.teacherUsersList.innerHTML =
      `<div class="empty-state compact-empty"><strong>Nenhum professor cadastrado.</strong><p>Crie o primeiro usuario de professor para esse cliente.</p></div>`;
    return;
  }

  elements.teacherUsersList.innerHTML = teacherUsers
    .map(
      (user) => `
        <form class="user-card user-card-form" data-user-id="${escapeHtml(user.id)}">
          <div class="user-card-head">
            <div>
              <p class="section-kicker">Professor</p>
              <h3>${escapeHtml(user.displayName)}</h3>
            </div>
            <span class="pill">${escapeHtml(user.status)}</span>
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
            <button class="ghost" type="button" data-action="delete-user" data-user-id="${escapeHtml(user.id)}">Remover usuario</button>
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
              <p class="section-kicker">Dispositivo</p>
              <h3>${escapeHtml(device.deviceLabel || device.deviceId)}</h3>
            </div>
            <span class="pill info">${escapeHtml(device.userRole || "sem usuario")}</span>
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

function renderLibraryFiles(customer) {
  const files = customer.files || [];

  if (!files.length) {
    elements.libraryFilesList.innerHTML =
      `<div class="empty-state compact-empty"><strong>Nenhum arquivo enviado.</strong><p>Envie aplicativos, documentos ou logs para liberar o download aos usuarios deste cliente.</p></div>`;
    return;
  }

  elements.libraryFilesList.innerHTML = files
    .map(
      (file) => `
        <article class="library-card">
          <div class="library-card-head">
            <div>
              <p class="section-kicker">${escapeHtml(formatFileCategory(file.category))}</p>
              <h3>${escapeHtml(file.title || file.originalName)}</h3>
            </div>
            <span class="pill info">${escapeHtml(formatBytes(file.size))}</span>
          </div>
          <p class="library-description">${escapeHtml(file.description || file.originalName)}</p>
          <div class="user-meta-grid">
            <div><span>Enviado por</span><strong>${escapeHtml(file.uploadedByName || file.uploadedByEmail || "-")}</strong></div>
            <div><span>Data</span><strong>${escapeHtml(formatDate(file.createdAt))}</strong></div>
            <div><span>Arquivo original</span><strong>${escapeHtml(file.originalName || "-")}</strong></div>
          </div>
          <div class="action-cluster">
            <button type="button" data-file-action="download" data-file-id="${escapeHtml(file.id)}">Baixar</button>
            <button class="ghost" type="button" data-file-action="delete" data-file-id="${escapeHtml(file.id)}">Remover</button>
          </div>
        </article>
      `
    )
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
    elements.extendCustomerButton,
    elements.resetPasswordButton,
  ].forEach((element) => {
    if ("disabled" in element) {
      element.disabled = !enabled;
    }
  });
}

function renderDetail() {
  const customer = getSelectedCustomer();
  if (!customer) {
    elements.detailTitle.textContent = "Selecione um cliente";
    elements.detailEmpty.classList.remove("hidden");
    elements.detailForm.classList.add("hidden");
    elements.copySelectedEmailButton.classList.add("hidden");
    elements.managerUsersList.innerHTML = "";
    elements.teacherUsersList.innerHTML = "";
    elements.teacherLimitNote.textContent = "Escolha um cliente para criar usuarios de professor.";
    elements.detailDevicesList.innerHTML = "";
    elements.libraryFilesList.innerHTML = "";
    return;
  }

  elements.detailEmpty.classList.add("hidden");
  elements.detailForm.classList.remove("hidden");
  elements.copySelectedEmailButton.classList.remove("hidden");
  elements.detailTitle.textContent = customer.customerName;

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
  elements.detailStatus.textContent = buildStatusLabel(customer);
  elements.detailContractedDevices.textContent = `${customer.usage.teacherSlotsUsed}/${customer.deviceCount}`;
  elements.detailDeviceUsage.textContent = `${customer.devicesInUse || 0}`;
  elements.detailPricePerDevice.textContent = formatCurrency(customer.pricePerDevice);
  elements.detailCurrentValue.textContent = formatCurrency(customer.currentValue);

  renderManagers(customer);
  renderTeacherUsers(customer);
  renderDevices(customer);
  renderLibraryFiles(customer);
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
  elements.viewerRoleDisplay.textContent = isAdmin ? "Administrador" : "Cliente gerente";

  const adminSettingsPanel = elements.adminSettingsForm.closest(".settings-panel");
  if (adminSettingsPanel) {
    elements.adminSettingsForm.classList.toggle("hidden", !isAdmin);
    elements.customerForm.classList.toggle("hidden", !isAdmin);
  }

  elements.teacherUserForm.classList.toggle("hidden", !isAdmin);

  elements.detailBlocked.disabled = !isAdmin;
  elements.detailBlockedReason.disabled = !isAdmin;
  elements.detailEmail.disabled = !isAdmin;
}

function renderOverview(overview) {
  state.overview = overview;
  const customers = overview.customers || [];
  if (!customers.some((customer) => customer.id === state.selectedCustomerId)) {
    state.selectedCustomerId = customers[0]?.id || "";
  }

  elements.dataFile.textContent = overview.dataFile || "-";
  elements.sessionStatus.textContent = `${overview.viewer.displayName || overview.viewer.email} (${overview.viewer.role})`;
  renderMetrics(overview.metrics);
  renderCustomerList();
  renderDetail();
  renderAudit(overview.audit || []);
  applyRoleVisibility();
}

async function refreshOverview() {
  const [health, overview] = await Promise.all([loadHealth(), api("/api/portal/overview")]);
  updateHeader(health);
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
  renderShellVisibility();
  elements.sessionStatus.textContent = "Aguardando login";
  elements.customersList.innerHTML = "";
  elements.auditList.innerHTML = "";
  elements.managerUsersList.innerHTML = "";
  elements.teacherUsersList.innerHTML = "";
  elements.teacherLimitNote.textContent = "";
  elements.loginPassword.value = "";
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

async function handleUploadFile() {
  const customer = getSelectedCustomer();
  const file = elements.fileInput.files[0];
  if (!customer) {
    throw new Error("Selecione um cliente antes de enviar arquivos.");
  }
  if (!file) {
    throw new Error("Escolha um arquivo para enviar.");
  }

  const formData = new FormData();
  formData.append("customerId", customer.id);
  formData.append("category", elements.fileCategory.value);
  formData.append("title", elements.fileTitle.value || file.name);
  formData.append("description", elements.fileDescription.value);
  formData.append("file", file);

  await apiForm("/api/files", formData);
  elements.fileTitle.value = "";
  elements.fileDescription.value = "";
  elements.fileInput.value = "";
  showToast("Arquivo enviado.");
  await refreshOverview();
}

async function downloadFile(fileId) {
  const response = await fetch(`/api/files/${fileId}/download`, {
    headers: {
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Nao foi possivel baixar o arquivo.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : "arquivo";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleLibraryClick(event) {
  const button = event.target.closest("[data-file-action]");
  if (!button) {
    return;
  }

  const fileId = button.dataset.fileId;
  if (button.dataset.fileAction === "download") {
    await downloadFile(fileId);
    return;
  }

  if (button.dataset.fileAction === "delete") {
    await api(`/api/files/${fileId}`, {
      method: "DELETE",
    });
    showToast("Arquivo removido.");
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

elements.headerRefreshButton.addEventListener("click", () => {
  if (!state.token) {
    loadHealth()
      .then(updateHeader)
      .catch((error) => showToast(error.message || "Servidor sem resposta."));
    return;
  }

  refreshOverview().catch((error) => showToast(error.message || "Nao foi possivel atualizar."));
});

elements.logoutButton.addEventListener("click", logout);
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
elements.resetPasswordButton.addEventListener("click", () => {
  handleResetManagerPassword().catch((error) => showToast(error.message || "Nao foi possivel redefinir a senha."));
});
elements.clearDevicesButton.addEventListener("click", () => {
  handleClearDevices().catch((error) => showToast(error.message || "Nao foi possivel limpar os dispositivos."));
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
elements.teacherUsersList.addEventListener("submit", (event) => {
  handleTeacherCardSubmit(event).catch((error) => showToast(error.message || "Nao foi possivel salvar o usuario."));
});
elements.teacherUsersList.addEventListener("click", (event) => {
  handleTeacherCardClick(event).catch((error) => showToast(error.message || "Nao foi possivel atualizar o usuario."));
});
elements.fileUploadButton.addEventListener("click", () => {
  handleUploadFile().catch((error) => showToast(error.message || "Nao foi possivel enviar o arquivo."));
});
elements.libraryFilesList.addEventListener("click", (event) => {
  handleLibraryClick(event).catch((error) => showToast(error.message || "Nao foi possivel concluir a acao."));
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

elements.customerExpiry.value = nextMonthDate();
renderShellVisibility();
loadHealth()
  .then(updateHeader)
  .catch((error) => showToast(error.message || "Nao foi possivel ler o status do servidor."));
