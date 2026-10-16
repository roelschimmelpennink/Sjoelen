# Sjoelstudio

Een Nederlandstalige 3D-sjoelgame, gemaakt met Three.js en een zelfstandige physics-simulatie. Alle bibliotheken, lettertypen en texturen zijn lokaal beschikbaar. Er is geen installatie van afhankelijkheden of bouwstap nodig.

## Spelen

Start vanuit deze map met `node server.mjs` en open http://127.0.0.1:4173.

- Plaats de schijf, kies een richting en stel de kracht in met de schuifregelaars. Een balkje op de richtingslijn toont die kracht ook op de bak zelf en vult zich tijdens het opladen. Het volgt de richting, ook bij een kaats via de zijwand.
- Open **Speel met een schans** om een houten schans aan of uit te zetten. Kies de positie met de schuifjes of **Kies plek op de bak** en klik op een vrije plek. Esc annuleert het plaatsen. Je kunt de schans tussen worpen verplaatsen; de instelling blijft bewaard.
- Klik kort op **Schuiven maar** of tik op spatie voor de ingestelde kracht. Houd de knop of spatie vast om van 5% tot 100% op te laden; laat los om te schuiven. De meter toont de gebruikte kracht. Escape annuleert het opladen. Aanraakbediening werkt hetzelfde.
- Sleep over de bak om rondom te draaien en gebruik het scrollwiel om te zoomen.
- Kies Perspectief, Spelersblik of Van boven. De camera kan ook tijdens een worp of replay draaien.
- Bekijk de laatste worp terug met een camera die de gelanceerde schijf volgt en dynamisch inzoomt. Bij een botsing volgt de camera de geraakte schijf en daarna eventuele volgende schijven in de kettingreactie. Dit werkt ook bij terugspoelen. Pauzeer, zoek in de tijdlijn en kies 0,25×, 0,5× of normale snelheid. Zet **Filmisch** uit of kies een camerastandpunt om zelf te kijken. Na de replay keert je oorspronkelijke camera terug. Bij een voorkeur voor minder beweging start replay met de vrije camera.
- Het spel heeft 30 schijven en drie beurten. Aan het einde van een beurt worden gescoorde schijven gestapeld en krijg je de overige schijven terug.
- De poorten tellen 2, 3, 4 en 1 punt. Een complete set van vier telt 20 punten.
- Voortgang, geluidvoorkeur en persoonlijk record blijven in de browser bewaard.

Open de volledige spelhulp met het vraagteken rechtsboven, H, F1 of ?. Toetsen: ← / → plaatsen; A / D richten; ↑ / ↓ kracht; spatie vasthouden en loslaten om te schuiven; 1 / 2 / 3 camera; R replay; Escape opladen annuleren, replay of spelhulp sluiten.

## Physics en weergave

De bak is ongeveer twee meter lang en 39 cm breed. Schijven hebben een diameter van 51,6 mm. De simulatie werkt met vaste stappen van 1/240 seconde, glijwrijving en energieverliezende botsingen. De schans is 14 cm breed, 18 cm lang en 5 cm hoog. Op de helling werken zwaartekracht en wrijving langs het oppervlak. Aan de rand wordt de snelheid meegenomen in een vrije vlucht met 9,81 m/s² zwaartekracht. De snelheid wordt dus niet vervangen door een vaste spronganimatie. Landingen, overspringen van schijven, botsingen op verschillende hoogtes en uit de bak springen worden meegenomen. Schijven buiten de bak tellen niet en komen de volgende beurt terug.

De bak, schans, schijven, afgeronde poortjes, messing schroeven en houtnerf zijn geometrie en procedurele materialen. Licht en schaduwen geven diepte en maken de afstand tot de bak zichtbaar tijdens een sprong. Replay legt hoogte, verticale snelheid, kanteling en de gebruikte schans vast. De camera volgt de sprong en de geraakte schijven, ook bij terugspoelen. Dit blijft een digitale benadering met schijven als vlakke cilinders; volledige tuimeling en kantelen op een rand worden niet gesimuleerd. Extra wedstrijdbonusschijven bij vroeg uitspelen zijn niet opgenomen.

## Controle

Voer `node --test tests/*.test.mjs` uit. De tests controleren onder andere puntentelling, botsingen, volle bakken, kettingreacties in replay, oplaadkracht, de parabolische vlucht, terugglijden, landingen, hoogte-afhankelijke contacten, schansplaatsing en replay van sprongen.

## Bestanden

`dist/` is de complete publiceerbare game. `dist/physics.js` bevat de simulatie, `dist/scene.js` de 3D-weergave en `dist/app.js` de spel- en replaybediening. Three.js valt onder de MIT-licentie; DM Sans en Libre Caslon Display onder de SIL Open Font License. De licenties staan in `dist/vendor/`.
