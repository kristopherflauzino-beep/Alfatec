import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import LegacyApp from "../../App";
import {
  canUseOfflineLicense,
  clearRememberedLogin,
  clearSession,
  getOrCreateDeviceId,
  isLegacyLocalApiUrl,
  loadCachedLicense,
  loadRememberedLogin,
  loadStoredApiUrl,
  loadStoredSession,
  loginWithServer,
  probeApiUrlCandidate,
  saveApiUrl,
  saveCachedLicense,
  saveRememberedLogin,
  saveSession,
  syncClientUsage,
  validateLicense,
} from "./licenseClient";

const LICENSE_REFRESH_MS = 5 * 60 * 1000;
const GATE_LOGO = require("../../assets/alfatec-logo.png");

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR");
}

function buildOfflineReconnectMessage(cachedLicense) {
  return `O limite offline de 10 dias terminou em ${formatDateTime(cachedLicense?.license?.offlineAccessUntil)}. Conecte o aparelho a internet para validar a conta novamente e enviar os dados ao servidor.`;
}

function buildMobileDeviceLabel(deviceId) {
  const suffix = `${deviceId || ""}`.trim().split("-").pop()?.slice(0, 8) || "local";
  return `Android ${suffix}`;
}

function LoginScreen({
  email,
  password,
  deviceId,
  rememberLogin,
  busy,
  errorMessage,
  statusMessage,
  passwordVisible,
  onEmailChange,
  onPasswordChange,
  onTogglePasswordVisibility,
  onRememberLoginChange,
  onSubmit,
}) {
  return (
    <SafeAreaView style={styles.gateRoot}>
      <KeyboardAvoidingView
        style={styles.gateKeyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
      >
        <ScrollView contentContainerStyle={styles.gateScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.heroCard}>
            <View style={styles.logoShell}>
              <Image source={GATE_LOGO} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.eyebrow}>V2 controlada</Text>
            <Text style={styles.heroTitle}>APP De chamada ligado ao Controle AlfaTec</Text>
            <Text style={styles.heroText}>
              Esta versao valida a licenca com o servidor antes de liberar a chamada. O cliente gerente cria os usuarios
              dos professores e cada professor trabalha no proprio aparelho. Quando o servidor ficar sem contato, o app
              ainda funciona offline por ate 10 dias.
            </Text>
            {statusMessage ? <Text style={styles.statusInfo}>{statusMessage}</Text> : null}
          </View>

          <View style={styles.loginCard}>
            <Text style={styles.cardTitle}>Entrar</Text>
            <Text style={styles.inputHint}>
              Esta versao localiza automaticamente o servidor oficial do Controle AlfaTec. O usuario precisa informar
              somente email e senha.
            </Text>

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              value={email}
              onChangeText={onEmailChange}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              placeholder="seuemail@alfatec.com"
              placeholderTextColor="#7f8b91"
            />

            <Text style={styles.inputLabel}>Senha</Text>
            <TextInput
              value={password}
              onChangeText={onPasswordChange}
              secureTextEntry={!passwordVisible}
              style={styles.input}
              placeholder="Digite sua senha"
              placeholderTextColor="#7f8b91"
            />
            <TouchableOpacity onPress={onTogglePasswordVisibility} style={styles.passwordToggle} activeOpacity={0.86}>
              <Text style={styles.passwordToggleText}>{passwordVisible ? "Ocultar senha" : "Mostrar senha"}</Text>
            </TouchableOpacity>
            <Text style={styles.metaText}>ID deste aparelho: {deviceId || "Gerando identificador..."}</Text>

            <TouchableOpacity style={styles.rememberRow} onPress={onRememberLoginChange} activeOpacity={0.86}>
              <View style={[styles.checkbox, rememberLogin && styles.checkboxChecked]}>
                {rememberLogin ? <View style={styles.checkboxDot} /> : null}
              </View>
              <Text style={styles.rememberText}>Salvar login neste aparelho e entrar sozinho depois</Text>
            </TouchableOpacity>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <TouchableOpacity onPress={onSubmit} style={styles.primaryButton} disabled={busy}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Entrar e validar</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LockedScreen({ license, statusMessage, onRetry, onLogout }) {
  return (
    <SafeAreaView style={styles.gateRoot}>
      <View style={styles.centerPanel}>
        <View style={styles.centerCard}>
          <View style={styles.logoShell}>
            <Image source={GATE_LOGO} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.eyebrow}>Acesso bloqueado</Text>
          <Text style={styles.heroTitle}>A assinatura precisa de atencao</Text>
          <Text style={styles.heroText}>{license?.reason || statusMessage || "Nao foi possivel liberar o acesso."}</Text>
          <View style={styles.infoPanel}>
            <Text style={styles.infoRow}>Cliente: {license?.customerName || "-"}</Text>
            <Text style={styles.infoRow}>Plano: {license?.planName || "-"}</Text>
            <Text style={styles.infoRow}>Vencimento: {formatDateTime(license?.expiresAt)}</Text>
          </View>
          <TouchableOpacity onPress={onRetry} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Trocar de conta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function LoadingScreen({ message }) {
  return (
    <SafeAreaView style={styles.gateRoot}>
      <View style={styles.centerPanel}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#8a4f2d" />
          <Text style={styles.loadingText}>{message}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function AppV2() {
  const intervalRef = useRef(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");
  const [apiUrl, setApiUrl] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [session, setSession] = useState(null);
  const [license, setLicense] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      const [storedApiUrl, storedSession, cachedLicense, resolvedDeviceId, rememberedLoginData] = await Promise.all([
        loadStoredApiUrl(),
        loadStoredSession(),
        loadCachedLicense(),
        getOrCreateDeviceId(),
        loadRememberedLogin(),
      ]);

      const rememberedApiUrl = isLegacyLocalApiUrl(rememberedLoginData?.apiUrl) ? "" : rememberedLoginData?.apiUrl;
      const reachableRememberedApiUrl = await probeApiUrlCandidate(rememberedApiUrl);
      const preferredApiUrl = storedApiUrl || reachableRememberedApiUrl || "";
      setApiUrl(preferredApiUrl);
      setDeviceId(resolvedDeviceId);
      setRememberLogin(Boolean(rememberedLoginData?.enabled));

      if (rememberedLoginData?.email) {
        setEmail(rememberedLoginData.email);
      }
      if (rememberedLoginData?.password) {
        setPassword(rememberedLoginData.password);
      }

      if (storedSession) {
        setSession(storedSession);
        setEmail(rememberedLoginData?.email || storedSession.user?.email || "");

        const validationResult = await attemptValidation({
          activeApiUrl: preferredApiUrl,
          activeSession: storedSession,
          cachedLicense,
          silentNetworkFallback: true,
          activeDeviceId: resolvedDeviceId,
        });

        if (validationResult) {
          setBooting(false);
          return;
        }
      }

      if (rememberedLoginData?.enabled && rememberedLoginData.autoLogin && rememberedLoginData.email && rememberedLoginData.password) {
        try {
          const loginResult = await performLogin({
            activeApiUrl: preferredApiUrl,
            activeEmail: rememberedLoginData.email,
            activePassword: rememberedLoginData.password,
            activeDeviceId: resolvedDeviceId,
            shouldPersistSession: true,
          });

          if (!loginResult) {
            setMode("login");
          }
        } catch (error) {
          setStatusMessage(error.message || "Nao foi possivel restaurar a sessao salva.");
          setMode("login");
        }
      }

      if (!preferredApiUrl) {
        setStatusMessage(
          "A configuracao oficial do servidor ainda nao foi publicada corretamente. Conecte o app a internet e publique o arquivo oficial no GitHub para liberar o login."
        );
      }

      setBooting(false);
    }

    bootstrap().catch((error) => {
      setStatusMessage(error.message || "Falha ao iniciar a V2.");
      setBooting(false);
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mode !== "ready" || !session) {
      return undefined;
    }

    intervalRef.current = setInterval(() => {
      attemptValidation({
        activeApiUrl: apiUrl,
        activeSession: session,
        cachedLicense: null,
        silentNetworkFallback: true,
        activeDeviceId: deviceId,
      }).catch(() => undefined);
    }, LICENSE_REFRESH_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [apiUrl, deviceId, mode, session]);

  async function persistRememberedLogin(
    nextRememberLogin,
    nextApiUrl = apiUrl,
    nextEmail = email,
    nextPassword = password,
    nextAutoLogin = nextRememberLogin
  ) {
    if (nextRememberLogin) {
      await saveRememberedLogin({
        enabled: true,
        autoLogin: nextAutoLogin,
        apiUrl: nextApiUrl,
        email: nextEmail,
        password: nextPassword,
      });
      return;
    }

    await clearRememberedLogin();
  }

  async function attemptValidation({ activeApiUrl, activeSession, cachedLicense, silentNetworkFallback, activeDeviceId }) {
    try {
      const payload = await validateLicense({
        apiUrl: activeApiUrl,
        token: activeSession.token,
        deviceId: activeDeviceId || deviceId,
      });

      const nextCache = {
        checkedAt: new Date().toISOString(),
        license: payload.license,
      };

      setLicense(payload.license);
      setOfflineMode(false);
      setMode(payload.license.valid ? "ready" : "locked");
      setStatusMessage(payload.license.reason || "Licenca validada.");
      setErrorMessage("");
      await saveCachedLicense(nextCache);
      return payload;
    } catch (error) {
      if (cachedLicense && silentNetworkFallback && canUseOfflineLicense(cachedLicense)) {
        setLicense(cachedLicense.license);
        setOfflineMode(true);
        setMode("ready");
        setStatusMessage(
          `Servidor indisponivel. A V2 esta usando o cache offline ate ${formatDateTime(cachedLicense.license.offlineAccessUntil)}.`
        );
        setErrorMessage("");
        return cachedLicense;
      }

      if (cachedLicense?.license?.valid) {
        setOfflineMode(false);
        setMode("locked");
        setStatusMessage(buildOfflineReconnectMessage(cachedLicense));
        setErrorMessage(buildOfflineReconnectMessage(cachedLicense));
        return null;
      }

      setErrorMessage(error.message || "Nao foi possivel validar a licenca.");
      if (!silentNetworkFallback) {
        setStatusMessage("A validacao remota falhou.");
      }
      if (license?.valid) {
        setMode("locked");
      }
      return null;
    }
  }

  async function performLogin({ activeApiUrl, activeEmail, activePassword, activeDeviceId, shouldPersistSession }) {
    await saveApiUrl(activeApiUrl);
    await persistRememberedLogin(shouldPersistSession, activeApiUrl, activeEmail, activePassword, shouldPersistSession);

    const payload = await loginWithServer({
      apiUrl: activeApiUrl,
      email: activeEmail,
      password: activePassword,
      deviceId: activeDeviceId,
      deviceLabel: buildMobileDeviceLabel(activeDeviceId),
    });

    const nextSession = {
      token: payload.token,
      user: payload.user,
    };

    if (shouldPersistSession) {
      await saveSession(nextSession);
    } else {
      await clearSession();
    }

    setSession(nextSession);
    setLicense(payload.license);
    setStatusMessage("Login realizado. Validando licenca...");

    const cachedLicense = payload.license
      ? {
          checkedAt: new Date().toISOString(),
          license: payload.license,
        }
      : null;

    if (cachedLicense) {
      await saveCachedLicense(cachedLicense);
    }

    return attemptValidation({
      activeApiUrl,
      activeSession: nextSession,
      cachedLicense,
      silentNetworkFallback: true,
      activeDeviceId,
    });
  }

  async function handleLogin() {
    setBusy(true);
    setErrorMessage("");

    try {
      const validationResult = await performLogin({
        activeApiUrl: apiUrl,
        activeEmail: email,
        activePassword: password,
        activeDeviceId: deviceId,
        shouldPersistSession: rememberLogin,
      });

      if (!validationResult) {
        setMode("login");
      }
    } catch (error) {
      setErrorMessage(error.message || "Falha ao entrar.");
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }

  async function handleLogout() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    await clearSession();
    if (rememberLogin) {
      await persistRememberedLogin(true, apiUrl, email, password, false);
    } else {
      await clearRememberedLogin();
      setPassword("");
    }
    setSession(null);
    setLicense(null);
    setOfflineMode(false);
    setMode("login");
    setStatusMessage("Sessao encerrada.");
    setErrorMessage("");
  }

  async function handleRetry() {
    if (!session) {
      setMode("login");
      return;
    }

    setBusy(true);
    const cachedLicense = await loadCachedLicense();
    await attemptValidation({
      activeApiUrl: apiUrl,
      activeSession: session,
      cachedLicense,
      silentNetworkFallback: true,
      activeDeviceId: deviceId,
    });
    setBusy(false);
  }

  if (booting) {
    return <LoadingScreen message="Preparando a V2 e restaurando a sessao..." />;
  }

  if (!session || mode === "login") {
    return (
      <LoginScreen
        email={email}
        password={password}
        deviceId={deviceId}
        rememberLogin={rememberLogin}
        busy={busy}
        errorMessage={errorMessage}
        statusMessage={statusMessage}
        passwordVisible={passwordVisible}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onTogglePasswordVisibility={() => setPasswordVisible((current) => !current)}
        onRememberLoginChange={() => setRememberLogin((current) => !current)}
        onSubmit={handleLogin}
      />
    );
  }

  if (mode === "locked") {
    return <LockedScreen license={license} statusMessage={statusMessage} onRetry={handleRetry} onLogout={handleLogout} />;
  }

  return (
    <View style={styles.appRoot}>
      <SafeAreaView style={styles.bannerSafeArea}>
        <View style={[styles.banner, offlineMode ? styles.bannerOffline : styles.bannerOnline]}>
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>
              {offlineMode ? "V2 em modo offline controlado" : "V2 liberada por assinatura"}
            </Text>
            <Text style={styles.bannerText}>
              {license?.customerName || session.user?.displayName || "Cliente"} | {license?.planName || "Plano"} | vence{" "}
              {formatDateTime(license?.expiresAt)}
            </Text>
          </View>
          <View style={styles.bannerActions}>
            <TouchableOpacity onPress={handleRetry} style={styles.bannerButton}>
              <Text style={styles.bannerButtonText}>Revalidar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.bannerButton}>
              <Text style={styles.bannerButtonText}>Sair</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
      <View style={styles.legacyWrapper}>
        <LegacyApp
          sessionContext={session?.user}
          cloudSync={async (payload) => {
            if (!session?.token) {
              return;
            }
            try {
              await syncClientUsage({
                apiUrl,
                token: session.token,
                deviceId,
                deviceLabel: buildMobileDeviceLabel(deviceId),
                studentCount: payload.studentCount,
                classCount: payload.classCount,
                lastSavedAt: payload.lastSavedAt,
              });
            } catch (_error) {
              // O app principal continua funcionando mesmo se a telemetria falhar.
            }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: "#f3eadf",
  },
  bannerSafeArea: {
    backgroundColor: "#22313c",
  },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  bannerOnline: {
    backgroundColor: "#1f3e4b",
  },
  bannerOffline: {
    backgroundColor: "#7d5a25",
  },
  bannerCopy: {
    flex: 1,
    gap: 3,
  },
  bannerTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  bannerText: {
    color: "#edf4f7",
    fontSize: 12,
  },
  bannerActions: {
    flexDirection: "row",
    gap: 8,
  },
  bannerButton: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  legacyWrapper: {
    flex: 1,
  },
  gateRoot: {
    flex: 1,
    backgroundColor: "#efe4d6",
  },
  gateKeyboard: {
    flex: 1,
  },
  gateScroll: {
    padding: 20,
    gap: 16,
    flexGrow: 1,
    justifyContent: "center",
  },
  heroCard: {
    backgroundColor: "#24313a",
    borderRadius: 28,
    padding: 24,
    gap: 12,
  },
  logoShell: {
    alignSelf: "center",
    width: 168,
    height: 168,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.07)",
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  eyebrow: {
    color: "#f3b377",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: "#fffaf4",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
  },
  heroText: {
    color: "#d9e4e9",
    fontSize: 15,
    lineHeight: 22,
  },
  loginCard: {
    backgroundColor: "#fffdf8",
    borderRadius: 28,
    padding: 22,
    gap: 10,
  },
  cardTitle: {
    color: "#22313c",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  inputLabel: {
    color: "#5d6d77",
    fontWeight: "600",
    marginTop: 8,
  },
  input: {
    backgroundColor: "#f7f0e7",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ead8c8",
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#22313c",
  },
  inputHint: {
    color: "#6e7c84",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  metaText: {
    color: "#617179",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  passwordToggle: {
    alignSelf: "flex-end",
    marginTop: 6,
  },
  passwordToggleText: {
    color: "#8a4f2d",
    fontSize: 12,
    fontWeight: "700",
  },
  rememberRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#cba886",
    backgroundColor: "#fff8f1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#8a4f2d",
    borderColor: "#8a4f2d",
  },
  checkboxDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: "#ffffff",
  },
  rememberText: {
    flex: 1,
    color: "#50616a",
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: "#8a4f2d",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d9c8b6",
  },
  secondaryButtonText: {
    color: "#22313c",
    fontWeight: "700",
  },
  errorText: {
    color: "#a33c3c",
    marginTop: 6,
  },
  statusInfo: {
    color: "#f7d6bc",
    marginTop: 2,
    lineHeight: 20,
  },
  centerPanel: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  centerCard: {
    backgroundColor: "#24313a",
    borderRadius: 28,
    padding: 22,
    gap: 14,
  },
  loadingCard: {
    backgroundColor: "#fffdf8",
    borderRadius: 28,
    padding: 24,
    gap: 14,
    alignItems: "center",
  },
  infoPanel: {
    backgroundColor: "#fffdf8",
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  infoRow: {
    color: "#22313c",
  },
  loadingText: {
    marginTop: 14,
    color: "#4f606a",
    fontSize: 15,
  },
});
