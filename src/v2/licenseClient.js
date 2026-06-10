import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  apiUrl: "@chamada_v2_api_url",
  session: "@chamada_v2_session",
  licenseCache: "@chamada_v2_license_cache",
  deviceId: "@chamada_v2_device_id",
  rememberedLogin: "@chamada_v2_remembered_login",
};

const PUBLIC_VERCEL_API_URL = "https://alfatec-api.vercel.app";

const DEFAULT_GITHUB_CONFIG_URLS = [
  "https://kristopherflauzino-beep.github.io/Alfatec/v2/mobile-server-config.json",
  "https://raw.githubusercontent.com/kristopherflauzino-beep/Alfatec/main/docs/v2/mobile-server-config.json",
  "https://raw.githubusercontent.com/kristopherflauzino-beep/Alfatec/main/v2/mobile-server-config.json",
];

const LEGACY_LOCAL_API_URLS = new Set([
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "https://controle-alfatec-v2.onrender.com",
]);

export function isLegacyLocalApiUrl(value) {
  return LEGACY_LOCAL_API_URLS.has(normalizeApiUrl(value).toLowerCase());
}

async function loadRemoteBootstrapApiUrl() {
  const configuredUrl = `${process.env.EXPO_PUBLIC_V2_CONFIG_URL || ""}`.trim();
  const candidateConfigUrls = configuredUrl ? [configuredUrl] : DEFAULT_GITHUB_CONFIG_URLS;

  for (const remoteConfigUrl of candidateConfigUrls) {
    if (!remoteConfigUrl) {
      continue;
    }

    try {
      const response = await fetch(remoteConfigUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const apiUrl = normalizeApiUrl(payload?.apiUrl);
      if (apiUrl) {
        return apiUrl;
      }
    } catch (_error) {
      // Tenta a proxima origem oficial.
    }
  }

  return "";
}

function buildError(message, statusCode = 0) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function normalizeApiUrl(value) {
  return `${value || ""}`.trim().replace(/\/+$/, "");
}

export async function probeApiUrlCandidate(apiUrl) {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  if (!normalizedApiUrl) {
    return "";
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 3500);

  try {
    const response = await fetch(`${normalizedApiUrl}/api/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    return payload?.ok ? normalizedApiUrl : "";
  } catch (_error) {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    if (!response.ok) {
      return {
        error: `O servidor configurado nao respondeu como Controle AlfaTec V2 (HTTP ${response.status}).`,
      };
    }
    throw buildError("O servidor respondeu com um formato invalido.", response.status);
  }
}

export async function getOrCreateDeviceId() {
  const existingValue = await AsyncStorage.getItem(STORAGE_KEYS.deviceId);
  if (existingValue) {
    return existingValue;
  }

  const nextValue = `device-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  await AsyncStorage.setItem(STORAGE_KEYS.deviceId, nextValue);
  return nextValue;
}

export async function loadStoredApiUrl() {
  const storedApiUrl = normalizeApiUrl(await AsyncStorage.getItem(STORAGE_KEYS.apiUrl));
  const remoteBootstrapApiUrl = await loadRemoteBootstrapApiUrl();
  const defaultApiUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_V2_DEFAULT_API_URL);

  for (const candidateUrl of [
    storedApiUrl && !isLegacyLocalApiUrl(storedApiUrl) ? storedApiUrl : "",
    defaultApiUrl,
    remoteBootstrapApiUrl,
    PUBLIC_VERCEL_API_URL,
  ]) {
    const availableUrl = await probeApiUrlCandidate(candidateUrl);
    if (availableUrl) {
      return availableUrl;
    }
  }

  return "";
}

export async function saveApiUrl(apiUrl) {
  await AsyncStorage.setItem(STORAGE_KEYS.apiUrl, normalizeApiUrl(apiUrl));
}

export async function loadStoredSession() {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.session);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      return null;
    }

    return {
      ...parsedValue,
      apiUrl: isLegacyLocalApiUrl(parsedValue.apiUrl) ? "" : normalizeApiUrl(parsedValue.apiUrl),
    };
  } catch (_error) {
    return null;
  }
}

export async function saveSession(session) {
  await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}

export async function clearSession() {
  await AsyncStorage.multiRemove([STORAGE_KEYS.session, STORAGE_KEYS.licenseCache]);
}

export async function loadRememberedLogin() {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.rememberedLogin);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      return null;
    }

    return {
      ...parsedValue,
      apiUrl: isLegacyLocalApiUrl(parsedValue.apiUrl) ? "" : normalizeApiUrl(parsedValue.apiUrl),
    };
  } catch (_error) {
    return null;
  }
}

export async function saveRememberedLogin(payload) {
  await AsyncStorage.setItem(STORAGE_KEYS.rememberedLogin, JSON.stringify(payload));
}

export async function clearRememberedLogin() {
  await AsyncStorage.removeItem(STORAGE_KEYS.rememberedLogin);
}

export async function loadCachedLicense() {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.licenseCache);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}

export async function saveCachedLicense(payload) {
  await AsyncStorage.setItem(STORAGE_KEYS.licenseCache, JSON.stringify(payload));
}

export function canUseOfflineLicense(cachedLicense) {
  if (!cachedLicense?.license?.valid) {
    return false;
  }

  const offlineAccessUntil = Date.parse(cachedLicense.license.offlineAccessUntil || "");
  if (Number.isNaN(offlineAccessUntil)) {
    return false;
  }

  return Date.now() <= offlineAccessUntil;
}

async function requestJson(url, options) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (_error) {
    throw buildError("Nao foi possivel alcancar o servidor configurado.", 0);
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw buildError(payload.error || "Falha ao falar com o servidor.", response.status);
  }

  return payload;
}

export async function loginWithServer({ apiUrl, email, password, deviceId, deviceLabel }) {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  if (!normalizedApiUrl) {
    throw buildError("O servidor oficial do Controle AlfaTec ainda nao foi configurado.");
  }

  return requestJson(`${normalizedApiUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: `${email || ""}`.trim(),
      password,
      deviceId,
      deviceLabel,
    }),
  });
}

export async function validateLicense({ apiUrl, token, deviceId }) {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  if (!normalizedApiUrl) {
    throw buildError("Nenhum servidor publico foi configurado para esta versao do app.");
  }
  return requestJson(`${normalizedApiUrl}/api/license/validate`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Device-Id": deviceId,
    },
  });
}

export async function syncClientUsage({ apiUrl, token, deviceId, deviceLabel, studentCount, classCount, lastSavedAt }) {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  if (!normalizedApiUrl) {
    throw buildError("Nenhum servidor publico foi configurado para esta versao do app.");
  }
  return requestJson(`${normalizedApiUrl}/api/client/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Device-Id": deviceId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceId,
      deviceLabel,
      studentCount,
      classCount,
      lastSavedAt,
      platform: "android",
    }),
  });
}

export async function changeOwnPassword({ apiUrl, token, currentPassword, newPassword }) {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  if (!normalizedApiUrl) {
    throw buildError("Nenhum servidor publico foi configurado para esta versao do app.");
  }

  return requestJson(`${normalizedApiUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentPassword,
      newPassword,
    }),
  });
}
