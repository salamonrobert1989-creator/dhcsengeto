#!/usr/bin/env python3
"""Package the existing Windows executable without recompiling it."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
GUIDE = """Dunahíd csengető – Windows 11

1. Kattints jobb gombbal a ZIP-fájlra, és válaszd Az összes kibontása lehetőséget.
2. Nyisd meg a kibontott Dunahid-csengeto mappát.
3. Indítsd el a Dunahid-csengeto.exe fájlt. Telepítés nem szükséges.
4. A Próbacsengés gombbal ellenőrizd a hangot és a leállítást.

A korábbi, böngészőben megnyitott HTML-változatot zárd be, hogy ne legyen
kettős csengetés. A menetrendi adatok első letöltéséhez internet szükséges.

A Microsoft Edge WebView2 futtatókörnyezet Windows 11-en rendszerint már
telepítve van. Ha hiányzik, a program felajánlja a Microsoft letöltési oldalát.

A program futás közben automatikus ébren tartást kér a Windowstól.
A kézi altatás, hibernálás és kikapcsolás közben nem tud csengetni.

A csomaghoz ellenőrzőösszeg, fordítási jegyzék és Microsoft-licencszövegek
is tartoznak. A Windows 11 alatti natív indítás a Linuxos építőkörnyezetben
nem volt ellenőrizhető; első használatkor próbáld ki a hangjelzést.

Forrás és frissítések:
https://github.com/salamonrobert1989-creator/dhcsengeto
"""


def create_archive(executable=ROOT / "downloads" / "Dunahid-csengeto.exe"):
    executable = Path(executable)
    metadata = executable.with_suffix(".build.json")
    checksum = executable.with_suffix(".sha256")
    files = [executable, metadata, checksum,
             executable.parent / "WebView2-LICENSE.txt",
             executable.parent / "WebView2-NOTICE.txt"]
    digest = hashlib.sha256(executable.read_bytes()).hexdigest()
    if json.loads(metadata.read_text(encoding="utf-8"))["exe_sha256"] != digest:
        raise ValueError("The executable does not match its build metadata")
    if checksum.read_text(encoding="utf-8").strip() != f"{digest}  {executable.name}":
        raise ValueError("The executable does not match its checksum file")
    archive = executable.with_name(f"{executable.stem}-Windows11.zip")
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path in files:
            output.write(path, f"Dunahid-csengeto/{path.name}")
        output.writestr("Dunahid-csengeto/OLVASS-EL.txt", b"\xef\xbb\xbf" + GUIDE.replace("\n", "\r\n").encode("utf-8"))
    archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".zip.sha256").write_text(f"{archive_digest}  {archive.name}\n", encoding="utf-8")
    return archive


if __name__ == "__main__":
    result = create_archive()
    print(f"Created {result} ({result.stat().st_size} bytes)")
