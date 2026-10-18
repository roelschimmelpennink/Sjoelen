# Sjoelstudio

Een Nederlandstalige 3D-sjoelgame, gemaakt met Three.js en een zelfstandige physics-simulatie. Alle bibliotheken, lettertypen en texturen zijn lokaal beschikbaar. Er is geen installatie van afhankelijkheden of bouwstap nodig.

## Spelen

Start vanuit deze map met `node server.mjs` (Node.js 22.14 of hoger) en open http://127.0.0.1:4173. De lokale server bewaart online kamers in de genegeerde map `.local/`.

## Online met twee spelers

Klik boven de bak op **Online met z’n tweeën**, vul je naam in en maak een kamer. Deel de uitnodigingslink via **WhatsApp**, **E-mail** of **Kopieer link**. De ontvanger vult eerst een naam in en komt daarna direct bij de bak, zonder account. Een eerder gebruikte naam kan worden aangepast voordat de gast op **Doe mee** klikt. Zodra de gast binnen is, sluit het uitnodigingsscherm van de gastheer automatisch en verschijnt een melding dat die kan beginnen. De uitnodigingsknoppen zijn alleen voor de gastheer zichtbaar zolang de tweede plek vrij is. WhatsApp en e-mail openen een bericht dat de speler zelf verstuurt.

Jullie schuiven om de beurt, ieder op een eigen bak met 30 schijven en drie beurten. Beiden zien de actieve bak, schijfplaatsing, richtingslijn en krachtmeter tijdens het instellen en opladen. De tegenstander ziet dezelfde waarden in de vergrendelde bediening. Na de beurtwisseling krijgt iedere speler zijn eigen instellingen terug. Camera en filmische replay blijven vrij te bedienen. De hoogste eindscore wint. Revanche begint nadat beide spelers akkoord zijn. De schansinstelling bij het maken van de kamer geldt voor allebei en blijft tijdens de wedstrijd vaststaan.

Kamers zijn 24 uur geldig. Bij een verbroken verbinding probeert het spel opnieuw verbinding te maken. Verversen in hetzelfde tabblad herstelt je spelersplek via een tabgebonden sessiesleutel. Sluit het tabblad dus niet zolang je wilt terugkeren. Alleen twee spelers kunnen de kamer bezetten; een uitnodigingslink geeft geen toegang tot de spelersbediening van een bestaande deelnemer. Terug naar alleen spelen herstelt je lokale solo-spel.

De server berekent de physics en puntentelling, bewaakt beurtvolgorde en revisies en verwerkt een opnieuw verstuurde actie eenmaal. Beide browsers spelen dezelfde worp lokaal af op basis van de gedeelde beginsituatie en invoer. Instellingen worden maximaal ongeveer zeven keer per seconde verstuurd; de kijker haalt ze ongeveer elke 180 ms op (langzamer in achtergrondtabbladen). Deze voorbereidingen staan los van de wedstrijdrevisie en mogen uitsluitend door de actieve speler worden aangepast. Verouderde voorbereidingen vervallen bij een beurtwisseling en veranderen geen physics of scores. Dit is beurtgebaseerd online spel; er is geen WebRTC- of externe realtime-dienst nodig.

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

`public/` bevat de browsergame. `public/physics.js` bevat de simulatie, `public/scene.js` de 3D-weergave, `public/app.js` de spel- en replaybediening en `public/multiplayer.js` kamers, uitnodigingen en verbinding. `worker/game.js` bewaakt de online spelregels; `worker/api.js` biedt de kamer-API. Three.js valt onder de MIT-licentie; DM Sans en Libre Caslon Display onder de SIL Open Font License. De licenties staan in `public/vendor/`.

## Publiceren en database

`node scripts/build.mjs` maakt een zelfstandige Cloudflare Worker in `dist/server/index.js`, inclusief alle browserbestanden. `dist/` is gegenereerd en wordt niet bijgehouden. De bestaande Sites-identiteit staat in `.openai/hosting.json`; binding `DB` is een D1-database. De Sites-publicatiestap past de SQL-migraties onder `drizzle/` toe. Er zijn geen runtimegeheimen of externe diensten nodig.

Voor schemawijzigingen: installeer de vastgelegde ontwikkelhulpmiddelen met `npm ci`, wijzig `db/schema.ts` en voer `npm run db:generate` uit. Commit de nieuwe migratie en metadata. Wijzig eerder toegepaste migraties niet. De lokale server past ontbrekende migraties bij het starten toe en bewaart bestaande kamers. De lokale database is gescheiden van de gehoste database.
