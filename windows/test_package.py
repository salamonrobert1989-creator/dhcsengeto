"""Validate the actual PE executable and its embedded application, without Windows."""
import hashlib
import json
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "downloads" / "Dunahid-csengeto.exe"


class PE:
    def __init__(self, path):
        self.data = path.read_bytes()
        if self.data[:2] != b"MZ":
            raise ValueError("Not a Windows executable")
        start = self.u32(0x3C)
        if self.data[start:start + 4] != b"PE\0\0":
            raise ValueError("Missing PE signature")
        self.machine, section_count = struct.unpack_from("<HH", self.data, start + 4)
        optional_size = self.u16(start + 20)
        self.optional = start + 24
        self.sections = []
        for i in range(section_count):
            offset = self.optional + optional_size + i * 40
            virtual_size, virtual_start, raw_size, raw_start = struct.unpack_from("<IIII", self.data, offset + 8)
            self.sections.append((virtual_start, max(virtual_size, raw_size), raw_start))

    def u16(self, offset):
        return struct.unpack_from("<H", self.data, offset)[0]

    def u32(self, offset):
        return struct.unpack_from("<I", self.data, offset)[0]

    def file_offset(self, rva):
        for start, size, raw in self.sections:
            if start <= rva < start + size:
                return raw + rva - start
        raise ValueError(f"RVA outside image: {rva:x}")

    def resource(self, kind, identifier):
        # PE32+ resource data directory; each level is relative to its root.
        base = self.file_offset(self.u32(self.optional + 112 + 2 * 8))
        directory = base
        for wanted in (kind, identifier, None):
            count = self.u16(directory + 12) + self.u16(directory + 14)
            entries = [struct.unpack_from("<II", self.data, directory + 16 + i * 8) for i in range(count)]
            selected = next(value for name, value in entries if wanted is None or name == wanted)
            if selected & 0x80000000:
                directory = base + (selected & 0x7FFFFFFF)
            else:
                entry = base + selected
                rva, size = struct.unpack_from("<II", self.data, entry)
                start = self.file_offset(rva)
                return self.data[start:start + size]
        raise ValueError("Resource data not found")

    def imports(self):
        rva = self.u32(self.optional + 112 + 8)
        if not rva:
            return []
        offset = self.file_offset(rva)
        result = []
        while any(self.data[offset:offset + 20]):
            start = self.file_offset(self.u32(offset + 12))
            result.append(self.data[start:self.data.index(b"\0", start)].decode("ascii"))
            offset += 20
        return result


class WindowsPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pe = PE(EXE)
        cls.metadata = json.loads(EXE.with_suffix(".build.json").read_text())

    def test_windows_x64_gui(self):
        self.assertEqual(self.pe.machine, 0x8664)
        self.assertEqual(self.pe.u16(self.pe.optional), 0x20B)
        self.assertEqual(self.pe.u16(self.pe.optional + 68), 2, "GUI subsystem, no console window")
        self.assertLess(len(self.pe.data), 5 * 1024 * 1024)

    def test_exact_current_html_embedded(self):
        self.assertEqual(self.pe.resource(10, 101), (ROOT / "dunahid-csengeto.html").read_bytes())

    def test_native_loader_embedded(self):
        loader = self.pe.resource(10, 102)
        self.assertEqual(loader[:2], b"MZ")
        pe_start = struct.unpack_from("<I", loader, 0x3C)[0]
        self.assertEqual(struct.unpack_from("<H", loader, pe_start + 4)[0], 0x8664)

    def test_no_separately_installed_compiler_runtime_needed(self):
        imports = [value.lower() for value in self.pe.imports()]
        forbidden = ("libstdc++", "libgcc", "libc++", "vcruntime", "msvcp", "webview2loader")
        self.assertFalse([value for value in imports if value.startswith(forbidden)])
        self.assertIn("kernel32.dll", imports)

    def test_no_admin_required_and_high_dpi_manifest(self):
        manifest = self.pe.resource(24, 1).decode("utf-8")
        self.assertIn('level="asInvoker"', manifest)
        self.assertIn("PerMonitorV2", manifest)
        self.assertNotIn("requireAdministrator", manifest)

    def test_build_metadata_and_checksum_match(self):
        digest = hashlib.sha256(self.pe.data).hexdigest()
        self.assertEqual(self.metadata["exe_sha256"], digest)
        self.assertEqual(self.metadata["size_bytes"], len(self.pe.data))
        self.assertEqual(EXE.with_suffix(".sha256").read_text().strip(), f"{digest}  {EXE.name}")
        for key, path in (("html_sha256", ROOT / "dunahid-csengeto.html"), ("native_source_sha256", ROOT / "windows" / "main.cpp")):
            self.assertEqual(self.metadata[key], hashlib.sha256(path.read_bytes()).hexdigest())

    def test_redistribution_notices_shipped(self):
        for identifier, name in ((103, "WebView2-LICENSE.txt"), (104, "WebView2-NOTICE.txt")):
            self.assertGreater((EXE.parent / name).stat().st_size, 100)
            self.assertEqual(self.pe.resource(10, identifier), (EXE.parent / name).read_bytes())


if __name__ == "__main__":
    unittest.main()
