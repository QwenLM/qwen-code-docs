# WebShell-AskUserQuestion-Submit-Retry

## Problem

`AskUserQuestion` sperrt unmittelbar, nachdem eine Entscheidung angeklickt
wurde, aber sein Callback legt das asynchrone Berechtigungsergebnis nicht
offen. Ein fehlgeschlagener Request hinterlässt daher ein scheinbar
aktiviertes Panel, das Retries still ignoriert. Der Submit-Pfad kehrt zudem
still zurück, wenn der Berechtigungs-Payload keine `allow_once`-Option hat.

## Design

- `AskUserQuestion` einen Promise-zurückgebenden Bestätigungs-Callback und
  einen Fehler-Reporter geben, der von seiner besitzenden Chat-Fläche
  bereitgestellt wird.
- Während der Request in Flight ist, die Aktionen deaktivieren und einen
  Submitting-Indikator anzeigen.
- Eine erfolgreich akzeptierte Entscheidung gesperrt lassen, während das
  Berechtigungs-Event das Panel entfernt. Das deckt auch Konsens-Votes ab,
  die aufgezeichnet, aber noch nicht final sind.
- Bei Ablehnung oder einem `false`-Ergebnis den Fehler melden und die
  Aktionen entsperren, damit der Nutzer erneut versuchen kann.
- Eine fehlende `allow_once`-Option sofort melden statt still zurückzukehren.
