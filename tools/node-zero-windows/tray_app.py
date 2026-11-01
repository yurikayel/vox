"""Quiet Windows system-tray launcher for Vox Populi Node Zero."""

from __future__ import annotations

import ctypes
import json
import os
import sys
import urllib.error
import urllib.request
import winreg
from ctypes import wintypes
from pathlib import Path

import node_zero


APP_TITLE = "Vox Populi"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE = "VoxPopuliNodeZero"
WM_APP = 0x8000
WM_TRAY = WM_APP + 1
WM_COMMAND = 0x0111
WM_DESTROY = 0x0002
WM_TIMER = 0x0113
WM_RBUTTONUP = 0x0205
WM_CONTEXTMENU = 0x007B
WM_LBUTTONDBLCLK = 0x0203
NIM_ADD = 0x00000000
NIM_MODIFY = 0x00000001
NIM_DELETE = 0x00000002
NIF_MESSAGE = 0x00000001
NIF_ICON = 0x00000002
NIF_TIP = 0x00000004
NIF_SHOWTIP = 0x00000080
MF_STRING = 0x00000000
MF_SEPARATOR = 0x00000800
MF_GRAYED = 0x00000001
TPM_RIGHTBUTTON = 0x0002
TPM_RETURNCMD = 0x0100
IMAGE_ICON = 1
LR_LOADFROMFILE = 0x0010
LR_DEFAULTSIZE = 0x0040
IDI_APPLICATION = -32512
ERROR_ALREADY_EXISTS = 183

ID_STATUS = 1001
ID_TOGGLE = 1002
ID_START_STOP = 1003
ID_AUTOSTART = 1004
ID_EXIT = 1005
ID_SETTINGS = 1006

LRESULT = ctypes.c_ssize_t
WNDPROC = ctypes.WINFUNCTYPE(
    LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM
)


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("message", wintypes.UINT),
        ("wParam", wintypes.WPARAM),
        ("lParam", wintypes.LPARAM),
        ("time", wintypes.DWORD),
        ("pt", POINT),
        ("lPrivate", wintypes.DWORD),
    ]


class WNDCLASSW(ctypes.Structure):
    _fields_ = [
        ("style", wintypes.UINT),
        ("lpfnWndProc", WNDPROC),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", wintypes.HINSTANCE),
        ("hIcon", wintypes.HICON),
        ("hCursor", wintypes.HANDLE),
        ("hbrBackground", wintypes.HBRUSH),
        ("lpszMenuName", wintypes.LPCWSTR),
        ("lpszClassName", wintypes.LPCWSTR),
    ]


class U_TIMEOUT_VERSION(ctypes.Union):
    _fields_ = [("uTimeout", wintypes.UINT), ("uVersion", wintypes.UINT)]


class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", ctypes.c_ubyte * 8),
    ]


class NOTIFYICONDATAW(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("hWnd", wintypes.HWND),
        ("uID", wintypes.UINT),
        ("uFlags", wintypes.UINT),
        ("uCallbackMessage", wintypes.UINT),
        ("hIcon", wintypes.HICON),
        ("szTip", wintypes.WCHAR * 128),
        ("dwState", wintypes.DWORD),
        ("dwStateMask", wintypes.DWORD),
        ("szInfo", wintypes.WCHAR * 256),
        ("uTimeoutVersion", U_TIMEOUT_VERSION),
        ("szInfoTitle", wintypes.WCHAR * 64),
        ("dwInfoFlags", wintypes.DWORD),
        ("guidItem", GUID),
        ("hBalloonIcon", wintypes.HICON),
    ]


def resource_path(name: str) -> Path:
    bundle = getattr(sys, "_MEIPASS", None)
    if bundle:
        return Path(bundle) / name
    return Path(__file__).resolve().parent.parent / "desktop-seeder-windows" / name


def autostart_enabled() -> bool:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            winreg.QueryValueEx(key, RUN_VALUE)
        return True
    except FileNotFoundError:
        return False


def set_autostart(enabled: bool) -> None:
    with winreg.OpenKey(
        winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE
    ) as key:
        if enabled:
            executable = Path(sys.executable).resolve()
            command = f'"{executable}"'
            if not getattr(sys, "frozen", False):
                command += f' "{Path(__file__).resolve()}"'
            winreg.SetValueEx(key, RUN_VALUE, 0, winreg.REG_SZ, command)
        else:
            try:
                winreg.DeleteValue(key, RUN_VALUE)
            except FileNotFoundError:
                pass


