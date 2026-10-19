# Windows-változat

A `downloads/Dunahid-csengeto.exe` egy Windows 11 x64 Win32-alkalmazás. A meglévő HTML-t változatlan felülettel ágyazza magába. A natív keret C++17-ben készült; a Microsoft Edge WebView2 megosztott futtatókörnyezetét használja. Az EXE nem igényel rendszergazdai indítást, külön fordítói futtatókörnyezetet vagy mellé csomagolt HTML-t.

## Fordítás Linuxon

Python 3.10+, internetkapcsolat és Zig 0.14.1 szükséges. A Zig telepíthető a tároló figyelmen kívül hagyott könyvtárába:

```sh
python3 -m pip install --target .cache/windows/tools ziglang==0.14.1
python3 windows/build.py --zig .cache/windows/tools/ziglang/zig
python3 windows/test_package.py -v
```

Windows PowerShellben ugyanez `py` paranccsal futtatható, a fordító neve `zig.exe`:

```powershell
py -m pip install --target .cache/windows/tools ziglang==0.14.1
py windows/build.py --zig .cache/windows/tools/ziglang/zig.exe
py windows/test_package.py -v
```

A build az első futáskor a Microsoft hivatalos NuGet-tárából letölti a rögzített `Microsoft.Web.WebView2` SDK-t. Használat előtt ellenőrzi a forrásban rögzített SHA-256 lenyomatot. A betöltő DLL-t, a HTML-t és a licencszövegeket Windows-erőforrásként ágyazza be. Az `EventToken.h` egyetlen, a Windows ABI-val azonos 64 bites eseményazonosítót ad a MinGW-fejlécekhez. Nincs szükség a Microsoft teljes SDK-jának vagy egy teljes böngészőnek a csomagolására.

A kimenet az EXE, annak SHA-256 lenyomata, egy JSON fordítási jegyzék, valamint a Microsoft licenc- és megjegyzésfájljai. Ezekből a build automatikusan elkészíti a `downloads/Dunahid-csengeto-Windows11.zip` csomagot, rövid használati útmutatóval és külön ZIP-ellenőrzőösszeggel. A jegyzék tartalmazza a felhasznált fordító és SDK verzióját, az SDK ellenőrzőösszegét, a beágyazott HTML és a natív forrás lenyomatát. Felület- vagy natív módosítás után az EXE-t újra kell fordítani. A csomagteszt hibázik, ha a beágyazott felület vagy a jegyzék nem a jelenlegi forráshoz tartozik.

A már elkészült EXE újrafordítás nélkül is ZIP-be csomagolható: `python3 windows/package.py` (Windows alatt: `py windows/package.py`).

## Futtatás és időzítés

- A felület helyi HTTPS virtuális tárhelyről (`dunahid.invalid`) töltődik; ehhez nem indít kiszolgálót és nem nyit hálózati portot. Az adatok ugyanabból a BKK-adatforrásból érkeznek, mint a HTML-változatban.
- A natív keret betöltés előtt jelzi az asztali módot. Ekkor a HTML nem indít saját jelzés- és lekérdezésidőzítőket. A Windows 250 ms-os időzítője indítja ugyanazt a figyelési kódot, és ez hajtja a két megálló különálló, 10 másodperces frissítését is.
- Legfeljebb egy natív szkriptvégrehajtás várakozhat; a lassú megjelenítő nem halmozhat fel végrehajtási kéréseket. Az ablak minimalizálása nem rejti el a WebView2 vezérlőjét és nem méretezi nullára a felületet.
- A WebView2 automatikus hanglejátszása engedélyezett; a háttérbeli időzítő- és megjelenítőkorlátozások ki vannak kapcsolva. Átmeneti hangfelfüggesztés után a natív ütem újraindítja a hangrendszert. A hangot továbbra is a meglévő Web Audio kód állítja elő, ugyanazzal a 20 másodperces hangórai határidővel.
- A `SetThreadExecutionState` a program futása közben megakadályozza az automatikus rendszeralvást és képernyőkikapcsolást. Bezáráskor ezt feloldja. A kézi altatást, hibernálást vagy kikapcsolást nem akadályozza meg.
- Az alkalmazás helyi példányzára megakadályozza a két egyidejű példányból eredő kettős csengetést. A helyi fájlok felhasználói könyvtárban vannak; a betöltő abszolút útvonalról töltődik. Távoli oldalakra navigálás, felugró ablakok, natív hostobjektumok és webes üzenetkezelés nincsenek engedélyezve.

## Ellenőrzés

```sh
node --test tests/dunahid.test.cjs tests/dunahid.browser.cjs
python3 windows/test_package.py -v
```

A böngészős tesztek Playwright-telepítését a fő README ismerteti. Az asztali próbák natív időzítőüzeneteket szimulálnak valódi Chromium és Web Audio mellett. Az EXE vizsgálata ellenőrzi a Windows x64 GUI-formátumot, a beágyazott HTML bájtpontos azonosságát, a betöltőt, a licenceket, a DPI-beállítást, az emelt jogosultság nélküli indítást és a fordítási jegyzéket.

Ezek nem helyettesítik a Windows 11 alatti indítási próbát. A felhőkörnyezet Linuxot futtat, ezért az EXE natív indítása, a Windows ébren tartása, valamint a teljesen takart és minimalizált WebView2 ablak tényleges viselkedése itt nem volt ellenőrizhető. Windows alatt ellenőrizendő: indulás és automatikus hang, próbacsengés és kézi leállítás, élő adatkapcsolat, megállólisták és járatmenetrend, ablak eltakarása/minimalizálása, valamint bezárás utáni hang- és ébrentartás-megszűnés.

## Microsoft-összetevők

A Microsoft WebView2 betöltő a Microsoft licencfeltételei szerint kerül terjesztésre. A licenc és a harmadik felekre vonatkozó megjegyzések az EXE-be is be vannak ágyazva, valamint a `downloads/WebView2-LICENSE.txt` és `downloads/WebView2-NOTICE.txt` fájlokban is elérhetők. A WebView2 teljes futtatókörnyezetét a Microsoft terjeszti és frissíti.
