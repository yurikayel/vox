"""Windows host telemetry and process resource controls for Vox Node Zero."""

from __future__ import annotations

import ctypes
from ctypes import wintypes


class FILETIME(ctypes.Structure):
    _fields_ = [("low", wintypes.DWORD), ("high", wintypes.DWORD)]

    def value(self) -> int:
        return (self.high << 32) | self.low


class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", wintypes.DWORD),
        ("dwMemoryLoad", wintypes.DWORD),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]


class CPU_RATE_INFO(ctypes.Structure):
    _fields_ = [("control_flags", wintypes.DWORD), ("cpu_rate", wintypes.DWORD)]


class BASIC_LIMIT_INFO(ctypes.Structure):
    _fields_ = [
        ("per_process_user_time", ctypes.c_longlong),
        ("per_job_user_time", ctypes.c_longlong),
        ("limit_flags", wintypes.DWORD),
        ("minimum_working_set", ctypes.c_size_t),
        ("maximum_working_set", ctypes.c_size_t),
        ("active_process_limit", wintypes.DWORD),
        ("affinity", ctypes.c_size_t),
        ("priority_class", wintypes.DWORD),
        ("scheduling_class", wintypes.DWORD),
    ]


class IO_COUNTERS(ctypes.Structure):
    _fields_ = [(name, ctypes.c_ulonglong) for name in (
        "read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes"
    )]


class EXTENDED_LIMIT_INFO(ctypes.Structure):
    _fields_ = [
        ("basic", BASIC_LIMIT_INFO),
        ("io", IO_COUNTERS),
        ("process_memory_limit", ctypes.c_size_t),
        ("job_memory_limit", ctypes.c_size_t),
        ("peak_process_memory", ctypes.c_size_t),
        ("peak_job_memory", ctypes.c_size_t),
    ]


class WindowsHost:
    def __init__(self) -> None:
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.GetSystemTimes.argtypes = [
            ctypes.POINTER(FILETIME), ctypes.POINTER(FILETIME), ctypes.POINTER(FILETIME)
        ]
        self.kernel.GetSystemTimes.restype = wintypes.BOOL
        self.kernel.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MEMORYSTATUSEX)]
        self.kernel.GlobalMemoryStatusEx.restype = wintypes.BOOL
        self.kernel.GetTickCount64.restype = ctypes.c_ulonglong
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.user32.GetLastInputInfo.argtypes = [ctypes.POINTER(LASTINPUTINFO)]
        self.user32.GetLastInputInfo.restype = wintypes.BOOL
        self._last_cpu: tuple[int, int] | None = None

    @staticmethod
    def _filetime_value(value: FILETIME) -> int:
        return value.value()

    def _system_cpu(self) -> tuple[int, int] | None:
        idle, kernel, user = FILETIME(), FILETIME(), FILETIME()
        if not self.kernel.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
            return None
        return self._filetime_value(idle), self._filetime_value(kernel) + self._filetime_value(user)

    def cpu_idle_percent(self) -> float | None:
        current = self._system_cpu()
        previous = self._last_cpu
        self._last_cpu = current
        if current is None or previous is None:
            return None
        total = current[1] - previous[1]
        idle = current[0] - previous[0]
        return max(0.0, min(100.0, idle * 100 / total)) if total else None

    def memory(self) -> tuple[int, int]:
        status = MEMORYSTATUSEX()
        status.dwLength = ctypes.sizeof(status)
        if not self.kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
            return 0, 0
        return status.ullTotalPhys, status.ullAvailPhys

    def idle_seconds(self) -> float | None:
        info = LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(info)
        if not self.user32.GetLastInputInfo(ctypes.byref(info)):
            return None
        elapsed = (self.kernel.GetTickCount64() - info.dwTime) & 0xFFFFFFFF
        return elapsed / 1000

    def snapshot(self) -> dict:
        total, available = self.memory()
        cpu_idle = self.cpu_idle_percent()
        idle_seconds = self.idle_seconds()
        cpu_busy = None if cpu_idle is None else 100 - cpu_idle
        pressure = available < 2 * 1024**3 or (cpu_busy is not None and cpu_busy >= 90)
        state = "PRESSURE" if pressure else "IDLE" if (idle_seconds or 0) >= 300 else "ACTIVE"
        return {
            "cpuIdlePercent": round(cpu_idle, 1) if cpu_idle is not None else None,
            "cpuBusyPercent": round(cpu_busy, 1) if cpu_busy is not None else None,
            "ramTotalBytes": total,
            "ramAvailableBytes": available,
            "idleSeconds": round(idle_seconds, 1) if idle_seconds is not None else None,
            "state": state,
            "temperatureC": None,
            "temperatureStatus": "not_available_on_this_windows_build",
        }


class WindowsJobGovernor:
    CPU_ENABLE = 0x1
    CPU_HARD_CAP = 0x4
    JOB_MEMORY_LIMIT = 0x200

    def __init__(self) -> None:
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.GetCurrentProcess.restype = wintypes.HANDLE
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.CloseHandle.restype = wintypes.BOOL
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        self.kernel.SetInformationJobObject.argtypes = [
            wintypes.HANDLE, wintypes.INT, wintypes.LPVOID, wintypes.DWORD
        ]
        self.kernel.SetInformationJobObject.restype = wintypes.BOOL
        self.handle = self.kernel.CreateJobObjectW(None, None)
        self.error = ""
        if not self.handle:
            self.error = ctypes.WinError(ctypes.get_last_error()).strerror
            return
        current = self.kernel.GetCurrentProcess()
        if not self.kernel.AssignProcessToJobObject(self.handle, current):
            self.error = ctypes.WinError(ctypes.get_last_error()).strerror
            self.kernel.CloseHandle(self.handle)
            self.handle = None

    def set_fallback_priority(self, state: str) -> bool:
        priorities = {"IDLE": 0x40, "ACTIVE": 0x4000, "PRESSURE": 0x4000}
        current = self.kernel.GetCurrentProcess()
        self.kernel.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        self.kernel.SetPriorityClass.restype = wintypes.BOOL
        return bool(self.kernel.SetPriorityClass(current, priorities.get(state, 0x4000)))

    def set_cpu_limit(self, percent: float) -> bool:
        if not self.handle:
            return False
        info = CPU_RATE_INFO(self.CPU_ENABLE | self.CPU_HARD_CAP, int(max(1, min(100, percent)) * 100))
        ok = self.kernel.SetInformationJobObject(self.handle, 15, ctypes.byref(info), ctypes.sizeof(info))
        if not ok:
            self.error = ctypes.WinError(ctypes.get_last_error()).strerror
        return bool(ok)

    def set_memory_limit(self, amount: int) -> bool:
        if not self.handle or amount <= 0:
            return False
        info = EXTENDED_LIMIT_INFO()
        info.basic.limit_flags = self.JOB_MEMORY_LIMIT
        info.job_memory_limit = amount
        ok = self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(info), ctypes.sizeof(info))
        if not ok:
            self.error = ctypes.WinError(ctypes.get_last_error()).strerror
        return bool(ok)

    def close(self) -> None:
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None