class TrayApp:
    def __init__(self) -> None:
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.shell32 = ctypes.WinDLL("shell32", use_last_error=True)
        self.hwnd = None
        self.icon = None
        self.mutex = None
        self.icon_added = False
        self.class_name = f"VoxPopuliTray_{os.getpid()}"
        self.callback = WNDPROC(self._window_proc)
        self._set_api_types()
        self.taskbar_created = self.user32.RegisterWindowMessageW("TaskbarCreated")

    def _set_api_types(self) -> None:
        self._set_kernel_api_types()
        self._set_user_api_types()
        self._set_shell_api_types()

    def _set_kernel_api_types(self) -> None:
        self.kernel.CreateMutexW.restype = wintypes.HANDLE
        self.kernel.CreateMutexW.argtypes = [
            wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR
        ]
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.CloseHandle.restype = wintypes.BOOL
        self.kernel.GetModuleHandleW.restype = wintypes.HINSTANCE

    def _set_user_api_types(self) -> None:
        self.user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
        self.user32.RegisterClassW.restype = wintypes.ATOM
        self.user32.RegisterWindowMessageW.argtypes = [wintypes.LPCWSTR]
        self.user32.RegisterWindowMessageW.restype = wintypes.UINT
        self._set_window_api_types()
        self._set_menu_api_types()
        self._set_message_api_types()

    def _set_window_api_types(self) -> None:
        self.user32.CreateWindowExW.argtypes = [
            wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
            wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID,
        ]
        self.user32.CreateWindowExW.restype = wintypes.HWND
        self.user32.DefWindowProcW.argtypes = [
            wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM
        ]
        self.user32.DefWindowProcW.restype = LRESULT
        self.user32.LoadImageW.argtypes = [
            wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT,
            ctypes.c_int, ctypes.c_int, wintypes.UINT,
        ]
        self.user32.LoadImageW.restype = wintypes.HANDLE
        self.user32.LoadIconW.argtypes = [wintypes.HINSTANCE, wintypes.LPVOID]
        self.user32.LoadIconW.restype = wintypes.HICON

    def _set_menu_api_types(self) -> None:
        self.user32.CreatePopupMenu.restype = wintypes.HMENU
        self.user32.AppendMenuW.argtypes = [
            wintypes.HMENU, wintypes.UINT, ctypes.c_size_t, wintypes.LPCWSTR
        ]
        self.user32.TrackPopupMenu.argtypes = [
            wintypes.HMENU, wintypes.UINT, ctypes.c_int, ctypes.c_int,
            ctypes.c_int, wintypes.HWND, wintypes.LPVOID,
        ]
        self.user32.TrackPopupMenu.restype = wintypes.UINT
        self.user32.GetCursorPos.argtypes = [ctypes.POINTER(POINT)]
        self.user32.SetForegroundWindow.argtypes = [wintypes.HWND]
        self.user32.DestroyMenu.argtypes = [wintypes.HMENU]

    def _set_message_api_types(self) -> None:
        self.user32.PostMessageW.argtypes = [
            wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM
        ]
        self.user32.DestroyWindow.argtypes = [wintypes.HWND]
        self.user32.MessageBoxW.argtypes = [
            wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT
        ]
        self.user32.GetMessageW.argtypes = [
            ctypes.POINTER(MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT
        ]
        self.user32.TranslateMessage.argtypes = [ctypes.POINTER(MSG)]
        self.user32.DispatchMessageW.argtypes = [ctypes.POINTER(MSG)]
        self.user32.PostQuitMessage.argtypes = [ctypes.c_int]
        self.user32.SetTimer.argtypes = [
            wintypes.HWND, ctypes.c_size_t, wintypes.UINT, wintypes.LPVOID
        ]
        self.user32.SetTimer.restype = ctypes.c_size_t
        self.user32.KillTimer.argtypes = [wintypes.HWND, ctypes.c_size_t]

    def _set_shell_api_types(self) -> None:
        self.shell32.Shell_NotifyIconW.argtypes = [
            wintypes.DWORD, ctypes.POINTER(NOTIFYICONDATAW)
        ]
        self.shell32.Shell_NotifyIconW.restype = wintypes.BOOL

    def _claim_single_instance(self) -> bool:
        name = "Local\\VoxPopuli.NodeZero.Tray"
        ctypes.set_last_error(0)
        self.mutex = self.kernel.CreateMutexW(None, False, name)
        claimed = bool(self.mutex) and ctypes.get_last_error() != ERROR_ALREADY_EXISTS
        if not claimed and self.mutex:
            self.kernel.CloseHandle(self.mutex)
            self.mutex = None
        return claimed

    def _load_icon(self):
        path = resource_path("vox.ico")
        if path.exists():
            icon = self.user32.LoadImageW(
                None, str(path), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE
            )
            if icon:
                return icon
        return self.user32.LoadIconW(None, ctypes.c_void_p(IDI_APPLICATION))

    def _create_window(self) -> bool:
        instance = self.kernel.GetModuleHandleW(None)
        window_class = WNDCLASSW()
        window_class.lpfnWndProc = self.callback
        window_class.hInstance = instance
        window_class.lpszClassName = self.class_name
        self.user32.RegisterClassW(ctypes.byref(window_class))
        self.hwnd = self.user32.CreateWindowExW(
            0, self.class_name, APP_TITLE, 0, 0, 0, 0, 0,
            ctypes.c_void_p(-3), None, instance, None,
        )
        return bool(self.hwnd)

    def _add_icon(self) -> bool:
        data = NOTIFYICONDATAW()
        data.cbSize = ctypes.sizeof(data)
        data.hWnd = self.hwnd
        data.uID = 1
        data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_SHOWTIP
        data.uCallbackMessage = WM_TRAY
        self.icon = self._load_icon()
        data.hIcon = self.icon
        data.szTip = "Vox Populi — iniciando nó local"
        self.icon_added = bool(self.shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(data)))
        return self.icon_added

    def _status(self) -> dict | None:
        try:
            with urllib.request.urlopen(
                f"http://{node_zero.CONTROL_HOST}:{node_zero.CONTROL_PORT}/api/status",
                timeout=1,
            ) as response:
                return json.loads(response.read())
        except (OSError, urllib.error.URLError, ValueError):
            return None

    def _show_status(self) -> None:
        status = self._status()
        if not status:
            detail = "Nó local indisponível. Abra Vox Populi para iniciá-lo."
        else:
            resources = status.get("resources", {})
            governor = resources.get("governor", {})
            detail = (
                f"Estado: {status.get('state', 'desconhecido')}\n"
                f"Relay/cache: {'ativo' if status.get('relay', {}).get('active') else 'pausado'}\n"
                f"CPU: {governor.get('cpuBudgetPercent', '—')}% "
                f"({'aplicado' if governor.get('cpuLimitApplied') else 'prioridade reduzida'})\n"
                f"RAM: {governor.get('memoryBudgetMb', '—')} MB "
                f"({'aplicado' if governor.get('memoryLimitApplied') else 'não aplicado'})\n"
                f"Cache: {status.get('relay', {}).get('cacheBytes', 0) // 1024} KiB / "
                f"{status.get('relay', {}).get('cacheLimitMb', 0)} MB"
            )
        self.user32.MessageBoxW(self.hwnd, detail, APP_TITLE, 0x40)

    def _show_settings(self) -> None:
        try:
            import tkinter as tk
            from tkinter import messagebox
        except ImportError:
            self.user32.MessageBoxW(
                self.hwnd, "A tela de preferências não está disponível.", APP_TITLE, 0x10
            )
            return

        data_dir = node_zero.app_data_dir()
        status = self._status() or {}
        initial = status.get("settings") or node_zero.load_node_config(data_dir / "settings.json")
        fields = (
            ("cpuIdleSharePercent", "CPU quando o PC está ocioso (%)", 1, 70),
            ("cpuActiveSharePercent", "CPU durante uso ativo (%)", 1, 20),
            ("memoryLimitMb", "Teto de memória (MB)", 512, 8192),
            ("cacheLimitMb", "Teto de cache em disco (MB)", 64, 65536),
        )
        window = tk.Tk()
        window.title("Vox Populi — Preferências")
        window.resizable(False, False)
        window.columnconfigure(1, weight=1)
        entries = self._build_settings_form(tk, window, initial, fields)
        self._build_settings_buttons(tk, window, entries, messagebox, data_dir, len(fields))
        window.mainloop()

    def _build_settings_form(self, tk, window, initial, fields):
        entries = {}
        for row, (key, label, _minimum, _maximum) in enumerate(fields):
            tk.Label(window, text=label, anchor="w").grid(
                row=row, column=0, padx=12, pady=6, sticky="w"
            )
            value = tk.StringVar(value=str(initial[key]))
            entry = tk.Entry(window, textvariable=value, width=10)
            entry.grid(row=row, column=1, padx=12, pady=6, sticky="e")
            entries[key] = value
        tk.Label(
            window,
            text="Limites são aplicados pelo governador local; pressão do sistema reduz o uso automaticamente.",
            wraplength=380,
            justify="left",
        ).grid(row=len(fields), column=0, columnspan=2, padx=12, pady=(8, 4), sticky="w")
        return entries

    def _build_settings_buttons(self, tk, window, entries, messagebox, data_dir, row):
        buttons = tk.Frame(window)
        buttons.grid(row=row + 1, column=0, columnspan=2, padx=12, pady=10, sticky="e")
        tk.Button(buttons, text="Cancelar", command=window.destroy).pack(side="right", padx=(8, 0))
        save = lambda: self._save_settings(entries, window, messagebox, data_dir)
        tk.Button(buttons, text="Salvar", command=save, default="active").pack(side="right")
        window.bind("<Return>", lambda _event: save())

    def _save_settings(self, entries, window, messagebox, data_dir) -> None:
        try:
            values = {key: int(value.get()) for key, value in entries.items()}
            config = node_zero.validate_node_config(values)
        except (ValueError, TypeError) as error:
            messagebox.showerror(APP_TITLE, str(error), parent=window)
            return
        saved, confirmation = self._persist_settings(config, data_dir)
        if not saved:
            messagebox.showerror(
                APP_TITLE, "Não foi possível aplicar as preferências ao nó local.", parent=window
            )
            return
        messagebox.showinfo(APP_TITLE, confirmation, parent=window)
        window.destroy()

    def _persist_settings(self, config, data_dir):
        if self._status():
            saved = node_zero.request_config(config, data_dir) == 0
            return saved, "Preferências salvas e aplicadas ao nó local."
        try:
            node_zero.save_node_config(data_dir, config)
        except OSError:
            return False, ""
        return True, "Preferências salvas para a próxima inicialização do nó."

    def _set_tip(self, text: str) -> None:
        if not self.icon_added:
            return
        data = NOTIFYICONDATAW()
        data.cbSize = ctypes.sizeof(data)
        data.hWnd = self.hwnd
        data.uID = 1
        data.uFlags = NIF_TIP
        data.szTip = text[:127]
        self.shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(data))

    def _refresh_tip(self) -> None:
        status = self._status()
        state = status.get("state", "indisponível") if status else "indisponível"
        self._set_tip(f"Vox Populi — {state}")

    def _menu(self) -> int:
        menu = self.user32.CreatePopupMenu()
        status = self._status()
        running = bool(status and status.get("relay", {}).get("active"))
        paused = bool(status and status.get("state") == "PAUSED")
        self._append(menu, MF_STRING | MF_GRAYED, 0, f"Vox Populi — {status.get('state') if status else 'parado'}")
        self.user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
        self._append(menu, MF_STRING, ID_STATUS, "Ver status")
        self._append(menu, MF_STRING, ID_SETTINGS, "Preferências…")
        toggle = "Retomar contribuição" if paused or not running else "Pausar contribuição"
        self._append(menu, MF_STRING, ID_TOGGLE, toggle)
        service_action = "Parar nó local" if status else "Iniciar nó local"
        self._append(menu, MF_STRING, ID_START_STOP, service_action)
        self._append(
            menu, MF_STRING, ID_AUTOSTART,
            "✓ Iniciar com o Windows" if autostart_enabled() else "Iniciar com o Windows",
        )
        self.user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
        self._append(menu, MF_STRING, ID_EXIT, "Sair e parar o nó")
        point = POINT()
        self.user32.GetCursorPos(ctypes.byref(point))
        self.user32.SetForegroundWindow(self.hwnd)
        selected = self.user32.TrackPopupMenu(
            menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, point.x, point.y, 0, self.hwnd, None
        )
        self.user32.DestroyMenu(menu)
        self.user32.PostMessageW(self.hwnd, 0, 0, 0)
        return selected

    def _append(self, menu, flags: int, item_id: int, label: str) -> None:
        self.user32.AppendMenuW(menu, flags, item_id, label)

    def _start_node(self) -> None:
        try:
            node_zero.start_background(node_zero.app_data_dir())
            self._refresh_tip()
        except OSError:
            self._set_tip("Vox Populi — erro ao iniciar o nó")

    def _stop_node(self) -> bool:
        if not self._status():
            return True
        stopped = node_zero.request_control("stop", node_zero.app_data_dir()) == 0
        self._refresh_tip()
        if not stopped:
            self.user32.MessageBoxW(
                self.hwnd,
                "O Vox Populi não confirmou o encerramento do nó local.",
                APP_TITLE,
                0x10,
            )
        return stopped

    def _handle_menu_choice(self, selected: int) -> None:
        if selected == ID_STATUS:
            self._show_status()
        elif selected == ID_SETTINGS:
            self._show_settings()
        elif selected == ID_TOGGLE:
            status = self._status()
            if not status:
                self._start_node()
            else:
                action = "resume" if status.get("state") == "PAUSED" else "pause"
                node_zero.request_control(action, node_zero.app_data_dir())
            self._refresh_tip()
        elif selected == ID_START_STOP:
            if self._status():
                self._stop_node()
            else:
                self._start_node()
        elif selected == ID_AUTOSTART:
            set_autostart(not autostart_enabled())
        elif selected == ID_EXIT:
            if not self._stop_node():
                return
            self._remove_icon()
            self.user32.DestroyWindow(self.hwnd)

    def _window_proc(self, hwnd, message, wparam, lparam):
        if message == self.taskbar_created:
            self.icon_added = False
            if self._add_icon():
                self._refresh_tip()
            return 0
        if message == WM_TRAY:
            event = int(lparam) & 0xFFFF
            if event in (WM_RBUTTONUP, WM_CONTEXTMENU):
                self._handle_menu_choice(self._menu())
            elif event == WM_LBUTTONDBLCLK:
                self._show_status()
            return 0
        if message == WM_DESTROY:
            self.user32.KillTimer(hwnd, 1)
            self.user32.PostQuitMessage(0)
            return 0
        if message == WM_TIMER:
            self._refresh_tip()
            return 0
        if message == WM_COMMAND:
            self._handle_menu_choice(int(wparam) & 0xFFFF)
            return 0
        return self.user32.DefWindowProcW(hwnd, message, wparam, lparam)

    def _remove_icon(self) -> None:
        if not self.icon_added:
            return
        data = NOTIFYICONDATAW()
        data.cbSize = ctypes.sizeof(data)
        data.hWnd = self.hwnd
        data.uID = 1
        self.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(data))
        self.icon_added = False

    def run(self) -> int:
        if not self._claim_single_instance():
            return 0
        if not self._create_window() or not self._add_icon():
            if self.hwnd:
                self.user32.DestroyWindow(self.hwnd)
            if self.mutex:
                self.kernel.CloseHandle(self.mutex)
                self.mutex = None
            return 1
        self.user32.SetTimer(self.hwnd, 1, 15000, None)
        self._start_node()
        message = MSG()
        while self.user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
            self.user32.TranslateMessage(ctypes.byref(message))
            self.user32.DispatchMessageW(ctypes.byref(message))
        self._remove_icon()
        if self.mutex:
            self.kernel.CloseHandle(self.mutex)
        return int(message.wParam)


def main() -> int:
    if os.name != "nt":
        print("O Vox Populi Tray só pode ser executado no Windows.", file=sys.stderr)
        return 2
    if "--node-service" in sys.argv[1:]:
        return node_zero.NodeZero(node_zero.app_data_dir()).run()
    return TrayApp().run()


if __name__ == "__main__":
    raise SystemExit(main())
