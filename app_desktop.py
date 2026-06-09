import json
import os
import sys
import threading
import tkinter as tk
import unicodedata
from html import escape as escape_html
from datetime import datetime
from pathlib import Path
from tkinter import END, StringVar, Text, Tk
from tkinter import messagebox, ttk
from tkinter.scrolledtext import ScrolledText
from uuid import uuid4
from PIL import Image, ImageTk
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image as ReportImage, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


APP_TITLE = "APP De chamada"
NOTE_KEYS = ["note1", "note2", "note3", "note4"]


def resolve_storage_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "dados_chamada"
    return Path(__file__).resolve().parent / "dados_chamada"


def resolve_asset_dir():
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "assets"
    return Path(__file__).resolve().parent / "assets"


LOCAL_DATA_DIR = resolve_storage_dir()
DATA_FILE = LOCAL_DATA_DIR / "chamada_data.json"
REPORTS_DIR = LOCAL_DATA_DIR / "relatorios"
ASSET_DIR = resolve_asset_dir()
LOGO_FILE = ASSET_DIR / "alfatec-logo.png"
REPORT_LOGO_FILE = ASSET_DIR / "report-logo.png"
ICON_FILE = ASSET_DIR / "app-icon.ico"


def current_timestamp():
    return int(datetime.now().timestamp())


def format_datetime(timestamp):
    if not timestamp:
        return "-"
    return datetime.fromtimestamp(timestamp).strftime("%d/%m/%Y %H:%M")


def format_live_datetime():
    return datetime.now().strftime("%A, %d/%m/%Y %H:%M")


def format_date(timestamp):
    if not timestamp:
        return "-"
    return datetime.fromtimestamp(timestamp).strftime("%d/%m/%Y")


def format_grade(value):
    if value is None:
        return "-"
    return f"{value:.1f}".replace(".", ",")


def text_value(value, fallback=""):
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def number_or_zero(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def number_or_none(value):
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None


def parse_non_negative_int(value, field_label):
    text = text_value(value)
    if not text:
        return 0
    if not text.isdigit():
        raise ValueError(f"Digite um numero inteiro valido em {field_label}.")
    return int(text)


def today_date_text():
    return datetime.now().strftime("%d/%m/%Y")


def parse_date_text(date_text):
    try:
        return datetime.strptime(date_text.strip(), "%d/%m/%Y")
    except (TypeError, ValueError):
        return None


def sanitize_filename(value):
    cleaned = "".join(character.lower() if character.isalnum() else "-" for character in value)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-") or "relatorio"


def create_default_classes(count=3):
    return [
        {
            "id": f"class-{index + 1}",
            "name": f"Turma {index + 1}",
            "students": [],
        }
        for index in range(count)
    ]


def create_initial_state():
    default_classes = create_default_classes()
    return {
        "selected_class_id": default_classes[0]["id"],
        "last_reset_at": None,
        "classes": default_classes,
    }


def sortable_student_name(value):
    normalized = unicodedata.normalize("NFKD", text_value(value, ""))
    return normalized.encode("ascii", "ignore").decode("ascii").casefold()


def sort_students_by_name(students):
    return sorted(
        students,
        key=lambda student: (
            sortable_student_name(student.get("name")),
            number_or_zero(student.get("created_at")),
            text_value(student.get("id")),
        ),
    )


def student_initial(value):
    return text_value(value, "A")[0].upper()


def normalize_student(raw_student):
    created_at = raw_student.get("created_at") or current_timestamp()
    updated_at = raw_student.get("updated_at") or created_at
    raw_history = raw_student.get("attendance_history") if isinstance(raw_student.get("attendance_history"), list) else []
    attendance_history = []
    for history_entry in raw_history:
        if not isinstance(history_entry, dict):
            continue
        timestamp = history_entry.get("timestamp")
        status = history_entry.get("status")
        if not timestamp or status not in {"presence", "absence"}:
            continue
        attendance_history.append({"timestamp": timestamp, "status": status})
    attendance_history.sort(key=lambda item: item["timestamp"])
    return {
        "id": raw_student.get("id") or f"student-{uuid4().hex}",
        "name": text_value(raw_student.get("name"), "Aluno sem nome"),
        "grade_level": text_value(raw_student.get("grade_level"), "-"),
        "note1": text_value(raw_student.get("note1")),
        "note2": text_value(raw_student.get("note2")),
        "note3": text_value(raw_student.get("note3")),
        "note4": text_value(raw_student.get("note4")),
        "observations": text_value(raw_student.get("observations")),
        "presences": number_or_zero(raw_student.get("presences")),
        "absences": number_or_zero(raw_student.get("absences")),
        "created_at": created_at,
        "updated_at": updated_at,
        "last_attendance_at": raw_student.get("last_attendance_at"),
        "attendance_history": attendance_history,
    }


def normalize_state(raw_state):
    default_state = create_initial_state()
    raw_classes = raw_state.get("classes") if isinstance(raw_state, dict) else []
    if isinstance(raw_classes, list) and raw_classes:
        classes = [normalize_class(class_item, index + 1) for index, class_item in enumerate(raw_classes)]
    else:
        classes = default_state["classes"]

    selected_class_id = raw_state.get("selected_class_id") if isinstance(raw_state, dict) else default_state["selected_class_id"]
    if not any(class_item["id"] == selected_class_id for class_item in classes):
        selected_class_id = default_state["selected_class_id"]

    return {
        "selected_class_id": selected_class_id,
        "last_reset_at": raw_state.get("last_reset_at") if isinstance(raw_state, dict) else None,
        "classes": classes,
    }


def normalize_class(raw_class, position):
    students = raw_class.get("students") if isinstance(raw_class.get("students"), list) else []
    return {
        "id": raw_class.get("id") or f"class-{position}",
        "name": text_value(raw_class.get("name"), f"Turma {position}"),
        "students": sort_students_by_name([normalize_student(student) for student in students]),
    }


def calculate_frequency(student):
    total = student["presences"] + student["absences"]
    if total == 0:
        return 0
    return round((student["presences"] / total) * 100)


def calculate_student_grade_average(student):
    notes = [number_or_none(student.get(note_key)) for note_key in NOTE_KEYS]
    valid_notes = [note for note in notes if note is not None]
    if not valid_notes:
        return None
    return round(sum(valid_notes) / len(valid_notes), 1)


def calculate_class_summary(students):
    if not students:
        return {
            "student_count": 0,
            "average_frequency": 0,
            "average_grade": None,
        }

    grade_values = []
    frequency_values = []

    for student in students:
        frequency_values.append(calculate_frequency(student))
        student_grade = calculate_student_grade_average(student)
        if student_grade is not None:
            grade_values.append(student_grade)

    average_grade = round(sum(grade_values) / len(grade_values), 1) if grade_values else None
    average_frequency = round(sum(frequency_values) / len(frequency_values)) if frequency_values else 0

    return {
        "student_count": len(students),
        "average_frequency": average_frequency,
        "average_grade": average_grade,
    }


def build_pdf_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ReportEyebrow",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=colors.HexColor("#A34D29"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#223341"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportBody",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            textColor=colors.HexColor("#42535F"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#223341"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardMeta",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#6B747A"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetricLabel",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#7B5D4E"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetricValue",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=colors.HexColor("#20323D"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardText",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#31424D"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardFooter",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#6B747A"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardHighlight",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=21,
            textColor=colors.HexColor("#214F68"),
            alignment=2,
        )
    )
    return styles


def safe_paragraph_text(value, fallback=""):
    return escape_html(text_value(value, fallback))


def create_metric_block(label, value, styles):
    metric_table = Table(
        [
            [Paragraph(safe_paragraph_text(label), styles["MetricLabel"])],
            [Paragraph(safe_paragraph_text(value, "-"), styles["MetricValue"])],
        ],
        colWidths=[56 * mm],
    )
    metric_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8F2EB")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#EEE0D2")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return metric_table


