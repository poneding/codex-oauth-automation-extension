"""Install the Chrome/Edge Native Messaging host manifest for this repo checkout."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import shlex
import stat
import sys
from pathlib import Path, PureWindowsPath
from typing import Iterable


HOST_NAME = "com.codex.oauth.automation"
CHROME_EXTENSION_SCHEME = "chrome-extension"
EDGE_EXTENSION_SCHEME = "edge-extension"
DEFAULT_MACOS_DIR = Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts"
DEFAULT_WINDOWS_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local")) / "CodexOAuthAutomation" / "NativeMessagingHosts"
REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION_MANIFEST_PATH = REPO_ROOT / "manifest.json"
EXTENSION_ID_ALPHABET = "abcdefghijklmnop"
WINDOWS_EDGE_REGISTRY_SUBKEY = fr"Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}"
WINDOWS_GOOGLE_CHROME_REGISTRY_SUBKEY = fr"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"
WINDOWS_EDGE_REGISTRY_PATH = fr"HKEY_CURRENT_USER\{WINDOWS_EDGE_REGISTRY_SUBKEY}"
WINDOWS_GOOGLE_CHROME_REGISTRY_PATH = fr"HKEY_CURRENT_USER\{WINDOWS_GOOGLE_CHROME_REGISTRY_SUBKEY}"


def normalize_platform_name(platform_name: str | None = None) -> str:
    candidate = str(platform_name or "").strip().lower()
    if candidate in {"win", "win32", "windows", "nt"}:
        return "windows"
    return "posix"


def _looks_like_windows_path(value: str) -> bool:
    normalized = str(value or "").strip()
    return (
        len(normalized) >= 3
        and normalized[1:3] in {":\\", ":/"}
    ) or normalized.startswith("\\\\")


def normalize_windows_path_text(value: Path | str) -> str:
    raw_value = str(value)
    if _looks_like_windows_path(raw_value):
        return str(PureWindowsPath(raw_value))
    return str(Path(value).resolve())


def resolve_host_launcher_path(host_script_path: Path, platform_name: str | None = None) -> Path:
    host_script_path = host_script_path.resolve()
    suffix = ".cmd" if normalize_platform_name(platform_name) == "windows" else ".sh"
    return host_script_path.with_name(f"{host_script_path.stem}_launcher{suffix}")


def build_host_launcher_script(host_script_path: Path, python_executable: Path | None = None) -> str:
    host_script_path = host_script_path.resolve()
    python_executable = Path(python_executable or sys.executable).resolve()
    return (
        "#!/bin/sh\n"
        f"exec {shlex.quote(str(python_executable))} {shlex.quote(str(host_script_path))}\n"
    )


def build_windows_host_launcher_script(host_script_path: Path, python_executable: Path | None = None) -> str:
    host_script_path_text = normalize_windows_path_text(host_script_path)
    python_executable_text = normalize_windows_path_text(python_executable or sys.executable)
    return (
        "@echo off\r\n"
        "setlocal\r\n"
        f"\"{python_executable_text}\" \"{host_script_path_text}\" %*\r\n"
        "exit /b %ERRORLEVEL%\r\n"
    )


def write_host_launcher(
    host_script_path: Path,
    python_executable: Path | None = None,
    platform_name: str | None = None,
) -> Path:
    normalized_platform = normalize_platform_name(platform_name)
    launcher_path = resolve_host_launcher_path(host_script_path, platform_name=normalized_platform)
    if normalized_platform == "windows":
        launcher_path.write_text(
            build_windows_host_launcher_script(host_script_path, python_executable=python_executable),
            encoding="utf-8",
        )
        return launcher_path

    launcher_path.write_text(
        build_host_launcher_script(host_script_path, python_executable=python_executable),
        encoding="utf-8",
    )
    launcher_path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
    return launcher_path


def derive_extension_id(extension_key: str) -> str:
    key_bytes = base64.b64decode("".join(str(extension_key or "").split()), validate=True)
    digest = hashlib.sha256(key_bytes).hexdigest()[:32]
    return "".join(EXTENSION_ID_ALPHABET[int(char, 16)] for char in digest)


def load_extension_origin(manifest_path: Path = EXTENSION_MANIFEST_PATH) -> str:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    extension_key = str(manifest.get("key", "")).strip()
    if not extension_key:
        raise ValueError(f"Missing extension key in {manifest_path}")
    extension_id = derive_extension_id(extension_key)
    return f"{CHROME_EXTENSION_SCHEME}://{extension_id}/"


def load_extension_origins(manifest_path: Path = EXTENSION_MANIFEST_PATH) -> list[str]:
    chrome_origin = load_extension_origin(manifest_path=manifest_path)
    extension_id = chrome_origin.removeprefix(f"{CHROME_EXTENSION_SCHEME}://").strip("/")
    return [
        chrome_origin,
        f"{EDGE_EXTENSION_SCHEME}://{extension_id}/",
    ]


def build_manifest(host_script_path: Path, platform_name: str | None = None) -> dict[str, object]:
    launcher_path = resolve_host_launcher_path(host_script_path, platform_name=platform_name)
    return {
        "name": HOST_NAME,
        "description": "Codex OAuth automation native host",
        "path": str(launcher_path),
        "type": "stdio",
        "allowed_origins": [
            *load_extension_origins(),
        ],
    }


def get_default_install_dir(platform_name: str | None = None) -> Path:
    if normalize_platform_name(platform_name) == "windows":
        return DEFAULT_WINDOWS_DIR
    return DEFAULT_MACOS_DIR


def normalize_windows_browsers(browsers: Iterable[str] | None = None) -> list[str]:
    normalized = []
    for browser in browsers or ("edge", "chrome"):
        candidate = str(browser or "").strip().lower()
        if candidate in {"edge", "chrome"} and candidate not in normalized:
            normalized.append(candidate)
    return normalized or ["edge", "chrome"]


def get_windows_registry_paths(browsers: Iterable[str] | None = None) -> list[str]:
    registry_paths = []
    for browser in normalize_windows_browsers(browsers):
        if browser == "edge":
            registry_paths.append(WINDOWS_EDGE_REGISTRY_PATH)
        elif browser == "chrome":
            registry_paths.append(WINDOWS_GOOGLE_CHROME_REGISTRY_PATH)
    return registry_paths


def _escape_windows_registry_value(value: str) -> str:
    return value.replace("\\", "\\\\")


def build_windows_registry_file(manifest_path: Path, browsers: Iterable[str] | None = None) -> str:
    normalized_manifest_path = normalize_windows_path_text(manifest_path)
    escaped_manifest_path = _escape_windows_registry_value(normalized_manifest_path)
    chunks = ["Windows Registry Editor Version 5.00", ""]
    for registry_path in get_windows_registry_paths(browsers):
        chunks.extend([
            f"[{registry_path}]",
            f'@="{escaped_manifest_path}"',
            "",
        ])
    return "\n".join(chunks)


def install_windows_registry_entries(manifest_path: Path, browsers: Iterable[str] | None = None) -> list[str]:
    try:
        import winreg
    except ImportError as exc:  # pragma: no cover - only available on Windows
        raise RuntimeError("winreg is unavailable in the current Python runtime.") from exc

    normalized_manifest_path = str(Path(manifest_path).resolve())
    written_paths = []
    for browser in normalize_windows_browsers(browsers):
        subkey = WINDOWS_EDGE_REGISTRY_SUBKEY if browser == "edge" else WINDOWS_GOOGLE_CHROME_REGISTRY_SUBKEY
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, subkey) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, normalized_manifest_path)
        written_paths.append(subkey)
    return written_paths


def main() -> None:
    platform_name = normalize_platform_name(sys.platform)
    host_script_path = (Path(__file__).resolve().parent / "host.py").resolve()
    write_host_launcher(host_script_path, platform_name=platform_name)
    install_dir = Path(
        os.environ.get("CODEX_NATIVE_HOST_INSTALL_DIR", get_default_install_dir(platform_name))
    ).expanduser()
    install_dir.mkdir(parents=True, exist_ok=True)
    target_path = install_dir / f"{HOST_NAME}.json"
    target_path.write_text(
        json.dumps(build_manifest(host_script_path, platform_name=platform_name), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if platform_name == "windows":
        reg_file_path = install_dir / f"{HOST_NAME}.reg"
        reg_file_path.write_text(
            build_windows_registry_file(target_path),
            encoding="utf-8",
        )
        try:
            install_windows_registry_entries(target_path)
        except Exception as exc:  # pragma: no cover - Windows-only fallback path
            print(f"warning: failed to install registry entries automatically: {exc}", file=sys.stderr)
            print(reg_file_path)
    print(target_path)


if __name__ == "__main__":
    main()
