import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from tkinter import BooleanVar, StringVar, Tk, messagebox, ttk
from urllib import error, request
from urllib.parse import urlparse
from uuid import uuid4

from app_desktop import APP_TITLE, AttendanceDesktopApp, resolve_storage_dir


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_API_URL = "http://localhost:8787"
SESSION_FILE = resolve_storage_dir() / "license_v2_session.json"


def detect_device_label():
    computer_name = (os.environ.get("COMPUTERNAME") or "").strip()
    if computer_name:
        return computer_name
    return "Computador Windows"


def resolve_bundle_v2_dir():
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "v2"
    return ROOT_DIR / "v2"


def resolve_runtime_v2_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "dados_chamada_v2" / "v2"
    return ROOT_DIR / "dados_chamada_v2" / "v2"


def sync_runtime_v2_dir():
    source_dir = resolve_bundle_v2_dir()
    runtime_dir = resolve_runtime_v2_dir()
    runtime_dir.mkdir(parents=True, exist_ok=True)

    if not source_dir.exists():
        return runtime_dir

    for source_path in source_dir.rglob("*"):
        relative_path = source_path.relative_to(source_dir)
        target_path = runtime_dir / relative_path

        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue

        if relative_path.as_posix() == "backend/data/store.json" and target_path.exists():
            continue

        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)

    return runtime_dir


RUNTIME_V2_DIR = resolve_runtime_v2_dir()


def resolve_node_command():
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        bundled_node = Path(sys._MEIPASS) / "node.exe"
        if bundled_node.exists():
            return str(bundled_node)
    return "node"


def create_hidden_process(command, cwd):
    startupinfo = None
    creationflags = 0

    if sys.platform.startswith("win"):
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        creationflags = subprocess.CREATE_NO_WINDOW

    return subprocess.Popen(
        command,
        cwd=str(cwd),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        startupinfo=startupinfo,
        creationflags=creationflags,
    )


def relaunch_client_process():
    if getattr(sys, "frozen", False):
        create_hidden_process([sys.executable], Path(sys.executable).resolve().parent)
        return

    create_hidden_process([sys.executable, str(Path(__file__).resolve())], ROOT_DIR)


def ensure_session_dir():
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)


def load_session_state():
    ensure_session_dir()
    default_state = {
        "api_url": DEFAULT_API_URL,
        "email": "cliente@alfatec.com",
        "token": "",
        "user": None,
        "device_id": f"desktop-{uuid4().hex}",
        "cached_license": None,
        "remember_login": False,
        "saved_password": "",
        "auto_login": False,
    }

    if not SESSION_FILE.exists():
        return default_state

    try:
        with SESSION_FILE.open("r", encoding="utf-8") as file_handle:
            loaded = json.load(file_handle)
    except Exception:
        loaded = {}

    return {
        **default_state,
        "api_url": loaded.get("api_url") or DEFAULT_API_URL,
        "email": loaded.get("email") or default_state["email"],
        "token": loaded.get("token") or "",
        "user": loaded.get("user"),
        "device_id": loaded.get("device_id") or default_state["device_id"],
        "cached_license": loaded.get("cached_license"),
        "remember_login": bool(loaded.get("remember_login")),
        "saved_password": loaded.get("saved_password") or "",
        "auto_login": bool(loaded.get("auto_login")),
    }


def save_session_state(state):
    ensure_session_dir()
    with SESSION_FILE.open("w", encoding="utf-8") as file_handle:
        json.dump(state, file_handle, ensure_ascii=False, indent=2)


def normalize_api_url(value):
    return str(value or "").strip().rstrip("/")


def normalize_login_email(value):
    raw_value = str(value or "").strip().lower()
    if not raw_value:
        return ""
    if raw_value == "admin":
        return "admin@alfatec.com"
    local_part = raw_value.split("@")[0]
    local_part = ".".join(fragment for fragment in "".join(
        character if character.isalnum() else "."
        for character in local_part
    ).split(".") if fragment)
    if not local_part:
        return ""
    return f"{local_part}@alfatec.com"


def build_health_url(api_url):
    return f"{normalize_api_url(api_url)}/api/health"


