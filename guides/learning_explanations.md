# Lern-README (einfach erklaert)

Stand: 2026-02-04

Ziel: Dieses Dokument erklaert in klarer Sprache, was in der App steckt und wie die Teile zusammenarbeiten.
Es ist fuer Nicht-Softwareleute gedacht, damit du mit Experten gezielt sprechen kannst.

## 1) Was ist das Produkt?
Ein Onboarding-Dashboard fuer Teams (Starter, Teamleiter, Admin).
Es hilft, neue Mitarbeiter zu steuern: Anrufe, Termine, Abschluesse, KPIs, Leads und Compliance.

## 2) Grobe Architektur
- Frontend (Oberflaeche): React + TypeScript + Vite + Tailwind.
- Backend (Logik/API): FastAPI + SQLAlchemy.
- Datenbank: SQLite (lokal) oder PostgreSQL (Produktion moeglich).
- Deployment: Docker (Container), z. B. Hugging Face Spaces oder eigener Server.

## 3) Frontend in einfachen Worten
- React zeigt die Bildschirme (Dashboard, Kunden, Admin).
- TypeScript sorgt fuer Typ-Sicherheit (weniger Fehler).
- Tailwind CSS macht das Design schnell anpassbar.
- React Query laedt Daten aus der API und cached sie.
- Die App nutzt Rollen: Starter, Teamleiter, Admin (die sehen Unterschiedliches).

Wichtige Seiten:
- StarterDashboard: persoenliche KPIs + schnelle Aktivitaeten.
- TeamleiterDashboard: Team-Statistiken und Leads.
- AdminDashboard/Console: Nutzer, Teams, KPI-Konfig, Audit-Log.

## 4) Backend in einfachen Worten
- FastAPI stellt die Schnittstellen bereit (z. B. /api/kpis, /api/leads).
- SQLAlchemy arbeitet mit der Datenbank (Lesen/Schreiben).
- Alembic verwaltet Datenbank-Aenderungen (Migrationen).
- Security: Session-Cookies, Rollenrechte, Audit-Logs.

## 5) Datenmodell (vereinfacht)
- User: Person mit Rolle.
- Team: Gruppe von Usern.
- Lead: Kunde/Interessent.
- Events: Anruf, Termin, Abschluss.
- KPIConfig: Schwellwerte und Sichtbarkeit je Rolle.

## 6) KPI-Logik (grob)
- KPIs werden im Backend berechnet (z. B. Pickup-Rate, Abschlussquote).
- Schwellenwerte steuern Farben (gut/warn/kritisch).
- Journey-KPIs zeigen die Reise vom Erstkontakt bis Abschluss.

## 7) Kalender & Aktivitaeten
- Termine und Rueckrufe werden im Kalender angezeigt.
- Das Modal fuehrt Schritt-fuer-Schritt durch Anruf/Termin/Abschluss.
- Statuswechsel erzeugen passende Events, damit nichts "verloren" geht.

## 8) Deployment (kurz)
Lokale Entwicklung:
- Backend laeuft auf Port 8000, Frontend auf 5173.

Docker/Hugging Face:
- Ein Container liefert Frontend und Backend zusammen.
- Standard-Port ist 7860.
- Wenn moeglich, persistente Daten ueber /data (Hugging Face Storage).

## 9) Was ist "produktionsreif"?
Das sind typische Punkte, die ein Experte pruefen wuerde:
- Tests vorhanden und laufen.
- Monitoring/Logging fuer Fehler.
- Sicherheit (CSRF, Rate-Limits, Rollen, Audit).
- Backups / Daten-Persistenz.
- Dokumentation fuer Betrieb und Updates.

## 10) Aktuelle Aenderungen (einfach erklaert)
1) Journey-KPIs im UI
- Funnel-, Drop-off- und Zeit-KPIs sind sichtbar.
- So sieht man den Weg bis zum Abschluss.

2) Kalender-UI (Starter/Teamleiter)
- Rueckrufe und Termine werden uebersichtlich gezeigt.

3) Schnellaktionen im Kundenmenue
- Buttons fuer Anruf, Termin, Abschluss (statusabhaengig).

4) Klartext in der Aktivitaets-Erfassung
- Hinweise zeigen, was bei jeder Auswahl passiert.

5) Termin-Prefill im Modal
- Bereits vorhandene Termine werden vorbefuellt.

6) Termin-Konsistenz im Backend
- Status "Termin vereinbart" erzeugt automatisch einen AppointmentEvent.

7) KPI-Visibility pro Rolle
- KPIs koennen rollenbasiert angezeigt/ausgeblendet werden.

8) Regressionstests
- Wichtige Status-Regeln und Hauptpfad sind getestet.

## 11) Fragen, die du Experten stellen kannst
- Welche Datenbank wuerdest du fuer Produktion empfehlen?
- Was sind die groessten Risiken in Security/Compliance?
- Welche Integrationen bringen den groessten Nutzen (CRM, Telefonie, Kalender)?
- Was fehlt fuer "Enterprise-Ready"?
