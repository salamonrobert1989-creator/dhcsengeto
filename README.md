# Dunahíd csengető

Önálló, magyar nyelvű HTML-program a H6-os HÉV Szigetszentmiklósról Dunaharaszti külső felé induló vonataihoz.

## Használat

1. Nyisd meg a `dunahid-csengeto.html` fájlt naprakész Chrome, Edge, Firefox vagy Safari böngészőben, internetkapcsolattal.
2. A hang automatikusan aktiválódik, külön hangengedélyező gomb nincs. Ha a böngésző első felhasználói műveletet követel, az oldalon bárhová kattintás, érintés vagy billentyűleütés bekapcsolja a hangot. A felső sáv mutatja, amikor a csengetés készen áll. A **Próbacsengés** a hangot és a leállítást is kipróbálja.
3. Tartsd nyitva és lehetőleg előtérben a lapot. A jelzés az élő adat szerinti, ennek hiányában a menetrendi indulás után 30 másodperccel indul, 20 másodperc után automatikusan véget ér. A felső **Csengetés kikapcsolása** gomb az aktuális jelzést azonnal leállítja; a következő vonatok jelzése aktív marad. A vonatsorok az indulási időt és a hátralévő időt mutatják. Az indulás melletti jelzési időpont, az időzítési feliratok és az utolsó frissítés mezője nem jelennek meg a felületen.

Telepítés, fordítás, külső CSS vagy JavaScript-könyvtár nem szükséges. Statikus tárhelyről is használható. Helyi kiszolgáláshoz a tároló gyökerében: `python3 -m http.server 8080`.

A teljesen kattintás nélküli hanglejátszás a böngésző adott webhelyre érvényes automatikus lejátszási engedélyétől függ. Ezt az oldal nem tudja felülírni; tiltás esetén az első szokásos művelet aktiválja a hangot. A böngésző által később felfüggesztett hangrendszert az oldal visszatéréskor automatikusan, szükség esetén a következő felhasználói műveletre indítja újra.

## Adatok és jelzés

- A csatolt mintában használt BKK FUTÁR-végpontot és böngészős API-kulcsot használja; az API elérhetősége, kulcsának érvényessége és a böngészőből engedélyezett hozzáférés szükséges. Felhőkörnyezetben a `futar.bkk.hu` tartománynak engedélyezettnek kell lennie.
- A megállókat futáskor név alapján keresi meg, és csak a H6-os járatokat dolgozza fel. A Dunaharaszti külső felé vezető irányt a vonat megállósorrendje igazolja: Szigetszentmiklósnak Dunaharaszti külső előtt kell szerepelnie. A két irány közös útvonalneve nem irányszűrő.
- Az elkövetkező 30 perc összes megfelelő indulását mutatja, nem csak az első ötöt. A vonatszámot a szolgáltató erre alkalmas mezőiből olvassa, és csak az első négy számjegyét jeleníti meg; ismeretlen számot nem talál ki. A teljes járatazonosítót használja az ismétlésvédelemhez, így azonos négyjegyű kijelzésű vonatok is külön maradnak.
- A vonatszámra vagy a sorára kattintva a járat teljes menetrendje nyílik meg, az első megállótól a végállomásig, a Szigetszentmiklós előtti és már elhagyott megállókkal együtt. A `trip-details` kérés `includeStopTimes=all` beállítással fut, megálló- és időablakszűrés nélkül. Szigetszentmiklóst kiemeli; a lista az első megállónál kezdődik.
- A menetrend külön érkezési és indulási oszlopot mutat. Mindkét időnél az adott élő előrejelzés élvez elsőbbséget; ahol ilyen nincs, a menetrendi idő látszik. Az „Élő adat” és „Menetrend” felirat jelzi az idő forrását.
- Megnyitáskor friss adatot kér. Kapcsolati hiba esetén a korábban letöltött teljes menetrendet mutatja, menetrendi időkkel. Ezt már az irányellenőrzéskor eltárolja, így az első kattintás előtti kapcsolatszakadást is kezeli. A tárolás az aktuális oldal memóriájában történik; újratöltés után ismét le kell tölteni a menetrendet.
- Elsősorban a `predictedDepartureTime` alapján csenget. Ha nincs friss indulási előrejelzés, a `departureTime` vagy `scheduledDepartureTime` szerinti indulás alapján jelez. A kijelzett indulás, a következő jelzés és a tényleges csengetés ugyanazt az adatforrást követi. Az érkezési időt nem használja indulásként.
- 10 másodpercenként frissít; a frissítések nem fedik egymást. Új előrejelzés átütemezi a jelzést. Törölt járat nem csenget; egy már elindult vonat rövid ideig megmarad a jelzéshez akkor is, ha kikerül az indulási válaszból.
- A friss élő adat mindig elsőbbséget élvez. 45 másodpercnél régebbi előrejelzés esetén a letöltött menetrendi időre tér vissza; ezt „Menetrend szerint” jelzéssel mutatja. Adatkapcsolati hiba alatt is tovább figyeli a memóriában lévő menetrendet. Első megnyitáskor szükséges a menetrend letöltése; a még le nem töltött indulásokat teljes adatkapcsolati hiba mellett nem tudja megismerni.
- Öt másodpercnél nagyobb késéssel és a hang aktiválása előtti időpontra nem pótol jelzést. Élő és menetrendi adat közötti váltáskor sem csenget kétszer ugyanarra a vonatra. A böngészőlap újratöltésén át is megőrzi a már kezelt járatokat, ha a munkamenet-tárhely elérhető.
- A valós idejű menetrend előrejelzés, nem a jármű tényleges indulását igazoló érzékelő. Eszközalvás, háttérlap-felfüggesztés, némítás vagy adatkapcsolati hiba akadályozhatja a pontos hangjelzést. A képernyő ébren tartását támogató böngészőkben ezt engedélyezett hang mellett kéri az oldal.

## Memóriahasználat

Nincs külső felületi keretrendszer, betöltött hangfájl vagy végtelenül növekvő napló. Legfeljebb 80 naplóbejegyzés, 64 vonatrekord, 64 irányellenőrzési eredmény és 128 ismétlésvédelmi bejegyzés marad meg; a lejárt elemek törlődnek. A teljes menetrendekből legfeljebb 16 járatot és összesen 2048 tömör megállórekordot tárol, legfeljebb négy óráig, járat és szolgáltatási nap szerint elkülönítve. A nagy API-válaszok teljes referenciaállományát nem őrzi meg. A menetrendablak bezárása megszakítja a hozzá tartozó kérést és felszabadítja a megjelenített sorokat. Egy újrahasznált AudioContext és csengetésenként egy oszcillátor működik, amelyek csomópontjai leállításkor lecsatlakoznak. A 20 másodperces végét a hangrendszer órája is kikényszeríti. Az oldal elhagyása leállítja az időzítőket, a hangot és a folyamatban lévő kéréseket.

## Ellenőrzés

A függőségmentes időzítési és adatfeldolgozási tesztek Node.js 18+ alatt futtathatók:

```sh
node --test tests/dunahid.test.cjs
```

Ezek ellenőrzött tesztadatokat használnak; nem igazolják a külső BKK-szolgáltatás aktuális elérhetőségét. A böngészős ellenőrzéshez nyisd meg az oldalt, figyeld az adatkapcsolat állapotát, és próbáld ki a hangjelzést és a kézi leállítást.