def read_health(api_url, timeout=2):
    try:
        with request.urlopen(build_health_url(api_url), timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def is_local_api_url(api_url):
    normalized_url = normalize_api_url(api_url)
    if not normalized_url:
        return False

    parsed_url = urlparse(normalized_url if "://" in normalized_url else f"http://{normalized_url}")
    host = (parsed_url.hostname or "").lower()
    port = parsed_url.port or 8787
    return host in {"localhost", "127.0.0.1", "::1"} and port == 8787


def wait_for_health(api_url, attempts=24, delay_seconds=0.35):
    for _ in range(attempts):
        health = read_health(api_url)
        if health:
            return health
        time.sleep(delay_seconds)
    return None


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        from datetime import datetime

        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def format_iso_datetime(value):
    parsed_value = parse_iso_datetime(value)
    if not parsed_value:
        return value or "-"
    return parsed_value.astimezone().strftime("%d/%m/%Y %H:%M")


def can_use_offline_license(cached_license):
    license_data = (cached_license or {}).get("license") or {}
    if not license_data.get("valid"):
        return False

    offline_access_until = parse_iso_datetime(license_data.get("offlineAccessUntil"))
    if not offline_access_until:
        return False

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return now <= offline_access_until.astimezone(timezone.utc)


def build_offline_reconnect_message(cached_license):
    license_data = (cached_license or {}).get("license") or {}
    offline_limit = format_iso_datetime(license_data.get("offlineAccessUntil"))
    return (
        "O limite offline de 10 dias terminou"
        f" em {offline_limit}. Conecte este computador a internet para validar a conta "
        "novamente e enviar os dados ao servidor."
    )


def build_json_request(url, method="GET", payload=None, token="", device_id=""):
    headers = {
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if device_id:
        headers["X-Device-Id"] = device_id

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    return request.Request(url, data=data, headers=headers, method=method)


def perform_request(url, method="GET", payload=None, token="", device_id=""):
    req = build_json_request(url, method=method, payload=payload, token=token, device_id=device_id)

    try:
        with request.urlopen(req, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        response_text = exc.read().decode("utf-8", errors="ignore").strip()
        try:
            payload = json.loads(response_text) if response_text else {}
        except Exception:
            payload = {}
        raise RuntimeError(payload.get("error") or f"Servidor retornou erro {exc.code}.") from exc
    except error.URLError as exc:
        raise ConnectionError("Nao foi possivel alcancar o servidor da assinatura.") from exc


class DesktopLicenseGate:
    def __init__(self):
        self.state = load_session_state()
        self.server_process = None
        sync_runtime_v2_dir()
        self.root = Tk()
        self.root.title(f"{APP_TITLE} V2")
        self.root.geometry("560x460")
        self.root.minsize(560, 460)
        self.root.configure(bg="#efe3d5")

        self.api_url_var = StringVar(value=self.state["api_url"])
        self.email_var = StringVar(value=self.state["email"])
        self.password_var = StringVar(
            value=self.state["saved_password"] or ("demo123" if self.state["email"] == "cliente@alfatec.com" else "")
        )
        self.remember_login_var = BooleanVar(value=self.state["remember_login"])
        self.status_var = StringVar(value="Aguardando validacao da assinatura.")
        self.device_var = StringVar(value=self.state["device_id"])
        self.device_label = detect_device_label()

        self.build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(120, self.bootstrap)

    def build_ui(self):
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("Card.TFrame", background="#fffdf8")
        style.configure("Title.TLabel", background="#efe3d5", foreground="#22313c", font=("Segoe UI", 20, "bold"))
        style.configure("Body.TLabel", background="#fffdf8", foreground="#4e5f69", font=("Segoe UI", 10))
        style.configure("Info.TLabel", background="#fffdf8", foreground="#22313c", font=("Segoe UI", 10, "bold"))

        container = ttk.Frame(self.root, padding=20, style="Card.TFrame")
        container.pack(fill="both", expand=True, padx=20, pady=20)

        ttk.Label(container, text="APP de chamada V2", style="Title.TLabel", background="#fffdf8").pack(anchor="w")
        ttk.Label(
            container,
            text="A versao desktop valida a assinatura com o Controle AlfaTec antes de abrir o app principal.",
            style="Body.TLabel",
            wraplength=470,
        ).pack(anchor="w", pady=(8, 16))

        form = ttk.Frame(container, style="Card.TFrame")
        form.pack(fill="x")
        form.columnconfigure(1, weight=1)

        self.add_entry(form, "Servidor", self.api_url_var, 0)
        self.add_entry(form, "Email", self.email_var, 1)
        self.add_entry(form, "Senha", self.password_var, 2, show="*")
        self.add_entry(form, "Dispositivo", self.device_var, 3)

        ttk.Checkbutton(
            container,
            text="Salvar login nesta maquina e entrar sozinho da proxima vez",
            variable=self.remember_login_var,
        ).pack(anchor="w", pady=(14, 0))

        ttk.Label(container, textvariable=self.status_var, style="Body.TLabel", wraplength=470).pack(anchor="w", pady=(18, 14))

        actions = ttk.Frame(container, style="Card.TFrame")
        actions.pack(fill="x")
        ttk.Button(actions, text="Entrar e validar", command=self.handle_login).pack(side="left")
        ttk.Button(actions, text="Tentar novamente", command=self.bootstrap).pack(side="left", padx=(10, 0))
        ttk.Button(actions, text="Limpar sessao", command=lambda: self.clear_session(clear_saved_login=True)).pack(side="left", padx=(10, 0))

    def add_entry(self, parent, label, variable, row, show=None):
        ttk.Label(parent, text=label, style="Info.TLabel").grid(row=row, column=0, sticky="w", pady=(0 if row == 0 else 10, 4))
        entry = ttk.Entry(parent, textvariable=variable, show=show)
        entry.grid(row=row, column=1, sticky="ew", padx=(12, 0), pady=(0 if row == 0 else 10, 4))

    def build_persisted_state(self):
        remember_login = bool(self.remember_login_var.get())
        persisted_state = {
            "api_url": normalize_api_url(self.api_url_var.get()),
            "email": normalize_login_email(self.email_var.get()),
            "device_id": self.device_var.get().strip() or self.state["device_id"],
            "remember_login": remember_login,
            "saved_password": self.password_var.get() if remember_login else "",
            "auto_login": bool(self.state.get("auto_login")) if remember_login else False,
            "token": self.state.get("token", "") if remember_login else "",
            "user": self.state.get("user") if remember_login else None,
            "cached_license": self.state.get("cached_license") if remember_login else None,
        }
        return persisted_state

    def persist_state(self):
        self.state["api_url"] = normalize_api_url(self.api_url_var.get())
        self.state["email"] = normalize_login_email(self.email_var.get())
        self.state["device_id"] = self.device_var.get().strip() or self.state["device_id"]
        save_session_state(self.build_persisted_state())

    def clear_session(self, clear_saved_login=False):
        self.state["token"] = ""
        self.state["user"] = None
        self.state["cached_license"] = None
        self.state["auto_login"] = False
        if clear_saved_login:
            self.remember_login_var.set(False)
            self.password_var.set("")
        self.status_var.set("Sessao removida. Informe outra conta.")
        self.persist_state()

    def ensure_local_server(self, api_url, update_status=True):
        normalized_url = normalize_api_url(api_url)
        if not is_local_api_url(normalized_url):
            return read_health(normalized_url)

        health = read_health(normalized_url)
        if health:
            return health

        runtime_dir = sync_runtime_v2_dir()
        server_script = runtime_dir / "backend" / "server.js"
        if not server_script.exists():
            if update_status:
                self.status_var.set("O backend local da V2 nao foi encontrado.")
            return None

        if self.server_process and self.server_process.poll() is None:
            return wait_for_health(normalized_url)

        try:
            if update_status:
                self.status_var.set("Iniciando o servidor local da V2...")
            self.server_process = create_hidden_process([resolve_node_command(), str(server_script)], runtime_dir)
        except FileNotFoundError:
            if update_status:
                self.status_var.set("Nao foi possivel iniciar o servidor local automaticamente.")
            return None
        except Exception as exc:
            if update_status:
                self.status_var.set(f"Nao foi possivel iniciar o servidor local automaticamente: {exc}")
            return None

        health = wait_for_health(normalized_url)
        if health:
            if update_status:
                self.status_var.set("Servidor local da V2 iniciado automaticamente.")
            return health

        if update_status:
            self.status_var.set("O servidor local da V2 foi iniciado, mas ainda nao respondeu.")
        return None

    def bootstrap(self):
        self.persist_state()
        api_url = normalize_api_url(self.api_url_var.get())
        local_health = self.ensure_local_server(api_url, update_status=False)

        if self.state.get("token") and self.state.get("user"):
            result = self.validate_current_session(silent_network_fallback=True)
            if result and result.get("valid"):
                self.launch_legacy_app()
                return

        if self.remember_login_var.get() and self.state.get("auto_login") and self.password_var.get().strip():
            self.status_var.set("Restaurando login salvo...")
            if self.perform_login(show_errors=False):
                return

        if local_health and is_local_api_url(api_url):
            self.status_var.set("Servidor local pronto. Entre com uma conta para validar a assinatura.")
        else:
            self.status_var.set("Entre com uma conta para validar a assinatura.")

    def validate_current_session(self, silent_network_fallback):
        api_url = normalize_api_url(self.api_url_var.get())
        token = self.state.get("token", "")
        device_id = self.device_var.get().strip()
        self.ensure_local_server(api_url, update_status=False)

        try:
            payload = perform_request(
                f"{api_url}/api/license/validate",
                method="GET",
                token=token,
                device_id=device_id,
            )
            self.state["cached_license"] = {
                "checkedAt": payload.get("serverTime"),
                "license": payload.get("license"),
            }
            self.persist_state()
            license_data = payload.get("license") or {}
            self.status_var.set(license_data.get("reason") or "Licenca validada.")
            return license_data
        except ConnectionError:
            cached_license = self.state.get("cached_license")
            if silent_network_fallback and can_use_offline_license(cached_license):
                license_data = cached_license.get("license") or {}
                self.status_var.set(
                    "Servidor indisponivel. Usando cache offline ate "
                    f"{format_iso_datetime(license_data.get('offlineAccessUntil'))}."
                )
                return license_data
            if (cached_license or {}).get("license", {}).get("valid"):
                self.status_var.set(build_offline_reconnect_message(cached_license))
                return None
            self.status_var.set("Nao foi possivel alcancar o servidor da assinatura.")
            return None
        except Exception as exc:
            self.status_var.set(str(exc))
            return None

    def perform_login(self, show_errors=True):
        api_url = normalize_api_url(self.api_url_var.get())
        email = normalize_login_email(self.email_var.get())
        password = self.password_var.get()
        device_id = self.device_var.get().strip()

        if not api_url or not email or not password:
            if show_errors:
                messagebox.showwarning(f"{APP_TITLE} V2", "Informe servidor, email e senha.")
            return False

        if is_local_api_url(api_url) and not self.ensure_local_server(api_url, update_status=True):
            return False

        try:
            payload = perform_request(
                f"{api_url}/api/auth/login",
                method="POST",
                payload={
                    "email": email,
                    "password": password,
                    "deviceId": device_id,
                    "deviceLabel": self.device_label,
                },
            )
        except Exception as exc:
            if isinstance(exc, ConnectionError):
                cached_license = self.state.get("cached_license")
                if (cached_license or {}).get("license", {}).get("valid") and not can_use_offline_license(cached_license):
                    self.status_var.set(build_offline_reconnect_message(cached_license))
                    return False
            self.status_var.set(str(exc))
            return False

        self.state["token"] = payload.get("token", "")
        self.state["user"] = payload.get("user")
        self.state["email"] = email
        self.email_var.set(email)
        self.state["auto_login"] = bool(self.remember_login_var.get())
        if payload.get("license"):
            self.state["cached_license"] = {
                "checkedAt": payload.get("serverTime"),
                "license": payload.get("license"),
            }
        self.persist_state()

        license_data = self.validate_current_session(silent_network_fallback=True)
        if not license_data:
            return False
        if not license_data.get("valid"):
            if show_errors:
                messagebox.showinfo(f"{APP_TITLE} V2", license_data.get("reason") or "A conta nao esta liberada.")
            return False

        self.launch_legacy_app()
        return True

    def handle_login(self):
        self.perform_login(show_errors=True)

    def sync_client_usage(self, payload):
        token = self.state.get("token", "")
        if not token:
            return

        perform_request(
            f"{normalize_api_url(self.state.get('api_url'))}/api/client/sync",
            method="POST",
            payload=payload,
            token=token,
            device_id=self.state.get("device_id", ""),
        )

    def handle_legacy_logout(self):
        self.state["token"] = ""
        self.state["user"] = None
        self.state["cached_license"] = None
        self.state["auto_login"] = False
        self.persist_state()
        relaunch_client_process()

    def launch_legacy_app(self):
        self.root.destroy()
        AttendanceDesktopApp(
            session_context={
                "email": self.state.get("email"),
                "displayName": (self.state.get("user") or {}).get("displayName"),
                "device_label": self.device_label,
            },
            on_logout=self.handle_legacy_logout,
            cloud_sync_callback=self.sync_client_usage,
        ).run()

    def on_close(self):
        self.persist_state()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    DesktopLicenseGate().run()
