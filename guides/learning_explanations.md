# Lern-Erklaerungen

Stand: 2026-02-03

## Aenderungen in einfacher Sprache

1) Journey-KPIs im UI
- Wir zeigen jetzt die Funnel-, Drop-off- und Zeit-KPIs direkt in den Dashboards.
- Das macht die Reise vom ersten Kontakt bis zum Abschluss sichtbar.

2) Kalender-UI (Starter/Teamleiter)
- Es gibt eine Kalenderansicht mit Rueckrufen und Terminen.
- So sieht man schnell, was als Naechstes ansteht.

3) Schnellaktionen im Kundenmenue
- Im Kunden-Detail gibt es Buttons fuer Anruf, Termin und Abschluss.
- Die Buttons sind nur aktiv, wenn der Status das erlaubt.

4) Klartext in der Aktivitaets-Erfassung
- Im Modal erklaeren kurze Hinweise, was die Auswahl bedeutet.
- Beispiel: Bei „Nicht erreicht“ wird ein Rueckruf verlangt.

5) Termin-Prefill im Modal
- Wenn ein Lead bereits einen Termin hat, wird Datum/Ort automatisch vorbefuellt.
- So entstehen keine doppelten oder falschen Termine.

6) Fix fuer „Input should be None“
- Ursache war ein Namenskonflikt beim Feld „datetime“.
- Wir nutzen jetzt ein internes Feld „eventDatetime“ und akzeptieren weiter „datetime“ als Eingabe.

7) Termin-Konsistenz im Backend
- Wenn ein Status auf „Termin vereinbart“ gesetzt wird, erzeugen wir automatisch einen AppointmentEvent.
- Dadurch erscheint der Termin sicher in der Kundenansicht.

8) KPI-Visibility pro Rolle
- Leere Sichtbarkeit bleibt jetzt wirklich leer (nicht mehr automatisch „alle“).
- So greifen Rollenrechte bei KPIs korrekt.

9) Regressionstests fuer Gates und Hauptpfad
- Es gibt Tests fuer die wichtigsten Status-Regeln.
- Der Hauptpfad (Call -> Termin -> Abschluss) ist abgedeckt.
