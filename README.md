# Dunahíd csengető

Önálló, magyar nyelvű HTML-program a H6-os HÉV Szigetszentmiklósról Dunaharaszti külső felé induló vonataihoz.

## Használat

1. Nyisd meg a `dunahid-csengeto.html` fájlt naprakész Chrome, Edge, Firefox vagy Safari böngészőben, internetkapcsolattal.
2. Kattints a **Hangjelzés engedélyezése** gombra. A **Próbacsengés** a hangot és a leállítást is kipróbálja.
3. Tartsd nyitva és lehetőleg előtérben a lapot. A jelzés az indulási előrejelzés után 30 másodperccel indul, 20 másodperc után automatikusan véget ér. A felső **Csengetés kikapcsolása** gomb az aktuális jelzést azonnal leállítja; a következő vonatok jelzése aktív marad.

Telepítés, fordítás, külső CSS vagy JavaScript-könyvtár nem szükséges. Statikus tárhelyről is használható. Helyi kiszolgáláshoz a tároló gyökerében: `python3 -m http.server 8080`.

## Adatok és jelzés

- A csatolt mintában használt BKK FUTÁR-végpontot és böngészős API-kulcsot használja; az API elérhetősége, kulcsának érvényessége és a böngészőből engedélyezett hozzáférés szükséges. Felhőkörnyezetben a `futar.bkk.hu` tartománynak engedélyezettnek kell lennie.
- A megállókat futáskor név alapján keresi meg, és csak a H6-os járatokat dolgozza fel. A Dunaharaszti külső felé vezető irányt a vonat megállósorrendje igazolja: Szigetszentmiklósnak Dunaharaszti külső előtt kell szerepelnie. A két irány közös útvonalneve nem irányszűrő.
- Az elkövetkező 30 perc összes megfelelő indulását mutatja, nem csak az első ötöt. A vonatszámot a szolgáltató erre alkalmas mezőiből olvassa; ismeretlen számot nem talál ki. Egy sorra kattintva megnyitható a megállólista.
- A `predictedDepartureTime` alapján csenget. Az érkezési időt nem használja indulásként. Ha nincs indulási előrejelzés, a menetrendi indulás megjelenik, de nem vált ki hangot.
- 10 másodpercenként frissít; a frissítések nem fedik egymást. Új előrejelzés átütemezi a jelzést. Törölt járat nem csenget; egy már elindult vonat rövid ideig megmarad a jelzéshez akkor is, ha kikerül az indulási válaszból.
- 45 másodpercnél régebbi előrejelzésből nem csenget. Öt másodpercnél nagyobb késéssel és a hangengedélyezés előtti időpontra nem pótol jelzést. A böngészőlap újratöltésén át is megőrzi a már kezelt járatokat, ha a munkamenet-tárhely elérhető.
- A valós idejű menetrend előrejelzés, nem a jármű tényleges indulását igazoló érzékelő. Eszközalvás, háttérlap-felfüggesztés, némítás vagy adatkapcsolati hiba akadályozhatja a pontos hangjelzést. A képernyő ébren tartását támogató böngészőkben ezt engedélyezett hang mellett kéri az oldal.

## Memóriahasználat

Nincs külső felületi keretrendszer, betöltött hangfájl vagy végtelenül növekvő napló. Legfeljebb 80 naplóbejegyzés, 64 vonatrekord, 64 irányellenőrzési eredmény és 128 ismétlésvédelmi bejegyzés marad meg; a lejárt elemek törlődnek. Egy újrahasznált AudioContext és csengetésenként egy oszcillátor működik, amelyek csomópontjai leállításkor lecsatlakoznak. A 20 másodperces végét a hangrendszer órája is kikényszeríti. Az oldal elhagyása leállítja az időzítőket, a hangot és a folyamatban lévő kéréseket.

## Ellenőrzés

A függőségmentes időzítési és adatfeldolgozási tesztek Node.js 18+ alatt futtathatók:

```sh
node --test tests/dunahid.test.cjs
```

Ezek ellenőrzött tesztadatokat használnak; nem igazolják a külső BKK-szolgáltatás aktuális elérhetőségét. A böngészős ellenőrzéshez nyisd meg az oldalt, figyeld az adatkapcsolat állapotát, és próbáld ki a hangjelzést és a kézi leállítást.
