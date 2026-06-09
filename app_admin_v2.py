import json
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path
from tkinter import BooleanVar, StringVar, Tk, messagebox, ttk
from urllib import error, request


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_PORT = 8787
DEFAULT_BASE_URL = f"http://localhost:{DEFAULT_PORT}"
ADMIN_URL = f"{DEFAULT_BASE_URL}/admin"
HEALTH_URL = f"{DEFAULT_BASE_URL}/api/health"


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


RUNTIME_V2_DIR = sync_runtime_v2_dir()
SERVER_SCRIPT = RUNTIME_V2_DIR / "backend" / "server.js"
STORE_FILE = RUNTIME_V2_DIR / "backend" / "data" / "store.json"


def resolve_node_command():
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        bundled_node = Path(sys._MEIPASS) / "node.exe"
        if bundled_node.exists():
            return str(bundled_node)
    return "node"


def read_health():
    try:
        with request.urlopen(HEALTH_URL, timeout=2) as response:
            return json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


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


class AdminControlApp:
    def __init__(self):
        self.server_process = None
        self.root = Tk()
        self.root.title("Controle AlfaTec")
        self.root.geometry("760x560")
        self.root.minsize(760, 560)
        self.root.configure(bg="#efe5d7")

        self.status_var = StringVar(value="Verificando o servidor local...")
        self.url_var = StringVar(value=ADMIN_URL)
        self.health_var = StringVar(value="Sem resposta ainda.")
        self.admin_cred_var = StringVar(value="admin@alfatec.com / admin123")
        self.client_cred_var = StringVar(value="cliente@alfatec.com / demo123")
        self.store_var = StringVar(value=str(STORE_FILE))
        self.auto_open_var = BooleanVar(value=True)

        self.build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(120, self.refresh_status)

    def build_ui(self):
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("Shell.TFrame", background="#efe5d7")
        style.configure("Panel.TFrame", background="#fffdf8")
        style.configure("Hero.TFrame", background="#24313a")
        style.configure("Hero.TLabel", background="#24313a", foreground="#fffaf4", font=("Segoe UI", 22, "bold"))
        style.configure("HeroBody.TLabel", background="#24313a", foreground="#d8e2e7", font=("Segoe UI", 10))
        style.configure("PanelTitle.TLabel", background="#fffdf8", foreground="#22313c", font=("Segoe UI", 13, "bold"))
        style.configure("Body.TLabel", background="#fffdf8", foreground="#4f606a", font=("Segoe UI", 10))
        style.configure("Info.TLabel", background="#f7f0e7", foreground="#22313c", font=("Segoe UI", 10, "bold"))
        style.configure("Accent.TButton", font=("Segoe UI", 10, "bold"))

        shell = ttk.Frame(self.root, padding=18, style="Shell.TFrame")
        shell.pack(fill="both", expand=True)
        shell.columnconfigure(0, weight=1)

        hero = ttk.Frame(shell, padding=22, style="Hero.TFrame")
        hero.grid(row=0, column=0, sticky="ew")

        hero_banner = ttk.Frame(hero, padding=18, style="Hero.TFrame")
        hero_banner.pack(fill="both", expand=True)
        hero_banner["padding"] = 0

        hero_canvas = ttk.Frame(hero, style="Hero.TFrame")
        hero_canvas.pack(fill="both", expand=True)

        hero_text = ttk.Frame(hero_canvas, padding=22, style="Hero.TFrame")
        hero_text.pack(fill="both", expand=True)
        hero_text["padding"] = 0

        hero_bg = ttk.Frame(hero_text, style="Hero.TFrame")
        hero_bg.pack(fill="both", expand=True)

        hero_card = ttk.Frame(hero_bg, padding=22, style="Hero.TFrame")
        hero_card.pack(fill="both", expand=True)

        hero_label = ttk.Label(
            hero_card,
            text="Controle AlfaTec",
            style="Hero.TLabel",
        )
        hero_label.pack(fill="x")
        ttk.Label(
            hero_card,
            text="Este programa sobe o servidor local da V2 e abre o painel central para controlar clientes, usuarios, dispositivos e bloqueio remoto.",
            style="HeroBody.TLabel",
            wraplength=660,
        ).pack(anchor="w", pady=(10, 0))

        status_panel = ttk.Frame(shell, padding=16, style="Panel.TFrame")
        status_panel.grid(row=1, column=0, sticky="ew", pady=(14, 0))
        status_panel.columnconfigure(0, weight=1)
        status_panel.columnconfigure(1, weight=1)

        left_col = ttk.Frame(status_panel, style="Panel.TFrame")
        left_col.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        right_col = ttk.Frame(status_panel, style="Panel.TFrame")
        right_col.grid(row=0, column=1, sticky="nsew", padx=(8, 0))

        self.build_info_block(left_col, "Status do servidor", self.status_var)
        self.build_info_block(left_col, "Health check", self.health_var)
        self.build_info_block(right_col, "Painel Controle AlfaTec", self.url_var)
        self.build_info_block(right_col, "Arquivo de dados", self.store_var)

        actions_panel = ttk.Frame(shell, padding=16, style="Panel.TFrame")
        actions_panel.grid(row=2, column=0, sticky="ew", pady=(14, 0))

        ttk.Label(actions_panel, text="Ações rápidas", style="PanelTitle.TLabel").pack(anchor="w")

        top_actions = ttk.Frame(actions_panel, style="Panel.TFrame")
        top_actions.pack(fill="x", pady=(12, 8))
        ttk.Button(top_actions, text="Iniciar servidor", command=self.start_server).pack(side="left")
        ttk.Button(top_actions, text="Parar servidor", command=self.stop_server).pack(side="left", padx=(10, 0))
        ttk.Button(top_actions, text="Abrir Controle AlfaTec", command=self.open_admin).pack(side="left", padx=(10, 0))

        bottom_actions = ttk.Frame(actions_panel, style="Panel.TFrame")
        bottom_actions.pack(fill="x")
        ttk.Button(bottom_actions, text="Abrir pasta de dados", command=self.open_data_folder).pack(side="left")
        ttk.Button(bottom_actions, text="Atualizar status", command=self.refresh_status).pack(side="left", padx=(10, 0))
        ttk.Checkbutton(
            bottom_actions,
            text="Abrir o site automaticamente ao iniciar",
            variable=self.auto_open_var,
        ).pack(side="left", padx=(18, 0))

        creds_panel = ttk.Frame(shell, padding=16, style="Panel.TFrame")
        creds_panel.grid(row=3, column=0, sticky="nsew", pady=(14, 0))
        creds_panel.columnconfigure(0, weight=1)
        creds_panel.columnconfigure(1, weight=1)

        admin_block = ttk.Frame(creds_panel, style="Panel.TFrame")
        admin_block.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        client_block = ttk.Frame(creds_panel, style="Panel.TFrame")
        client_block.grid(row=0, column=1, sticky="nsew", padx=(8, 0))

        self.build_info_block(admin_block, "Credencial admin inicial", self.admin_cred_var, copy_value=True)
        self.build_info_block(client_block, "Credencial cliente demo", self.client_cred_var, copy_value=True)

        help_panel = ttk.Frame(shell, padding=16, style="Panel.TFrame")
        help_panel.grid(row=4, column=0, sticky="ew", pady=(14, 0))
        ttk.Label(help_panel, text="Fluxo de uso", style="PanelTitle.TLabel").pack(anchor="w")
        ttk.Label(
            help_panel,
            text=(
                "1. Clique em Iniciar servidor.\n"
                "2. Abra o Controle AlfaTec.\n"
                "3. Entre com a conta admin.\n"
                "4. Cadastre clientes e controle usuarios, vencimento, senha e dispositivos."
            ),
            style="Body.TLabel",
            justify="left",
        ).pack(anchor="w", pady=(10, 0))

    def build_info_block(self, parent, title, variable, copy_value=False):
        ttk.Label(parent, text=title, style="PanelTitle.TLabel").pack(anchor="w")

        wrapper = ttk.Frame(parent, padding=10, style="Panel.TFrame")
        wrapper.pack(fill="x", pady=(8, 10))

        value_box = ttk.Label(
            wrapper,
            textvariable=variable,
            style="Info.TLabel",
            anchor="w",
            justify="left",
            wraplength=300,
            padding=10,
        )
        value_box.pack(side="left", fill="x", expand=True)

        if copy_value:
            ttk.Button(wrapper, text="Copiar", command=lambda: self.copy_text(variable.get())).pack(side="left", padx=(10, 0))

    def copy_text(self, value):
        self.root.clipboard_clear()
        self.root.clipboard_append(value)
        self.status_var.set("Texto copiado para a área de transferência.")

    def open_admin(self):
        webbrowser.open(self.url_var.get())

    def open_data_folder(self):
        data_dir = STORE_FILE.parent
        data_dir.mkdir(parents=True, exist_ok=True)
        try:
            if sys.platform.startswith("win"):
                subprocess.Popen(["explorer", str(data_dir)])
            else:
                webbrowser.open(data_dir.as_uri())
        except Exception:
            messagebox.showinfo("Admin V2", f"A pasta de dados fica em:\n{data_dir}")

    def update_from_health(self, health):
        if health:
            self.status_var.set(f"Servidor ativo em {DEFAULT_BASE_URL}.")
            self.health_var.set(f"OK | {health.get('serverName', 'Chamada V2')} | {health.get('serverTime', '-')}")
        else:
            if self.server_process and self.server_process.poll() is not None:
                self.server_process = None
            self.status_var.set("Servidor parado ou sem resposta.")
            self.health_var.set("Sem resposta no endpoint /api/health.")

    def refresh_status(self):
        health = read_health()
        self.update_from_health(health)

    def start_server(self):
        existing = read_health()
        if existing:
            self.update_from_health(existing)
            if self.auto_open_var.get():
                self.open_admin()
            return

        if not SERVER_SCRIPT.exists():
            messagebox.showerror("Admin V2", f"Servidor não encontrado em:\n{SERVER_SCRIPT}")
            return

        try:
            self.server_process = create_hidden_process([resolve_node_command(), str(SERVER_SCRIPT)], RUNTIME_V2_DIR)
        except FileNotFoundError:
            messagebox.showerror("Admin V2", "O Node.js não foi encontrado no computador.")
            return
        except Exception as exc:
            messagebox.showerror("Admin V2", f"Não foi possível iniciar o servidor.\n\n{exc}")
            return

        self.status_var.set("Inicializando o servidor local da V2...")
        threading.Thread(target=self.wait_until_server_ready, daemon=True).start()

    def wait_until_server_ready(self):
        import time

        for _ in range(20):
            health = read_health()
            if health:
                self.root.after(0, lambda payload=health: self.on_server_ready(payload))
                return
            time.sleep(0.35)

        self.root.after(0, self.on_server_start_failed)

    def on_server_ready(self, health):
        self.update_from_health(health)
        if self.auto_open_var.get():
            self.open_admin()

    def on_server_start_failed(self):
        if self.server_process and self.server_process.poll() is None:
            self.status_var.set("O servidor iniciou, mas ainda não respondeu ao health check.")
            return
        self.status_var.set("Não foi possível iniciar o servidor local da V2.")

    def stop_server(self):
        if self.server_process and self.server_process.poll() is None:
            self.server_process.terminate()
            try:
                self.server_process.wait(timeout=3)
            except Exception:
                self.server_process.kill()
            self.server_process = None
            self.status_var.set("Servidor local encerrado.")
            self.health_var.set("Sem resposta no endpoint /api/health.")
            return

        if read_health():
            messagebox.showinfo(
                "Admin V2",
                "Existe um servidor ativo, mas ele não foi iniciado por este launcher.\nFeche-o pela janela/processo que o iniciou.",
            )
            return

        self.status_var.set("Nenhum servidor iniciado por este programa.")

    def on_close(self):
        if self.server_process and self.server_process.poll() is None:
            should_stop = messagebox.askyesno(
                "Admin V2",
                "Deseja encerrar também o servidor local da V2 ao fechar este programa?",
            )
            if should_stop:
                self.stop_server()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    AdminControlApp().run()
