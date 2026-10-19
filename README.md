# Dunahíd csengető

Önálló, magyar nyelvű HTML-program a H6-os HÉV indulásainak követésére Szigetszentmiklósnál és Dunaharaszti külsőnél. A csengetés továbbra is csak a Szigetszentmiklósról Dunaharaszti külső felé induló vonatokhoz tartozik.

## Használat

1. Nyisd meg a `dunahid-csengeto.html` fájlt naprakész Chrome, Edge, Firefox vagy Safari böngészőben, internetkapcsolattal.
2. A hang automatikusan aktiválódik, külön hangengedélyező gomb nincs. Ha a böngésző első felhasználói műveletet követel, az oldalon bárhová kattintás, érintés vagy billentyűleütés bekapcsolja a hangot. A felső sáv mutatja, amikor a csengetés készen áll. A **Próbacsengés** a hangot és a leállítást is kipróbálja.
3. Tartsd nyitva és lehetőleg előtérben a lapot. A jelzés az élő adat szerinti, ennek hiányában a menetrendi indulás után 30 másodperccel indul, 20 másodperc után automatikusan véget ér. A felső **Csengetés kikapcsolása** gomb az aktuális jelzést azonnal leállítja; a következő vonatok jelzése aktív marad. A vonatsorok az indulási időt mutatják, élő adatoknál a menetrendtől való eltérés jelvényével. Az indulásig hátralévő idő, az indulás melletti jelzési időpont, az időzítési feliratok és az utolsó frissítés mezője nem jelennek meg a felületen.

Telepítés, fordítás, külső CSS vagy JavaScript-könyvtár nem szükséges. Statikus tárhelyről is használható. Helyi kiszolgáláshoz a tároló gyökerében: `python3 -m http.server 8080`.

A teljesen kattintás nélküli hanglejátszás a böngésző adott webhelyre érvényes automatikus lejátszási engedélyétől függ. Ezt az oldal nem tudja felülírni; tiltás esetén az első szokásos művelet aktiválja a hangot. A böngésző által később felfüggesztett hangrendszert az oldal visszatéréskor automatikusan, szükség esetén a következő felhasználói műveletre indítja újra.

## Adatok és jelzés

- A csatolt mintában használt BKK FUTÁR-végpontot és böngészős API-kulcsot használja; az API elérhetősége, kulcsának érvényessége és a böngészőből engedélyezett hozzáférés szükséges. Felhőkörnyezetben a `futar.bkk.hu` tartománynak engedélyezettnek kell lennie.
- A két megállót futáskor név alapján keresi meg, és csak a H6-os járatokat dolgozza fel. A Dunaharaszti külső felé vezető irányt a vonat megállósorrendje igazolja: Szigetszentmiklósnak Dunaharaszti külső előtt kell szerepelnie. A két irány közös útvonalneve nem irányszűrő.
- A listában megjelennek a Dunaharaszti külsőről Tököl és Ráckeve felé induló járatok is, a déli irányban Szigetszentmiklósig rövidített járatokkal együtt. A megállósorrendben Dunaharaszti külsőt Szigetszentmiklósnak, Tökölnek vagy Ráckevének kell követnie. Ezek a vonatok csak a kijelzésben szerepelnek. A következő jelzés és a csengetés változatlanul kizárólag az eredeti megálló és irány vonataihoz tartozik.
- A két megálló következő 30 perces indulásai közös időrendben látszanak. Minden sornál szerepel, melyik megállóból indul a vonat. A két adatlekérés egymástól függetlenül frissül, így Dunaharaszti külső lekérésének késése vagy hibája nem állítja meg az eredeti figyelést.
- Élő adatok esetén a késést is kiírja a menetrendi és az előrejelzett indulás különbségéből. A feltöltött `menetrend.html` mintája szerint az aktív sor 3 perc késéstől piros, korábbi közlekedésnél kék, egyébként zöld. A késésjelvény 1–2 percnél narancssárga, legalább 3 percnél piros, sietésnél kék. A késést teljes eltelt percekben (`+2 perc`), a korábbi közlekedést felfelé kerekítve (`-1 perc`) írja ki, ugyanúgy, mint a mintában. Menetrendi adatnál nem talál ki késést; élő idő, de hiányzó menetrendi idő esetén „késés nem ismert” felirat látszik.
- Az elkövetkező 30 perc összes megfelelő indulását mutatja, nem csak az első ötöt. A vonatszámot a szolgáltató erre alkalmas mezőiből olvassa, és csak az első négy számjegyét jeleníti meg; ismeretlen számot nem talál ki. A teljes járatazonosítót használja az ismétlésvédelemhez, így azonos négyjegyű kijelzésű vonatok is külön maradnak.
- A vonatszámra vagy a sorára kattintva az adott járat menetrendje nyílik meg a saját indulóállomásától (például Tököl vagy Ráckeve) a végállomásig, a Szigetszentmiklós előtti és már elhagyott megállókkal együtt. A `trip-details` kérés `includeStopTimes=all` beállítással fut, megálló- és időablakszűrés nélkül. A megállósorszámokat számként és szövegként is kezeli. Szigetszentmiklóst kiemeli; a lista az indulóállomásnál kezdődik. A fejlécben csak a vonatszám és az útvonal szerepel, „teljes menetrend” felirat és megállószám nélkül.
- A menetrend külön érkezési és indulási oszlopot mutat. Mindkét időnél az adott élő előrejelzés élvez elsőbbséget; ahol ilyen nincs, a menetrendi idő látszik. Az „Élő adat” és „Menetrend” felirat jelzi az idő forrását.
- Megnyitáskor friss adatot kér. Kapcsolati hiba esetén a korábban letöltött teljes menetrendet mutatja, menetrendi időkkel. Ezt már az irányellenőrzéskor eltárolja, így az első kattintás előtti kapcsolatszakadást is kezeli. A tárolás az aktuális oldal memóriájában történik; újratöltés után ismét le kell tölteni a menetrendet.
- Elsősorban a `predictedDepartureTime` alapján csenget. Ha nincs friss indulási előrejelzés, a `departureTime` vagy `scheduledDepartureTime` szerinti indulás alapján jelez. A kijelzett indulás, a következő jelzés és a tényleges csengetés ugyanazt az adatforrást követi. Az érkezési időt nem használja indulásként.
- 10 másodpercenként frissít; a frissítések nem fedik egymást. Új előrejelzés átütemezi a jelzést. Törölt járat nem csenget; egy már elindult vonat rövid ideig megmarad a jelzéshez akkor is, ha kikerül az indulási válaszból.
- A friss élő adat mindig elsőbbséget élvez. 45 másodpercnél régebbi előrejelzés esetén a letöltött menetrendi időre tér vissza; ezt „Menetrend szerint” jelzéssel mutatja. Kivétel a már elindult, az indulásához képest legfeljebb 45 másodperccel korábban vagy később megfigyelt vonat: ennek utolsó élő indulási idejét a jelzésig és az újrapróbálási idő végéig megtartja, ha közben eltűnik az indulási listából. Adatkapcsolati hiba alatt is tovább figyeli a memóriában lévő menetrendet. Első megnyitáskor szükséges a menetrend letöltése; a még le nem töltött indulásokat teljes adatkapcsolati hiba mellett nem tudja megismerni.
- Egy jelzést csak a hang sikeres elindítása után jelöl lejátszottnak. Átmeneti hangindítási hiba vagy már aktivált hang felfüggesztése esetén az esedékességtől számított legfeljebb 60 másodpercig újrapróbálható. Az időzítő csúszását és az ennél régebbi kimaradásokat naplózza. Az első hangaktiválás előtti jelzéseket nem pótolja. Egy elmúlt menetrendi idő nem tiltja le ugyanannak a vonatnak a később érkező, még esedékes élő előrejelzését.
- Élő és menetrendi adat közötti váltáskor sem csenget kétszer ugyanarra a már jelzett vonatra. A böngészőlap újratöltésén át is megőrzi a sikeresen elindított jelzéseket, ha a munkamenet-tárhely elérhető. A próbacsengést az esedékes vonatjelzés megszakítja, és elindítja a vonat saját 20 másodperces jelzését.
- A valós idejű menetrend előrejelzés, nem a jármű tényleges indulását igazoló érzékelő. Eszközalvás, háttérlap-felfüggesztés, némítás vagy adatkapcsolati hiba akadályozhatja a pontos hangjelzést. A képernyő ébren tartását támogató böngészőkben ezt engedélyezett hang mellett kéri az oldal.

