# Subagent Prompt Guardrails

## Motivation

Das Agent-Tool fördert aktuell breite parallele Delegation und besagt, dass Subagent-Output im Allgemeinen vertrauenswürdig sei. Die eingebauten Prompts lassen zudem einige Ausführungs- und Verifikationserwartungen aus, während die Explore- und Fork-Prompts unsichere oder widersprüchliche Anleitung enthalten.

## Design

- Dem Parent-Agent sagen, dass er nur begrenzte, unabhängige Arbeit delegieren, unmittelbare Critical-Path-Arbeit lokal behalten, doppelte Arbeit vermeiden und parallelen Code-schreibenden Agenten disjunkte Schreib-Scopes geben soll.
- Vom Parent verlangen, dass er Behauptungen und Code-Änderungen prüft, bevor er ein Subagent-Ergebnis integriert oder weiterleitet.
- Den General-Purpose-Prompt vereinfachen und Scope-, Beibehaltungs-, Verifikations-, Unsicherheits- und strukturierte Berichtserwartungen hinzufügen.
- Die zustandsbehaftete Tool-Oberfläche von Explore einengen, indem Task-, Memory- und Benutzer-Frage-Tools aus seiner Allowlist entfernt werden. Shell-Pipelines erlauben und gleichzeitig das Schreiben in seinem Prompt weiterhin verbieten.
- Nicht mehr verlangen, dass Fork-Agenten Änderungen committen, es sei denn, die Anweisung verlangt explizit einen Commit.

Kontextvererbung und das Standard-Hintergrundausführungsverhalten liegen außerhalb dieser Änderung.

## Verifikation

Fokussierte Unit-Tests behaupten die Parent-Anleitung, die Inhalte der eingebauten Prompts, die Tool-Allowlist von Explore und die Fork-Berichtsregel. Der Build und Typecheck des Core-Pakets liefern die breitere Compilezeit-Prüfung.
