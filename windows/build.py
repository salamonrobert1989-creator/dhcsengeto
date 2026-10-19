#!/usr/bin/env python3
"""Build the portable Windows x64 EXE on Linux or Windows with Zig 0.14.1."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SDK_VERSION = "1.0.4258.31"
SDK_SHA256 = "56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9"
ZIG_VERSION = "0.14.1"
INTERFACES = {
    "EnvironmentOptions": "ICoreWebView2EnvironmentOptions",
    "EnvironmentReady": "ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler",
    "ControllerReady": "ICoreWebView2CreateCoreWebView2ControllerCompletedHandler",
    "ScriptReady": "ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler",
    "ScriptExecuted": "ICoreWebView2ExecuteScriptCompletedHandler",
    "NavigationStarting": "ICoreWebView2NavigationStartingEventHandler",
    "NewWindowRequested": "ICoreWebView2NewWindowRequestedEventHandler",
    "ProcessFailed": "ICoreWebView2ProcessFailedEventHandler",
    "WebView3": "ICoreWebView2_3",
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sdk(cache):
    package = cache / f"microsoft.web.webview2.{SDK_VERSION}.nupkg"
    if not package.exists():
        url = f"https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/{SDK_VERSION}/{package.name}"
        print(f"Downloading official Microsoft WebView2 SDK {SDK_VERSION}", flush=True)
        with urllib.request.urlopen(url, timeout=90) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != SDK_SHA256:
            raise RuntimeError("WebView2 SDK checksum mismatch; download was not used")
        package.write_bytes(data)
    if sha256(package) != SDK_SHA256:
        raise RuntimeError(f"Cached SDK checksum mismatch: {package}")
    destination = cache / "webview2"
    destination.mkdir(exist_ok=True)
    files = {
        "build/native/include/WebView2.h": "WebView2.h",
        "build/native/x64/WebView2Loader.dll": "WebView2Loader.dll",
        "LICENSE.txt": "WebView2-LICENSE.txt",
        "NOTICE.txt": "WebView2-NOTICE.txt",
    }
    with zipfile.ZipFile(package) as archive:
        for source, target in files.items():
            (destination / target).write_bytes(archive.read(source))
    return destination


def interface_ids(header):
    definitions = ["// Generated from the checksum-verified Microsoft SDK.", "#pragma once"]
    for label, name in INTERFACES.items():
        match = re.search(r'MIDL_INTERFACE\("([0-9a-fA-F-]+)"\)\s+' + re.escape(name) + r'\s*:', header)
        if not match:
            raise RuntimeError(f"SDK interface not found: {name}")
        value = uuid.UUID(match[1])
        tail = ", ".join(f"0x{b:02x}" for b in value.bytes[8:])
        definitions.append(f"constexpr IID IID_{label} = {{0x{value.time_low:08x}, 0x{value.time_mid:04x}, 0x{value.time_hi_version:04x}, {{{tail}}}}};")
    return "\n".join(definitions) + "\n"


def rc_path(path):
    return str(path.resolve()).replace("\\", "/").replace('"', '\\"')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zig", default=shutil.which("zig"))
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".cache" / "windows")
    parser.add_argument("--output", type=Path, default=ROOT / "downloads" / "Dunahid-csengeto.exe")
    options = parser.parse_args()
    if not options.zig:
        parser.error("Zig is required: pip install ziglang==0.14.1, then --zig <ziglang/zig>")
    zig = str(Path(options.zig).resolve())
    actual_version = subprocess.check_output([zig, "version"], text=True).strip()
    if actual_version != ZIG_VERSION:
        raise RuntimeError(f"Expected Zig {ZIG_VERSION}, found {actual_version}")
    cache = options.cache_dir.resolve()
    cache.mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ, ZIG_GLOBAL_CACHE_DIR=str(cache / "zig-global"), ZIG_LOCAL_CACHE_DIR=str(cache / "zig-local"))
    sdk_folder = sdk(cache)
    (cache / "webview_guids.h").write_text(interface_ids((sdk_folder / "WebView2.h").read_text()), encoding="utf-8")
    resources = f'''#include <windows.h>
101 RCDATA "{rc_path(ROOT / 'dunahid-csengeto.html')}"
102 RCDATA "{rc_path(sdk_folder / 'WebView2Loader.dll')}"
103 RCDATA "{rc_path(sdk_folder / 'WebView2-LICENSE.txt')}"
104 RCDATA "{rc_path(sdk_folder / 'WebView2-NOTICE.txt')}"
1 24 "{rc_path(ROOT / 'windows' / 'app.manifest')}"
1 VERSIONINFO
FILEVERSION 1,0,0,0
PRODUCTVERSION 1,0,0,0
FILEOS VOS_NT_WINDOWS32
FILETYPE VFT_APP
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040e04b0"
    BEGIN
      VALUE "FileDescription", "Dunahíd csengető\\0"
      VALUE "ProductName", "Dunahíd csengető\\0"
      VALUE "FileVersion", "1.0.0\\0"
      VALUE "ProductVersion", "1.0.0\\0"
      VALUE "OriginalFilename", "Dunahid-csengeto.exe\\0"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x040e, 1200
  END
END
'''
    (cache / "app.rc").write_text(resources, encoding="utf-8")
    subprocess.run([zig, "rc", "/c65001", f"/fo{cache / 'app.res'}", str(cache / "app.rc")], env=environment, check=True)
    output = options.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [zig, "c++", "-target", "x86_64-windows-gnu", "-std=c++17", "-Os", "-s", "-static", "-Wl,--subsystem,windows", "-municode",
               "-fms-extensions", "-Wno-ignored-attributes", "-Wno-pragma-pack", "-I", str(ROOT / "windows" / "compat"), "-I", str(sdk_folder), "-I", str(cache),
               str(ROOT / "windows" / "main.cpp"), str(cache / "app.res"), "-o", str(output),
               "-lole32", "-lshell32", "-lshlwapi", "-luser32", "-ladvapi32", "-luuid"]
    print("Compiling portable Windows x64 application", flush=True)
    subprocess.run(command, env=environment, check=True)
    for name in ("WebView2-LICENSE.txt", "WebView2-NOTICE.txt"):
        shutil.copyfile(sdk_folder / name, output.parent / name)
    metadata = {
        "file": output.name, "target": "Windows 11 x64", "zig": actual_version,
        "webview2_sdk": SDK_VERSION, "webview2_sdk_sha256": SDK_SHA256,
        "html_sha256": sha256(ROOT / "dunahid-csengeto.html"),
        "native_source_sha256": sha256(ROOT / "windows" / "main.cpp"),
        "exe_sha256": sha256(output), "size_bytes": output.stat().st_size,
    }
    output.with_suffix(".build.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    output.with_suffix(".sha256").write_text(f"{metadata['exe_sha256']}  {output.name}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