## Memóriahasználat

Nincs külső felületi keretrendszer, betöltött hangfájl vagy végtelenül növekvő napló. Legfeljebb 80 naplóbejegyzés, megállónként 64 vonatrekord, összesen 64 irányellenőrzési eredmény és 128 ismétlésvédelmi bejegyzés marad meg; a lejárt elemek törlődnek. A teljes menetrendekből legfeljebb 16 járatot és összesen 2048 tömör megállórekordot tárol, legfeljebb négy óráig, járat és szolgáltatási nap szerint elkülönítve. A nagy API-válaszok teljes referenciaállományát nem őrzi meg. A menetrendablak bezárása megszakítja a hozzá tartozó kérést és felszabadítja a megjelenített sorokat. Egy újrahasznált AudioContext és csengetésenként egy oszcillátor működik, amelyek csomópontjai leállításkor lecsatlakoznak. A 20 másodperces végét a hangrendszer órája is kikényszeríti. Az oldal elhagyása leállítja mindkét megálló időzítőit és kéréseit, valamint a hangot.

## Ellenőrzés

A függőségmentes időzítési és adatfeldolgozási tesztek Node.js 18+ alatt futtathatók:

```sh
node --test tests/dunahid.test.cjs
```

A böngészős automatizált tesztekhez Playwright és Chromium szükséges. A HTML-programnak továbbra sincs külső függősége. Linuxon a tesztfüggőség a tárolón kívül is telepíthető:

```sh
npm install --prefix /tmp/dunahid-tests --no-audit --no-fund --package-lock=false playwright@1.62.1
/tmp/dunahid-tests/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/dunahid-tests/node_modules node --test tests/dunahid.test.cjs tests/dunahid.browser.cjs
```

A böngészős teszt a rendszer `/usr/bin/chromium` böngészőjét használja, ha létezik, egyébként a Playwright Chromiumát. Egyedi hely megadható a `CHROMIUM_EXECUTABLE_PATH` változóval. A tesztek valódi Web Audio hangrendszer mellett ellenőrzik az időzítést, a hang felfüggesztését, a sikertelen hangindítás utáni újrapróbálást, az adatkimaradást, a próbacsengéssel való ütközést, a kézi és automatikus leállást, az irányszűrést és az ismétlésvédelmet. Az időzítő késését szimulálják; ez nem azonos az eszköz tényleges elaltatásával.

Ezek ellenőrzött menetrendi tesztadatokat használnak; nem igazolják a külső BKK-szolgáltatás aktuális elérhetőségét vagy az eszköz hangszórójának hangerejét. A saját eszközön nyisd meg az oldalt, figyeld az adatkapcsolat állapotát, és próbáld ki a hangjelzést és a kézi leállítást.
