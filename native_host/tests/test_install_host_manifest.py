import unittest
from pathlib import Path
import os
import shlex
import tempfile

from native_host.install_host_manifest import (
    WINDOWS_EDGE_REGISTRY_PATH,
    WINDOWS_GOOGLE_CHROME_REGISTRY_PATH,
    build_manifest,
    build_windows_host_launcher_script,
    build_windows_registry_file,
    write_host_launcher,
)


class InstallHostManifestTests(unittest.TestCase):
    def test_build_manifest_uses_fixed_extension_origin(self):
        manifest = build_manifest(Path("/tmp/host.py"))

        self.assertEqual(
            manifest["allowed_origins"],
            [
                "chrome-extension://aepngkiemocpnceofcaneojojogaoden/",
            ],
        )

    def test_build_manifest_can_include_extra_extension_ids_using_chrome_scheme(self):
        manifest = build_manifest(
            Path("/tmp/host.py"),
            extra_extension_ids=["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        )

        self.assertEqual(
            manifest["allowed_origins"],
            [
                "chrome-extension://aepngkiemocpnceofcaneojojogaoden/",
                "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/",
            ],
        )

    def test_write_host_launcher_creates_executable_script_and_manifest_points_to_it(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            host_script_path = Path(temp_dir) / "host.py"
            host_script_path.write_text("print('ok')\n", encoding="utf-8")

            launcher_path = write_host_launcher(
                host_script_path,
                python_executable=Path("/opt/homebrew/bin/python3"),
            )
            manifest = build_manifest(host_script_path)

            self.assertEqual(manifest["path"], str(launcher_path))
            self.assertEqual(
                launcher_path.read_text(encoding="utf-8"),
                "#!/bin/sh\nexec %s %s\n"
                % (
                    shlex.quote(str(Path("/opt/homebrew/bin/python3").resolve())),
                    shlex.quote(str(host_script_path.resolve())),
                ),
            )
            self.assertTrue(os.access(launcher_path, os.X_OK))

    def test_write_host_launcher_creates_windows_cmd_launcher_when_requested(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            host_script_path = Path(temp_dir) / "host.py"
            host_script_path.write_text("print('ok')\n", encoding="utf-8")

            launcher_path = write_host_launcher(
                host_script_path,
                python_executable=Path(r"C:\Python313\python.exe"),
                platform_name="windows",
            )
            manifest = build_manifest(host_script_path, platform_name="windows")

            self.assertEqual(launcher_path.suffix, ".cmd")
            self.assertEqual(manifest["path"], str(launcher_path))
            self.assertEqual(
                launcher_path.read_text(encoding="utf-8").replace("\r\n", "\n"),
                build_windows_host_launcher_script(
                    host_script_path,
                    python_executable=Path(r"C:\Python313\python.exe"),
                ).replace("\r\n", "\n"),
            )

    def test_build_windows_registry_file_contains_edge_and_chrome_keys(self):
        registry_text = build_windows_registry_file(Path(r"C:\native_host\com.codex.oauth.automation.json"))

        self.assertIn("Windows Registry Editor Version 5.00", registry_text)
        self.assertIn(WINDOWS_EDGE_REGISTRY_PATH, registry_text)
        self.assertIn(WINDOWS_GOOGLE_CHROME_REGISTRY_PATH, registry_text)
        self.assertIn(r'"C:\\native_host\\com.codex.oauth.automation.json"', registry_text)


if __name__ == "__main__":
    unittest.main()
