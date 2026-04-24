import types
import unittest

from native_host.host import configure_stdio_binary_mode


class FakeStream:
    def __init__(self, descriptor):
        self._descriptor = descriptor

    def fileno(self):
        return self._descriptor


class ConfigureStdioBinaryModeTests(unittest.TestCase):
    def test_configure_stdio_binary_mode_updates_windows_streams(self):
        calls = []
        fake_msvcrt = types.SimpleNamespace(
            setmode=lambda descriptor, flag: calls.append((descriptor, flag))
        )
        fake_os = types.SimpleNamespace(name="nt", O_BINARY=32768)

        configure_stdio_binary_mode(
            stdin=FakeStream(10),
            stdout=FakeStream(11),
            os_module=fake_os,
            msvcrt_module=fake_msvcrt,
        )

        self.assertEqual(calls, [(10, 32768), (11, 32768)])

    def test_configure_stdio_binary_mode_is_noop_outside_windows(self):
        calls = []
        fake_msvcrt = types.SimpleNamespace(
            setmode=lambda descriptor, flag: calls.append((descriptor, flag))
        )
        fake_os = types.SimpleNamespace(name="posix", O_BINARY=32768)

        configure_stdio_binary_mode(
            stdin=FakeStream(10),
            stdout=FakeStream(11),
            os_module=fake_os,
            msvcrt_module=fake_msvcrt,
        )

        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