def create_summary_block(label, value, helper, styles):
    rows = [
        [Paragraph(safe_paragraph_text(label), styles["MetricLabel"])],
        [Paragraph(safe_paragraph_text(value, "-"), styles["MetricValue"])],
    ]
    if helper:
        rows.append([Paragraph(safe_paragraph_text(helper), styles["CardMeta"])])

    summary_table = Table(rows, colWidths=[56 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF4EA")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#EDD6C4")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return summary_table


def build_styled_report_pdf(report_file, report_title, subtitle, summary_items, cards):
    report_file.parent.mkdir(parents=True, exist_ok=True)
    styles = build_pdf_styles()
    doc = SimpleDocTemplate(
        str(report_file),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
    story = []

    header_copy = [
        Paragraph("APP DE CHAMADA", styles["ReportEyebrow"]),
        Spacer(1, 2 * mm),
        Paragraph(safe_paragraph_text(report_title), styles["ReportTitle"]),
        Spacer(1, 2 * mm),
        Paragraph(safe_paragraph_text(subtitle), styles["ReportBody"]),
    ]

    logo_path = REPORT_LOGO_FILE if REPORT_LOGO_FILE.exists() else LOGO_FILE
    if logo_path.exists():
        logo = ReportImage(str(logo_path))
        try:
            logo_width, logo_height = Image.open(logo_path).size
            logo_ratio = logo_height / logo_width if logo_width else 0.76
        except Exception:
            logo_ratio = 0.76
        logo.drawWidth = 62 * mm
        logo.drawHeight = logo.drawWidth * logo_ratio
        header = Table([[header_copy, logo]], colWidths=[114 * mm, 62 * mm])
    else:
        header = Table([[header_copy]], colWidths=[176 * mm])

    header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF8F1")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E8D7C8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    story.append(header)
    story.append(Spacer(1, 7 * mm))

    summary_row = [[create_summary_block(label, value, helper, styles) for label, value, helper in summary_items]]
    summary_table = Table(summary_row, colWidths=[58 * mm, 58 * mm, 58 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 7 * mm))

    for card_data in cards:
        top_row = Table(
            [
                [
                    Paragraph(
                        f"<b>{safe_paragraph_text(card_data['title'])}</b><br/><font color='#63707A'>{safe_paragraph_text(card_data['subtitle'])}</font>",
                        styles["CardTitle"],
                    ),
                    Paragraph(safe_paragraph_text(card_data["highlight"]), styles["CardHighlight"]),
                ]
            ],
            colWidths=[140 * mm, 28 * mm],
        )
        top_row.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )

        metric_blocks = card_data.get("metrics", [])
        while len(metric_blocks) < 3:
            metric_blocks.append(("-", "-",))
        metrics_table = Table(
            [[create_metric_block(label, value, styles) for label, value in metric_blocks[:3]]],
            colWidths=[56 * mm, 56 * mm, 56 * mm],
        )
        metrics_table.setStyle(
            TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )

        notes_paragraph = Paragraph(f"<b>Notas:</b> {safe_paragraph_text(card_data.get('notes', '-'), '-')}", styles["CardText"])
        observation_paragraph = Paragraph(
            f"<b>Observacoes:</b> {safe_paragraph_text(card_data.get('observations', 'Sem observacoes registradas.'), 'Sem observacoes registradas.')}",
            styles["CardText"],
        )
        footer_paragraph = Paragraph("<br/>".join(safe_paragraph_text(line) for line in card_data.get("footer_lines", [])), styles["CardFooter"])

        card = Table(
            [[
                [
                    top_row,
                    Spacer(1, 4 * mm),
                    metrics_table,
                    Spacer(1, 4 * mm),
                    notes_paragraph,
                    Spacer(1, 2 * mm),
                    observation_paragraph,
                    Spacer(1, 3 * mm),
                    footer_paragraph,
                ]
            ]],
            colWidths=[180 * mm],
        )
        card.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E6D9CD")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 14),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                    ("TOPPADDING", (0, 0), (-1, -1), 14),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(KeepTogether(card))
        story.append(Spacer(1, 5 * mm))

    doc.build(story)
    return report_file


class AttendanceDesktopApp:
    def __init__(self, session_context=None, on_logout=None, on_close_callback=None, cloud_sync_callback=None):
        self.root = Tk()
        self.root.title(APP_TITLE)
        self.root.geometry("1420x920")
        self.root.minsize(1180, 780)
        self.root.protocol("WM_DELETE_WINDOW", self.handle_root_close)

        self.state = self.load_state()
        self.editing_student_id = None
        self.last_saved_at = None
        self.session_context = session_context or {}
        self.on_logout_callback = on_logout
        self.on_close_callback = on_close_callback
        self.cloud_sync_callback = cloud_sync_callback

        self.selected_class_var = StringVar(value=self.state["selected_class_id"])
        self.class_selector_display_var = StringVar()
        self.class_name_var = StringVar(value=self.selected_class()["name"])
        self.student_name_var = StringVar()
        self.grade_level_var = StringVar()
        self.note_vars = {note_key: StringVar() for note_key in NOTE_KEYS}
        self.edit_student_name_var = StringVar()
        self.edit_grade_level_var = StringVar()
        self.edit_presences_var = StringVar(value="0")
        self.edit_absences_var = StringVar(value="0")
        self.edit_note_vars = {note_key: StringVar() for note_key in NOTE_KEYS}
        self.live_date_var = StringVar()
        self.save_status_var = StringVar(value="Pronto para uso.")
        self.daily_report_date_var = StringVar(value=today_date_text())
        self.daily_report_status_var = StringVar(value="Escolha uma data e gere um relatorio diario quando quiser.")
        self.window_icon = None
        self.apply_window_icon()
        self.logo_image = self.load_logo_image()

        self.setup_styles()
        self.build_interface()
        self.refresh_everything()
        self.update_clock()

    def setup_styles(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass

        self.root.configure(bg="#f2e6d8")
        style.configure("Main.TFrame", background="#f2e6d8")
        style.configure("Card.TFrame", background="#fff9f3")
        style.configure("Accent.TFrame", background="#223743")
        style.configure("Title.TLabel", background="#fff9f3", foreground="#20303b", font=("Segoe UI", 22, "bold"))
        style.configure("CardTitle.TLabel", background="#fff9f3", foreground="#20303b", font=("Segoe UI", 15, "bold"))
        style.configure("Label.TLabel", background="#fff9f3", foreground="#41515a", font=("Segoe UI", 10))
        style.configure("Value.TLabel", background="#fff9f3", foreground="#20303b", font=("Segoe UI", 18, "bold"))
        style.configure("Hero.TLabel", background="#223743", foreground="#ffffff", font=("Segoe UI", 24, "bold"))
        style.configure("HeroSmall.TLabel", background="#223743", foreground="#dbe7ed", font=("Segoe UI", 11))
        style.configure("HeroImage.TLabel", background="#223743")
        style.configure("LogoShell.TFrame", background="#ffffff")
        style.configure("LogoShell.TLabel", background="#ffffff")
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"))
        style.configure("Treeview", rowheight=28, font=("Segoe UI", 10))
        style.configure("Treeview.Heading", font=("Segoe UI", 10, "bold"))
        style.configure("TNotebook", background="#f2e6d8", borderwidth=0)
        style.configure("TNotebook.Tab", padding=(16, 10), font=("Segoe UI", 10, "bold"))

    def build_interface(self):
        outer = ttk.Frame(self.root, style="Main.TFrame", padding=18)
        outer.pack(fill="both", expand=True)

        hero = ttk.Frame(outer, style="Accent.TFrame", padding=20)
        hero.pack(fill="x", pady=(0, 16))

        hero_row = ttk.Frame(hero, style="Accent.TFrame")
        hero_row.pack(fill="x")

        hero_text_column = ttk.Frame(hero_row, style="Accent.TFrame")
        hero_text_column.pack(side="left", fill="both", expand=True)

        ttk.Label(hero_text_column, text="App de Chamada", style="Hero.TLabel").pack(anchor="w")
        ttk.Label(
            hero_text_column,
            text="Controle turmas, presencas, notas, observacoes e relatorios com salvamento definitivo.",
            style="HeroSmall.TLabel",
            wraplength=860,
        ).pack(anchor="w", pady=(6, 2))
        ttk.Label(hero_text_column, textvariable=self.live_date_var, style="HeroSmall.TLabel").pack(anchor="w", pady=(2, 0))
        ttk.Label(hero_text_column, textvariable=self.save_status_var, style="HeroSmall.TLabel", wraplength=860).pack(anchor="w", pady=(8, 0))

        hero_actions_column = ttk.Frame(hero_row, style="Accent.TFrame")
        hero_actions_column.pack(side="right", padx=(12, 0), anchor="ne")

        if self.logo_image is not None:
            logo_shell = ttk.Frame(hero_actions_column, style="LogoShell.TFrame", padding=10)
            logo_shell.pack(anchor="e")
            ttk.Label(logo_shell, image=self.logo_image, style="LogoShell.TLabel").pack()

        if self.on_logout_callback is not None:
            ttk.Button(hero_actions_column, text="Sair da conta", command=self.handle_logout_request).pack(anchor="e", pady=(10, 0))

        notebook = ttk.Notebook(outer)
        notebook.pack(fill="both", expand=True)

        self.class_tab_container, self.class_tab = self.create_scrollable_tab(notebook)
        self.report_tab_container, self.report_tab = self.create_scrollable_tab(notebook)
        self.data_tab_container, self.data_tab = self.create_scrollable_tab(notebook)
        notebook.add(self.class_tab_container, text="Turmas")
        notebook.add(self.report_tab_container, text="Relatorio")
        notebook.add(self.data_tab_container, text="Dados")

        self.build_class_tab()
        self.build_report_tab()
        self.build_data_tab()

    def create_scrollable_tab(self, notebook):
        wrapper = ttk.Frame(notebook, style="Main.TFrame")
        canvas = tk.Canvas(wrapper, background="#f2e6d8", highlightthickness=0, bd=0)
        scrollbar = ttk.Scrollbar(wrapper, orient="vertical", command=canvas.yview)
        content = ttk.Frame(canvas, style="Main.TFrame", padding=4)
        window_id = canvas.create_window((0, 0), window=content, anchor="nw")

        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        content.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window_id, width=event.width))

        def on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        def bind_mousewheel(_event):
            canvas.bind_all("<MouseWheel>", on_mousewheel)

        def unbind_mousewheel(_event):
            canvas.unbind_all("<MouseWheel>")

        canvas.bind("<Enter>", bind_mousewheel)
        canvas.bind("<Leave>", unbind_mousewheel)

        return wrapper, content

    def build_class_tab(self):
        top_row = ttk.Frame(self.class_tab, style="Main.TFrame")
        top_row.pack(fill="x", pady=(0, 12))

        class_card = ttk.Frame(top_row, style="Card.TFrame", padding=16)
        class_card.pack(side="left", fill="both", expand=True, padx=(0, 6))
        class_card.columnconfigure(0, weight=1)

        ttk.Label(class_card, text="Turma ativa", style="CardTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            class_card,
            text="Selecione uma turma, altere o nome e adicione novas quando precisar.",
            style="Label.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(2, 12))

        self.class_selector = ttk.Combobox(
            class_card,
            textvariable=self.class_selector_display_var,
            state="readonly",
            width=32,
            values=[],
        )
        self.class_selector.grid(row=2, column=0, sticky="w")
        self.class_selector.bind("<<ComboboxSelected>>", self.on_class_selected)

        rename_row = ttk.Frame(class_card, style="Card.TFrame")
        rename_row.grid(row=3, column=0, sticky="ew", pady=(12, 0))
        rename_row.columnconfigure(0, weight=1)

        rename_entry = ttk.Entry(rename_row, textvariable=self.class_name_var)
        rename_entry.grid(row=0, column=0, sticky="ew", padx=(0, 8))
        ttk.Button(rename_row, text="Salvar nome da turma", command=self.rename_selected_class).grid(row=0, column=1)

        ttk.Button(class_card, text="Adicionar nova turma", command=self.add_class).grid(row=4, column=0, sticky="w", pady=(12, 0))

        stats_holder = ttk.Frame(top_row, style="Main.TFrame")
        stats_holder.pack(side="left", fill="both", expand=True, padx=(6, 0))

        self.class_stat_cards = {}
        for index, stat_key in enumerate(["alunos", "frequencia", "media_notas", "hoje"]):
            card = ttk.Frame(stats_holder, style="Card.TFrame", padding=16)
            row = index // 2
            col = index % 2
            card.grid(row=row, column=col, sticky="nsew", padx=6, pady=6)
            stats_holder.columnconfigure(col, weight=1)
            stats_holder.rowconfigure(row, weight=1)
            title = ttk.Label(card, text="", style="Label.TLabel")
            title.pack(anchor="w")
            value = ttk.Label(card, text="", style="Value.TLabel")
            value.pack(anchor="w", pady=(6, 2))
            helper = ttk.Label(card, text="", style="Label.TLabel")
            helper.pack(anchor="w")
            self.class_stat_cards[stat_key] = {"title": title, "value": value, "helper": helper}

        main_row = ttk.Frame(self.class_tab, style="Main.TFrame")
        main_row.pack(fill="both", expand=True)
        main_row.columnconfigure(0, weight=1)
        main_row.columnconfigure(1, weight=1)

        list_card = ttk.Frame(main_row, style="Card.TFrame", padding=16)
        list_card.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        form_column = ttk.Frame(main_row, style="Main.TFrame")
        form_column.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        create_form_card = ttk.Frame(form_column, style="Card.TFrame", padding=16)
        create_form_card.pack(fill="x")
        self.edit_form_card = ttk.Frame(form_column, style="Card.TFrame", padding=16)

        ttk.Label(list_card, text="Alunos da turma", style="CardTitle.TLabel").pack(anchor="w")
        ttk.Label(
            list_card,
            text="Selecione um aluno para marcar chamada, editar ou apagar definitivamente.",
            style="Label.TLabel",
        ).pack(anchor="w", pady=(2, 12))

        student_columns = ("position", "initial", "name", "grade", "freq", "grade_avg", "updated")
        student_tree_holder = ttk.Frame(list_card, style="Card.TFrame")
        student_tree_holder.pack(fill="both", expand=True)
        student_tree_scrollbar = ttk.Scrollbar(student_tree_holder, orient="vertical")
        self.student_tree = ttk.Treeview(
            student_tree_holder,
            columns=student_columns,
            show="headings",
            height=18,
            yscrollcommand=student_tree_scrollbar.set,
        )
        self.student_tree.heading("position", text="#")
        self.student_tree.heading("initial", text="Inicial")
        self.student_tree.heading("name", text="Aluno")
        self.student_tree.heading("grade", text="Serie")
        self.student_tree.heading("freq", text="Frequencia")
        self.student_tree.heading("grade_avg", text="Media notas")
        self.student_tree.heading("updated", text="Atualizado")
        self.student_tree.column("position", width=46, anchor="center")
        self.student_tree.column("initial", width=68, anchor="center")
        self.student_tree.column("name", width=220)
        self.student_tree.column("grade", width=110, anchor="center")
        self.student_tree.column("freq", width=100, anchor="center")
        self.student_tree.column("grade_avg", width=100, anchor="center")
        self.student_tree.column("updated", width=140, anchor="center")
        self.student_tree.pack(side="left", fill="both", expand=True)
        student_tree_scrollbar.pack(side="right", fill="y")
        student_tree_scrollbar.configure(command=self.student_tree.yview)
        self.student_tree.bind("<<TreeviewSelect>>", self.on_student_selected)

        button_row = ttk.Frame(list_card, style="Card.TFrame")
        button_row.pack(fill="x", pady=(12, 0))
        ttk.Button(button_row, text="+ Presenca", command=lambda: self.update_attendance("presences")).pack(side="left", padx=(0, 6))
        ttk.Button(button_row, text="+ Falta", command=lambda: self.update_attendance("absences")).pack(side="left", padx=(0, 6))
        ttk.Button(button_row, text="Editar aluno", command=self.start_edit_selected_student).pack(side="left", padx=(0, 6))
        ttk.Button(button_row, text="Apagar definitivamente", command=self.delete_selected_student).pack(side="left")

        ttk.Label(create_form_card, text="Cadastro do aluno", style="CardTitle.TLabel").pack(anchor="w")
        ttk.Label(
            create_form_card,
            text="O nome do aluno e obrigatorio. Serie, notas e observacoes podem ser preenchidas depois.",
            style="Label.TLabel",
            wraplength=520,
        ).pack(anchor="w", pady=(2, 12))

        create_form_grid = ttk.Frame(create_form_card, style="Card.TFrame")
        create_form_grid.pack(fill="x")
        create_form_grid.columnconfigure(0, weight=1)
        create_form_grid.columnconfigure(1, weight=1)

        self.make_labeled_entry(create_form_grid, "Nome do aluno (obrigatorio)", self.student_name_var, 0, 0, 2)
        self.make_labeled_entry(create_form_grid, "Serie (opcional)", self.grade_level_var, 2, 0, 2)

        note_labels = ["Nota 1", "Nota 2", "Nota 3", "Nota 4"]
        for index, note_key in enumerate(NOTE_KEYS):
            self.make_labeled_entry(
                create_form_grid,
                note_labels[index],
                self.note_vars[note_key],
                4 + ((index // 2) * 2),
                index % 2,
                1,
            )

        ttk.Label(create_form_grid, text="Observacoes", style="Label.TLabel").grid(row=8, column=0, sticky="w", pady=(10, 4))
        self.observations_text = Text(create_form_grid, height=9, wrap="word", font=("Segoe UI", 10))
        self.observations_text.grid(row=9, column=0, columnspan=2, sticky="ew")

        create_form_buttons = ttk.Frame(create_form_card, style="Card.TFrame")
        create_form_buttons.pack(fill="x", pady=(12, 0))
        ttk.Button(create_form_buttons, text="Salvar aluno", command=self.save_student).pack(side="left", padx=(0, 8))
        ttk.Button(create_form_buttons, text="Limpar cadastro", command=self.clear_form).pack(side="left")

        ttk.Label(self.edit_form_card, text="Edicao do aluno selecionado", style="CardTitle.TLabel").pack(anchor="w")
        ttk.Label(
            self.edit_form_card,
            text="Ao clicar em editar, os dados aparecem aqui embaixo do cadastro, incluindo presencas e faltas.",
            style="Label.TLabel",
            wraplength=520,
        ).pack(anchor="w", pady=(2, 12))

        edit_form_grid = ttk.Frame(self.edit_form_card, style="Card.TFrame")
        edit_form_grid.pack(fill="x")
        edit_form_grid.columnconfigure(0, weight=1)
        edit_form_grid.columnconfigure(1, weight=1)

        self.make_labeled_entry(edit_form_grid, "Nome do aluno (obrigatorio)", self.edit_student_name_var, 0, 0, 2)
        self.make_labeled_entry(edit_form_grid, "Serie (opcional)", self.edit_grade_level_var, 2, 0, 2)
        self.make_labeled_entry(edit_form_grid, "Presencas", self.edit_presences_var, 4, 0, 1)
        self.make_labeled_entry(edit_form_grid, "Faltas", self.edit_absences_var, 4, 1, 1)

        for index, note_key in enumerate(NOTE_KEYS):
            self.make_labeled_entry(
                edit_form_grid,
                note_labels[index],
                self.edit_note_vars[note_key],
                6 + ((index // 2) * 2),
                index % 2,
                1,
            )

        ttk.Label(edit_form_grid, text="Observacoes", style="Label.TLabel").grid(row=10, column=0, sticky="w", pady=(10, 4))
        self.edit_observations_text = Text(edit_form_grid, height=9, wrap="word", font=("Segoe UI", 10))
        self.edit_observations_text.grid(row=11, column=0, columnspan=2, sticky="ew")

        edit_form_buttons = ttk.Frame(self.edit_form_card, style="Card.TFrame")
        edit_form_buttons.pack(fill="x", pady=(12, 0))
        ttk.Button(edit_form_buttons, text="Salvar alteracoes do aluno", command=self.save_student_edits).pack(side="left", padx=(0, 8))
        ttk.Button(edit_form_buttons, text="Cancelar edicao", command=self.clear_edit_form).pack(side="left")
        self.edit_form_card.pack_forget()

    def build_report_tab(self):
        report_top = ttk.Frame(self.report_tab, style="Main.TFrame")
        report_top.pack(fill="x", pady=(0, 12))

        summary_card = ttk.Frame(report_top, style="Card.TFrame", padding=16)
        summary_card.pack(fill="x")
        ttk.Label(summary_card, text="Relatorio geral", style="CardTitle.TLabel").pack(anchor="w")
        ttk.Label(
            summary_card,
            text="Aqui aparecem turma, serie, frequencia, notas, media das notas, observacoes e datas.",
            style="Label.TLabel",
            wraplength=1200,
        ).pack(anchor="w", pady=(4, 0))

        summary_grid = ttk.Frame(self.report_tab, style="Main.TFrame")
        summary_grid.pack(fill="x", pady=(0, 12))
        self.report_stat_cards = {}
        for index, stat_key in enumerate(["turmas", "alunos", "frequencia_geral", "media_geral"]):
            card = ttk.Frame(summary_grid, style="Card.TFrame", padding=16)
            card.grid(row=0, column=index, sticky="nsew", padx=6)
            summary_grid.columnconfigure(index, weight=1)
            title = ttk.Label(card, text="", style="Label.TLabel")
            title.pack(anchor="w")
            value = ttk.Label(card, text="", style="Value.TLabel")
            value.pack(anchor="w", pady=(6, 2))
            helper = ttk.Label(card, text="", style="Label.TLabel")
            helper.pack(anchor="w")
            self.report_stat_cards[stat_key] = {"title": title, "value": value, "helper": helper}

        daily_report_card = ttk.Frame(self.report_tab, style="Card.TFrame", padding=16)
        daily_report_card.pack(fill="x", pady=(0, 12))
        daily_report_card.columnconfigure(1, weight=1)

        ttk.Label(daily_report_card, text="Relatorio diario", style="CardTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            daily_report_card,
            text="Escolha a data no formato dd/mm/aaaa e gere o relatorio diario geral ou somente da turma ativa.",
            style="Label.TLabel",
            wraplength=1120,
        ).grid(row=1, column=0, columnspan=4, sticky="w", pady=(4, 12))
        ttk.Label(daily_report_card, text="Data do relatorio", style="Label.TLabel").grid(row=2, column=0, sticky="w")

        daily_date_entry = ttk.Entry(daily_report_card, textvariable=self.daily_report_date_var, width=18)
        daily_date_entry.grid(row=2, column=1, sticky="w", padx=(0, 10))
        ttk.Button(
            daily_report_card,
            text="Gerar diario geral",
            command=lambda: self.generate_daily_report("all"),
        ).grid(row=2, column=2, sticky="w", padx=(0, 8))
        ttk.Button(
            daily_report_card,
            text="Gerar diario da turma ativa",
            command=lambda: self.generate_daily_report("selected"),
        ).grid(row=2, column=3, sticky="w", padx=(0, 8))
        ttk.Button(
            daily_report_card,
            text="Gerar PDF da turma ativa",
            command=self.generate_selected_class_report,
        ).grid(row=2, column=4, sticky="w", padx=(0, 8))
        ttk.Button(
            daily_report_card,
            text="Abrir pasta dos relatorios",
            command=self.open_reports_folder,
        ).grid(row=2, column=5, sticky="w")
        ttk.Label(
            daily_report_card,
            textvariable=self.daily_report_status_var,
            style="Label.TLabel",
            wraplength=1120,
        ).grid(row=3, column=0, columnspan=6, sticky="w", pady=(12, 0))

        lower_row = ttk.Frame(self.report_tab, style="Main.TFrame")
        lower_row.pack(fill="both", expand=True)
        lower_row.columnconfigure(0, weight=2)
        lower_row.columnconfigure(1, weight=1)

        tree_card = ttk.Frame(lower_row, style="Card.TFrame", padding=16)
        tree_card.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        detail_card = ttk.Frame(lower_row, style="Card.TFrame", padding=16)
        detail_card.grid(row=0, column=1, sticky="nsew", padx=(8, 0))

        ttk.Label(tree_card, text="Todos os alunos", style="CardTitle.TLabel").pack(anchor="w", pady=(0, 10))

        report_columns = ("position", "initial", "student", "class_name", "grade", "freq", "grade_avg", "updated")
        report_tree_holder = ttk.Frame(tree_card, style="Card.TFrame")
        report_tree_holder.pack(fill="both", expand=True)
        report_tree_scrollbar = ttk.Scrollbar(report_tree_holder, orient="vertical")
        self.report_tree = ttk.Treeview(
            report_tree_holder,
            columns=report_columns,
            show="headings",
            height=18,
            yscrollcommand=report_tree_scrollbar.set,
        )
        self.report_tree.heading("position", text="#")
        self.report_tree.heading("initial", text="Inicial")
        self.report_tree.heading("student", text="Aluno")
        self.report_tree.heading("class_name", text="Turma")
        self.report_tree.heading("grade", text="Serie")
        self.report_tree.heading("freq", text="Frequencia")
        self.report_tree.heading("grade_avg", text="Media notas")
        self.report_tree.heading("updated", text="Atualizado")
        self.report_tree.column("position", width=46, anchor="center")
        self.report_tree.column("initial", width=68, anchor="center")
        self.report_tree.column("student", width=220)
        self.report_tree.column("class_name", width=140, anchor="center")
        self.report_tree.column("grade", width=110, anchor="center")
        self.report_tree.column("freq", width=100, anchor="center")
        self.report_tree.column("grade_avg", width=100, anchor="center")
        self.report_tree.column("updated", width=140, anchor="center")
        self.report_tree.pack(side="left", fill="both", expand=True)
        report_tree_scrollbar.pack(side="right", fill="y")
        report_tree_scrollbar.configure(command=self.report_tree.yview)
        self.report_tree.bind("<<TreeviewSelect>>", self.on_report_selected)

        ttk.Label(detail_card, text="Detalhes do aluno e preview do diario", style="CardTitle.TLabel").pack(anchor="w", pady=(0, 10))
        self.report_details = ScrolledText(detail_card, wrap="word", height=24, font=("Consolas", 10))
        self.report_details.pack(fill="both", expand=True)
        self.report_details.configure(state="disabled")

    def build_data_tab(self):
        data_card = ttk.Frame(self.data_tab, style="Card.TFrame", padding=18)
        data_card.pack(fill="both", expand=True)

        ttk.Label(data_card, text="Gerenciamento dos dados", style="CardTitle.TLabel").pack(anchor="w")
        ttk.Label(
            data_card,
            text="Tudo fica salvo localmente. O reset apaga turmas, alunos, frequencias, notas, observacoes e o historico diario.",
            style="Label.TLabel",
            wraplength=1180,
        ).pack(anchor="w", pady=(4, 12))

        self.data_info_var = StringVar()
        ttk.Label(data_card, textvariable=self.data_info_var, style="Label.TLabel", wraplength=1180).pack(anchor="w", pady=(0, 14))

        ttk.Button(data_card, text="Resetar tudo definitivamente", command=self.reset_everything).pack(anchor="w")

    def load_logo_image(self):
        try:
            if not LOGO_FILE.exists():
                return None
            image = Image.open(LOGO_FILE).convert("RGBA")
            image.thumbnail((360, 220))
            return ImageTk.PhotoImage(image)
        except Exception:
            return None

    def apply_window_icon(self):
        try:
            if ICON_FILE.exists():
                self.root.iconbitmap(default=str(ICON_FILE))
            elif LOGO_FILE.exists():
                icon_image = Image.open(LOGO_FILE).convert("RGBA")
                icon_image.thumbnail((64, 64))
                self.window_icon = ImageTk.PhotoImage(icon_image)
                self.root.iconphoto(True, self.window_icon)
        except Exception:
            self.window_icon = None

    def make_labeled_entry(self, parent, label, variable, row, column, columnspan):
        ttk.Label(parent, text=label, style="Label.TLabel").grid(row=row, column=column, sticky="w", pady=(10, 4))
        entry = ttk.Entry(parent, textvariable=variable)
        entry.grid(row=row + 1, column=column, columnspan=columnspan, sticky="ew", padx=(0 if column == 0 else 8, 0))

    def load_state(self):
        try:
            LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
            if DATA_FILE.exists():
                with DATA_FILE.open("r", encoding="utf-8") as file_handle:
                    return normalize_state(json.load(file_handle))
        except Exception:
            pass
        return create_initial_state()

    def save_state(self, message="Dados salvos com sucesso."):
        LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
        with DATA_FILE.open("w", encoding="utf-8") as file_handle:
            json.dump(self.state, file_handle, ensure_ascii=False, indent=2)
        self.last_saved_at = current_timestamp()
        self.save_status_var.set(f"{message} Ultimo salvamento: {format_datetime(self.last_saved_at)}")
        self.schedule_cloud_sync()

    def build_cloud_sync_payload(self):
        all_students = sum(len(class_item["students"]) for class_item in self.state["classes"])
        return {
            "studentCount": all_students,
            "classCount": len(self.state["classes"]),
            "deviceLabel": self.session_context.get("device_label") or self.session_context.get("email") or "desktop",
            "lastSavedAt": self.last_saved_at,
        }

    def schedule_cloud_sync(self):
        if self.cloud_sync_callback is None:
            return

        payload = self.build_cloud_sync_payload()

        def worker():
            try:
                self.cloud_sync_callback(payload)
            except Exception:
                pass

        threading.Thread(target=worker, daemon=True).start()

    def handle_logout_request(self):
        if self.on_logout_callback is None:
            return
        if not messagebox.askyesno(APP_TITLE, "Deseja sair desta conta agora?"):
            return
        try:
            self.on_logout_callback()
        finally:
            self.root.destroy()

    def handle_root_close(self):
        try:
            if self.on_close_callback is not None:
                self.on_close_callback()
        finally:
            self.root.destroy()

    def selected_class(self):
        for class_item in self.state["classes"]:
            if class_item["id"] == self.state["selected_class_id"]:
                return class_item
        return self.state["classes"][0]

    def selected_student(self):
        selected = self.student_tree.selection()
        if not selected:
            return None
        student_id = selected[0]
        for student in self.selected_class()["students"]:
            if student["id"] == student_id:
                return student
        return None

    def report_student(self):
        selected = self.report_tree.selection()
        if not selected:
            return None, None
        student_id = selected[0]
        for class_item in self.state["classes"]:
            for student in class_item["students"]:
                if student["id"] == student_id:
                    return class_item, student
        return None, None

    def on_class_selected(self, _event=None):
        selected_label = self.class_selector_display_var.get()
        if selected_label in self.class_display_to_id:
            self.state["selected_class_id"] = self.class_display_to_id[selected_label]
            self.selected_class_var.set(self.state["selected_class_id"])
        self.class_name_var.set(self.selected_class()["name"])
        self.clear_edit_form()
        self.refresh_class_tab()

    def rename_selected_class(self):
        new_name = text_value(self.class_name_var.get())
        if not new_name:
            messagebox.showwarning(APP_TITLE, "Digite um nome valido para a turma.")
            return

        selected = self.selected_class()
        selected["name"] = new_name
        self.save_state("Nome da turma salvo definitivamente.")
        self.refresh_everything()

    def add_class(self):
        next_number = len(self.state["classes"]) + 1
        new_class = {
            "id": f"class-{uuid4().hex}",
            "name": f"Turma {next_number}",
            "students": [],
        }
        self.state["classes"].append(new_class)
        self.state["selected_class_id"] = new_class["id"]
        self.selected_class_var.set(new_class["id"])
        self.class_name_var.set(new_class["name"])
        self.clear_edit_form()
        self.save_state("Nova turma criada e salva definitivamente.")
        self.refresh_everything()

    def clear_form(self):
        self.student_name_var.set("")
        self.grade_level_var.set("")
        for note_key in NOTE_KEYS:
            self.note_vars[note_key].set("")
        self.observations_text.delete("1.0", END)

    def clear_edit_form(self):
        self.editing_student_id = None
        self.edit_student_name_var.set("")
        self.edit_grade_level_var.set("")
        self.edit_presences_var.set("0")
        self.edit_absences_var.set("0")
        for note_key in NOTE_KEYS:
            self.edit_note_vars[note_key].set("")
        self.edit_observations_text.delete("1.0", END)
        self.edit_form_card.pack_forget()

    def save_student(self):
        name = text_value(self.student_name_var.get())
        grade_level = text_value(self.grade_level_var.get(), "-")
        observations = text_value(self.observations_text.get("1.0", END))

        if not name:
            messagebox.showwarning(APP_TITLE, "Preencha pelo menos o nome do aluno antes de salvar.")
            return

        payload = {
            "name": name,
            "grade_level": grade_level,
            "note1": text_value(self.note_vars["note1"].get()),
            "note2": text_value(self.note_vars["note2"].get()),
            "note3": text_value(self.note_vars["note3"].get()),
            "note4": text_value(self.note_vars["note4"].get()),
            "observations": observations,
        }

        timestamp = current_timestamp()
        class_item = self.selected_class()

        new_student = {
            "id": f"student-{uuid4().hex}",
            "presences": 0,
            "absences": 0,
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_attendance_at": None,
            "attendance_history": [],
        }
        new_student.update(payload)
        class_item["students"].append(new_student)
        class_item["students"] = sort_students_by_name(class_item["students"])
        self.save_state("Nome do aluno salvo definitivamente.")

        self.clear_form()
        self.refresh_everything()

    def save_student_edits(self):
        if not self.editing_student_id:
            return

        name = text_value(self.edit_student_name_var.get())
        grade_level = text_value(self.edit_grade_level_var.get(), "-")
        observations = text_value(self.edit_observations_text.get("1.0", END))

        if not name:
            messagebox.showwarning(APP_TITLE, "Preencha pelo menos o nome do aluno antes de salvar.")
            return

        try:
            presences = parse_non_negative_int(self.edit_presences_var.get(), "Presencas")
            absences = parse_non_negative_int(self.edit_absences_var.get(), "Faltas")
        except ValueError as error:
            messagebox.showwarning(APP_TITLE, str(error))
            return

        payload = {
            "name": name,
            "grade_level": grade_level,
            "note1": text_value(self.edit_note_vars["note1"].get()),
            "note2": text_value(self.edit_note_vars["note2"].get()),
            "note3": text_value(self.edit_note_vars["note3"].get()),
            "note4": text_value(self.edit_note_vars["note4"].get()),
            "observations": observations,
            "presences": presences,
            "absences": absences,
        }

        timestamp = current_timestamp()
        class_item = self.selected_class()
        for student in class_item["students"]:
            if student["id"] == self.editing_student_id:
                student.update(payload)
                student["updated_at"] = timestamp
                break

        class_item["students"] = sort_students_by_name(class_item["students"])
        self.save_state("Alteracoes do aluno salvas definitivamente.")
        self.clear_edit_form()
        self.refresh_everything()

    def on_student_selected(self, _event=None):
        pass

    def start_edit_selected_student(self):
        student = self.selected_student()
        if not student:
            messagebox.showinfo(APP_TITLE, "Selecione um aluno para editar.")
            return

        self.editing_student_id = student["id"]
        self.edit_student_name_var.set(student["name"])
        self.edit_grade_level_var.set(student["grade_level"])
        self.edit_presences_var.set(str(student["presences"]))
        self.edit_absences_var.set(str(student["absences"]))
        for note_key in NOTE_KEYS:
            self.edit_note_vars[note_key].set(student.get(note_key, ""))
        self.edit_observations_text.delete("1.0", END)
        self.edit_observations_text.insert("1.0", student.get("observations", ""))
        if not self.edit_form_card.winfo_ismapped():
            self.edit_form_card.pack(fill="x", pady=(12, 0))

    def update_attendance(self, field_name):
        student = self.selected_student()
        if not student:
            messagebox.showinfo(APP_TITLE, "Selecione um aluno para registrar a chamada.")
            return

        student[field_name] += 1
        student["updated_at"] = current_timestamp()
        student["last_attendance_at"] = student["updated_at"]
        status = "presence" if field_name == "presences" else "absence"
        student.setdefault("attendance_history", []).append(
            {
                "timestamp": student["updated_at"],
                "status": status,
            }
        )
        action_name = "Presenca registrada." if field_name == "presences" else "Falta registrada."
        self.save_state(action_name)
        self.refresh_everything()
        self.select_tree_student(student["id"])

    def delete_selected_student(self):
        student = self.selected_student()
        if not student:
            messagebox.showinfo(APP_TITLE, "Selecione um aluno para apagar.")
            return

        confirmed = messagebox.askyesno(
            APP_TITLE,
            "Deseja apagar este aluno de forma definitiva? Isso tambem remove notas, observacoes e frequencia.",
            icon="warning",
        )
        if not confirmed:
            return

        class_item = self.selected_class()
        class_item["students"] = [item for item in class_item["students"] if item["id"] != student["id"]]

        if self.editing_student_id == student["id"]:
            self.clear_edit_form()

        self.save_state("Aluno apagado definitivamente.")
        self.refresh_everything()

    def reset_everything(self):
        confirmed = messagebox.askyesno(
            APP_TITLE,
            "Tem certeza de que deseja resetar tudo? Esta acao apaga todas as turmas, alunos, notas e observacoes.",
            icon="warning",
        )
        if not confirmed:
            return

        self.state = create_initial_state()
        self.state["last_reset_at"] = current_timestamp()
        self.selected_class_var.set(self.state["selected_class_id"])
        self.class_name_var.set(self.selected_class()["name"])
        self.daily_report_date_var.set(today_date_text())
        self.daily_report_status_var.set("Escolha uma data e gere um relatorio diario quando quiser.")
        self.clear_form()
        self.clear_edit_form()
        self.save_state("Reset geral concluido. Todos os dados foram apagados definitivamente.")
        self.refresh_everything()

    def refresh_everything(self):
        self.refresh_class_selector()
        self.refresh_class_tab()
        self.refresh_report_tab()
        self.refresh_data_tab()

    def refresh_class_selector(self):
        self.class_display_to_id = {
            f'{class_item["name"]} ({class_item["id"][-1]})': class_item["id"] for class_item in self.state["classes"]
        }
        self.class_selector["values"] = list(self.class_display_to_id.keys())
        selected_label = next(
            (
                label
                for label, class_id in self.class_display_to_id.items()
                if class_id == self.state["selected_class_id"]
            ),
            "",
        )
        self.class_selector_display_var.set(selected_label)
        self.class_name_var.set(self.selected_class()["name"])

    def refresh_class_tab(self):
        selected = self.selected_class()
        if self.editing_student_id and not any(student["id"] == self.editing_student_id for student in selected["students"]):
            self.clear_edit_form()
        elif self.editing_student_id:
            for student in selected["students"]:
                if student["id"] == self.editing_student_id:
                    self.edit_presences_var.set(str(student["presences"]))
                    self.edit_absences_var.set(str(student["absences"]))
                    break
        summary = calculate_class_summary(selected["students"])
        today_label = datetime.now().strftime("%d/%m/%Y")

        stat_values = {
            "alunos": ("Alunos da turma", str(summary["student_count"]), "Quantidade cadastrada"),
            "frequencia": ("Frequencia media", f'{summary["average_frequency"]}%', "Baseada nas presencas"),
            "media_notas": ("Media das notas", format_grade(summary["average_grade"]), "Notas preenchidas"),
            "hoje": ("Data atual", today_label, "Atualizada automaticamente"),
        }

        for stat_key, values in stat_values.items():
            self.class_stat_cards[stat_key]["title"].configure(text=values[0])
            self.class_stat_cards[stat_key]["value"].configure(text=values[1])
            self.class_stat_cards[stat_key]["helper"].configure(text=values[2])

        for item in self.student_tree.get_children():
            self.student_tree.delete(item)

        for position, student in enumerate(sort_students_by_name(selected["students"]), start=1):
            self.student_tree.insert(
                "",
                END,
                iid=student["id"],
                values=(
                    f"{position:02d}",
                    student_initial(student["name"]),
                    student["name"],
                    student["grade_level"],
                    f'{calculate_frequency(student)}%',
                    format_grade(calculate_student_grade_average(student)),
                    format_datetime(student["updated_at"]),
                ),
            )

    def refresh_report_tab(self):
        all_students = []
        for class_item in self.state["classes"]:
            for student in class_item["students"]:
                all_students.append((class_item, student))

        overall_summary = calculate_class_summary([student for _, student in all_students])
        report_stats = {
            "turmas": ("Turmas", str(len(self.state["classes"])), "Sempre editaveis"),
            "alunos": ("Total de alunos", str(len(all_students)), "Somando todas as turmas"),
            "frequencia_geral": ("Frequencia geral", f'{overall_summary["average_frequency"]}%', "Media dos alunos"),
            "media_geral": ("Media geral notas", format_grade(overall_summary["average_grade"]), "Notas validas"),
        }

        for stat_key, values in report_stats.items():
            self.report_stat_cards[stat_key]["title"].configure(text=values[0])
            self.report_stat_cards[stat_key]["value"].configure(text=values[1])
            self.report_stat_cards[stat_key]["helper"].configure(text=values[2])

        for item in self.report_tree.get_children():
            self.report_tree.delete(item)

        sorted_students = sorted(
            all_students,
            key=lambda entry: (
                sortable_student_name(entry[1]["name"]),
                sortable_student_name(entry[0]["name"]),
                number_or_zero(entry[1].get("created_at")),
                text_value(entry[1].get("id")),
            ),
        )
        for position, (class_item, student) in enumerate(sorted_students, start=1):
            self.report_tree.insert(
                "",
                END,
                iid=student["id"],
                values=(
                    f"{position:02d}",
                    student_initial(student["name"]),
                    student["name"],
                    class_item["name"],
                    student["grade_level"],
                    f'{calculate_frequency(student)}%',
                    format_grade(calculate_student_grade_average(student)),
                    format_datetime(student["updated_at"]),
                ),
            )

        self.show_report_details(None, None)

    def refresh_data_tab(self):
        info_lines = [
            f"Arquivo local de dados: {DATA_FILE}",
            f"Pasta dos relatorios diarios: {REPORTS_DIR}",
            f"Ultimo salvamento: {format_datetime(self.last_saved_at)}" if self.last_saved_at else "Ultimo salvamento: ainda nao houve alteracao nesta sessao.",
            f"Ultimo reset: {format_datetime(self.state.get('last_reset_at'))}",
            f"Turma ativa: {self.selected_class()['name']}",
            f"Data de hoje: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        ]
        self.data_info_var.set("\n".join(info_lines))

    def on_report_selected(self, _event=None):
        class_item, student = self.report_student()
        self.show_report_details(class_item, student)

    def show_report_details(self, class_item, student):
        if not class_item or not student:
            self.set_report_panel_text("Selecione um aluno no relatorio para visualizar notas, observacoes, frequencia e datas.")
            return

        details = [
            f"Aluno: {student['name']}",
            f"Turma: {class_item['name']}",
            f"Serie: {student['grade_level']}",
            f"Presencas: {student['presences']}",
            f"Faltas: {student['absences']}",
            f"Frequencia: {calculate_frequency(student)}%",
            f"Nota 1: {text_value(student['note1'], '-')}",
            f"Nota 2: {text_value(student['note2'], '-')}",
            f"Nota 3: {text_value(student['note3'], '-')}",
            f"Nota 4: {text_value(student['note4'], '-')}",
            f"Media das notas: {format_grade(calculate_student_grade_average(student))}",
            "",
            "Observacoes:",
            text_value(student["observations"], "Sem observacoes registradas."),
            "",
            f"Cadastrado em: {format_datetime(student['created_at'])}",
            f"Ultima atualizacao: {format_datetime(student['updated_at'])}",
            f"Ultima chamada: {format_datetime(student['last_attendance_at'])}",
            f"Registros diarios de chamada: {len(student.get('attendance_history', []))}",
        ]
        self.set_report_panel_text("\n".join(details))

    def set_report_panel_text(self, text):
        self.report_details.configure(state="normal")
        self.report_details.delete("1.0", END)
        self.report_details.insert("1.0", text)
        self.report_details.configure(state="disabled")

    def build_class_report_cards(self, class_item):
        students = sort_students_by_name(class_item["students"])
        cards = []

        if not students:
            cards.append(
                {
                    "title": f"Turma {class_item['name']}",
                    "subtitle": "Nenhum aluno cadastrado",
                    "highlight": "0%",
                    "metrics": [("Presencas", "0"), ("Faltas", "0"), ("Media", "-")],
                    "notes": "-",
                    "observations": "Nenhum aluno cadastrado nesta turma.",
                    "footer_lines": [f"Relatorio gerado em: {format_datetime(current_timestamp())}"],
                }
            )
            return cards

        for position, student in enumerate(students, start=1):
            cards.append(
                {
                    "title": f"{position:02d} - {student['name']}",
                    "subtitle": f"Serie: {student['grade_level']}",
                    "highlight": f"{calculate_frequency(student)}%",
                    "metrics": [
                        ("Presencas", str(student["presences"])),
                        ("Faltas", str(student["absences"])),
                        ("Media", format_grade(calculate_student_grade_average(student))),
                    ],
                    "notes": " | ".join(
                        [
                            f"Nota 1: {text_value(student['note1'], '-')}",
                            f"Nota 2: {text_value(student['note2'], '-')}",
                            f"Nota 3: {text_value(student['note3'], '-')}",
                            f"Nota 4: {text_value(student['note4'], '-')}",
                        ]
                    ),
                    "observations": text_value(student["observations"], "Sem observacoes registradas."),
                    "footer_lines": [
                        f"Cadastrado em: {format_datetime(student['created_at'])}",
                        f"Ultima atualizacao: {format_datetime(student['updated_at'])}",
                        f"Ultima chamada: {format_datetime(student['last_attendance_at'])}",
                    ],
                }
            )

        return cards

    def generate_selected_class_report(self):
        class_item = self.selected_class()
        students = sort_students_by_name(class_item["students"])
        summary = calculate_class_summary(students)
        timestamp = current_timestamp()

        summary_items = [
            ("Total de alunos", str(summary["student_count"]), "Quantidade cadastrada"),
            ("Frequencia media", f"{summary['average_frequency']}%", "Baseada na turma"),
            ("Media das notas", format_grade(summary["average_grade"]), "Notas validas"),
        ]
        subtitle = (
            f"Gerado em {format_datetime(timestamp)}. "
            f"Relatorio individual da turma {class_item['name']} com frequencia, notas, observacoes e datas."
        )
        report_file = REPORTS_DIR / f"relatorio-turma-{sanitize_filename(class_item['name'])}-{datetime.now().strftime('%Y-%m-%d-%H-%M')}.pdf"
        build_styled_report_pdf(
            report_file,
            f"Relatorio da turma {class_item['name']}",
            subtitle,
            summary_items,
            self.build_class_report_cards(class_item),
        )

        preview_lines = [
            f"Relatorio PDF da turma: {class_item['name']}",
            f"Arquivo: {report_file}",
            f"Total de alunos: {summary['student_count']}",
            f"Frequencia media: {summary['average_frequency']}%",
            f"Media das notas: {format_grade(summary['average_grade'])}",
        ]
        self.daily_report_status_var.set(f"Relatorio PDF da turma gerado em: {report_file}")
        self.save_status_var.set(f"Relatorio PDF da turma criado. Ultimo salvamento geral: {format_datetime(self.last_saved_at)}")
        self.set_report_panel_text("\n".join(preview_lines))

    def collect_daily_attendance(self, target_date, scope):
        if scope == "selected":
            classes = [self.selected_class()]
        else:
            classes = self.state["classes"]

        entries = []
        target_key = target_date.strftime("%Y-%m-%d")

        for class_item in classes:
            for student in class_item["students"]:
                for history_entry in student.get("attendance_history", []):
                    if format_date(history_entry["timestamp"]) != target_date.strftime("%d/%m/%Y"):
                        continue
                    entries.append(
                        {
                            "timestamp": history_entry["timestamp"],
                            "status": history_entry["status"],
                            "class_name": class_item["name"],
                            "student_name": student["name"],
                            "grade_level": student["grade_level"],
                            "grade_average": calculate_student_grade_average(student),
                            "observations": text_value(student.get("observations")),
                            "target_key": target_key,
                        }
                    )

        entries.sort(key=lambda item: (item["timestamp"], item["class_name"], item["student_name"].lower()))
        return classes, entries

    def build_daily_report_text(self, target_date, scope, classes, entries):
        report_title = "Relatorio diario geral" if scope == "all" else f"Relatorio diario da turma {classes[0]['name']}"
        presences = sum(1 for entry in entries if entry["status"] == "presence")
        absences = sum(1 for entry in entries if entry["status"] == "absence")

        lines = [
            APP_TITLE,
            report_title,
            f"Data do relatorio: {target_date.strftime('%d/%m/%Y')}",
            f"Gerado em: {format_datetime(current_timestamp())}",
            "",
            f"Total de registros do dia: {len(entries)}",
            f"Presencas no dia: {presences}",
            f"Faltas no dia: {absences}",
            "",
        ]

        if not entries:
            lines.append("Nenhum registro de chamada foi encontrado para essa data.")
            lines.append("Registre presencas ou faltas nessa data e gere o relatorio novamente quando quiser.")
            return "\n".join(lines)

        grouped_entries = {}
        for entry in entries:
            grouped_entries.setdefault(entry["class_name"], []).append(entry)

        for class_name, class_entries in grouped_entries.items():
            lines.append(f"Turma: {class_name}")
            lines.append(f"Registros nesta turma: {len(class_entries)}")
            for entry in class_entries:
                status_label = "Presenca" if entry["status"] == "presence" else "Falta"
                lines.append(
                    f"{format_datetime(entry['timestamp'])} | {entry['student_name']} | Serie {entry['grade_level']} | {status_label} | Media notas {format_grade(entry['grade_average'])}"
                )
                if entry["observations"]:
                    lines.append(f"Observacoes: {entry['observations']}")
            lines.append("")

        return "\n".join(lines).strip()

    def generate_daily_report(self, scope):
        target_date = parse_date_text(self.daily_report_date_var.get())
        if not target_date:
            messagebox.showwarning(APP_TITLE, "Digite a data do relatorio no formato dd/mm/aaaa.")
            return

        classes, entries = self.collect_daily_attendance(target_date, scope)
        report_text = self.build_daily_report_text(target_date, scope, classes, entries)

        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        scope_label = "geral" if scope == "all" else sanitize_filename(classes[0]["name"])
        report_file = REPORTS_DIR / f"relatorio-diario-{scope_label}-{target_date.strftime('%Y-%m-%d')}.pdf"
        presences = sum(1 for entry in entries if entry["status"] == "presence")
        absences = sum(1 for entry in entries if entry["status"] == "absence")
        summary_items = [
            ("Total de registros", str(len(entries)), "Lancamentos do dia"),
            ("Presencas", str(presences), "Somando todas as turmas"),
            ("Faltas", str(absences), "Somando todas as turmas"),
        ]
        cards = []
        if not entries:
            cards.append(
                {
                    "title": "Nenhum registro no dia",
                    "subtitle": f"Data: {target_date.strftime('%d/%m/%Y')}",
                    "highlight": "0",
                    "metrics": [("Presencas", "0"), ("Faltas", "0"), ("Media", "-")],
                    "notes": "-",
                    "observations": "Nenhum registro de chamada foi encontrado para essa data.",
                    "footer_lines": ["Registre presencas ou faltas e gere o relatorio novamente quando quiser."],
                }
            )
        else:
            for entry in entries:
                status_label = "Presenca" if entry["status"] == "presence" else "Falta"
                cards.append(
                    {
                        "title": f"{entry['student_name']} - {entry['class_name']}",
                        "subtitle": f"Serie: {entry['grade_level']}",
                        "highlight": status_label,
                        "metrics": [
                            ("Horario", format_datetime(entry["timestamp"]).split(" ")[1]),
                            ("Status", status_label),
                            ("Media", format_grade(entry["grade_average"])),
                        ],
                        "notes": f"Turma: {entry['class_name']} | Registro: {format_datetime(entry['timestamp'])}",
                        "observations": text_value(entry["observations"], "Sem observacoes registradas."),
                        "footer_lines": [f"Data do relatorio: {target_date.strftime('%d/%m/%Y')}", f"Tipo de lancamento: {status_label}"],
                    }
                )

        report_title = "Relatorio diario geral" if scope == "all" else f"Relatorio diario da turma {classes[0]['name']}"
        subtitle = (
            f"Gerado em {format_datetime(current_timestamp())}. "
            f"Resumo diario das chamadas em {target_date.strftime('%d/%m/%Y')}."
        )
        build_styled_report_pdf(report_file, report_title, subtitle, summary_items, cards)

        self.daily_report_status_var.set(f"Relatorio diario em PDF gerado em: {report_file}")
        self.save_status_var.set(f"Relatorio diario em PDF criado. Ultimo salvamento geral: {format_datetime(self.last_saved_at)}")
        self.set_report_panel_text(f"{report_text}\n\nArquivo PDF: {report_file}")

    def open_reports_folder(self):
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.startfile(REPORTS_DIR)
        except Exception:
            messagebox.showinfo(APP_TITLE, f"A pasta dos relatorios fica em:\n{REPORTS_DIR}")

    def select_tree_student(self, student_id):
        if self.student_tree.exists(student_id):
            self.student_tree.selection_set(student_id)
            self.student_tree.focus(student_id)

    def update_clock(self):
        self.live_date_var.set(format_live_datetime())
        self.root.after(60000, self.update_clock)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    AttendanceDesktopApp().run()
