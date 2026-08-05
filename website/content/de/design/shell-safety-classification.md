# Shell-Sicherheitsklassifikation

## Kontext und Scope

Issue [#6949](https://github.com/QwenLM/qwen-code/issues/6949) verlangt,
dass der Plan-Modus Befehle, die nachweislich read-only sind, von Befehlen
unterscheidet, deren Verhalten sich nicht statisch feststellen lässt. Ein
Boolean kann diese Unterscheidung nicht bewahren, daher führt diese Änderung
eine dreistufige Fakt-Schicht in `shellAstParser.ts` ein, ohne das
Permission-Routing zu ändern.

Diese Änderung modifiziert weder das Routing noch die Call-Site-Logik in
Shell, Monitor, PermissionManager, Spekulation, Memory-scoped-Agenten, ACP,
Plan-Modus-Prompts oder dem Plan-Exit-Verhalten. Bestehende Boolean-Consumer
können konservativer werden, wo der Klassifikator gehärtet wird. Eine
Folgeänderung kann `unknown`-Befehle über den neuen Fakt zu einmaliger
Genehmigung routen, ohne diesen Klassifikator zu ändern.

## Vertrag

`classifyShellCommandSafety(command)` ist eine interne Modul-API mit diesen
Ergebnissen:

| Ergebnis    | Bedeutung                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `read-only` | Jeder ausführbare Pfad ist durch die aktuellen Regeln als einer bewiesen, der persistenten oder externen State nicht verändert.  |
| `write`     | Die Syntax enthält positive Evidenz für eine Datei-, Git-, Prozess- oder andere State-Mutation. Der Befehl muss am Ende nicht erfolgreich sein. |
| `unknown`   | Der Befehl kann durch die unterstützten statischen Regeln weder als sicher noch als mutierend bewiesen werden.                     |

Für einen gültigen AST kombinieren sich die Ergebnisse in der Reihenfolge
`write > unknown > read-only`. Ein Baum, der `ERROR` enthält, wird als
`unknown` klassifiziert, bevor partielle Syntax ausgewertet wird. Befehls-
und Prozesssubstitutionen erzwingen eine `unknown`-Untergrenze, während ihre
ausführbaren Inhalte gescannt werden, sodass ein verschachtelter bekannter
Writer das Ergebnis auf `write` anhebt. Die Redirect-Analyse besitzt
Substitutionen innerhalb von Redirect-Knoten, während Befehls- und
Statement-Evaluatoren diese Knoten von ihren Substitutions-Scans
ausschließen und so ein wiederholtes Durchlaufen verschachtelter
Substitutionen verhindern. Kontrollfluss verwendet dieselbe
Unknown-Untergrenze und scannt mögliche Branches. Eine Funktionsdefinition
ist keine Ausführung und bleibt daher `unknown`, ohne ihren Body als
ausgeführten Write zu klassifizieren.

Eine alleinstehende reine Zuweisung und `cd` behalten das bestehende
Kompatibilitätsverhalten. Eine Zuweisung, die einem Befehl vorangestellt ist
oder eine zusammengesetzte Sequenz mit einem anderen Statement teilt,
erzwingt eine `unknown`-Untergrenze, weil Variablen wie `LD_PRELOAD`,
`PATH`, `PAGER` oder toolspezifische Konfiguration das Verhalten ändern
können; explizite Write-Evidenz gewinnt weiterhin. Subshells und
Befehlsgruppen aggregieren ihre ausgeführten Inhalte. Die API analysiert nur
den übergebenen Quell-String; sie entpackt weder `sudo` noch Interpreter,
löst weder PATH noch Aliase auf und lädt keine Shell-Konfiguration.

## Parser-Fehler und Kompatibilitäts-API

Der private Klassifikator kann beim Laden oder Ausführen von tree-sitter
werfen. Die öffentliche dreistufige API bildet diese Fehler auf `unknown` ab
und ersetzt sie niemals durch Regex-Gewissheit. Ein Parser, der beim Parsen
wirft, wird verworfen und aus der bereits geladenen Bash-Sprache neu
aufgebaut, weil die fehlgeschlagene Instanz vergiftet bleiben kann; dabei
werden weder Runtime noch Sprache neu geladen. Die bestehende
`isShellCommandReadOnlyAST()`-Kompatibilitäts-API gibt nur für `read-only`
`true` zurück, behält aber den bestehenden Regex-Fallback, wenn tree-sitter
nicht geladen werden kann oder zur Laufzeit wirft. Ein syntaktisch
ungültiger Baum ist ein normales `unknown`-Ergebnis und kein Parser-Fehler,
sodass er nie in diesen Fallback gelangt. Jeder erfolgreich zurückgegebene
Baum wird einmal in einem `finally`-Block freigegeben.

Diese Asymmetrie ist Absicht: Neue Consumer brauchen einen ehrlichen
Unsicherheitsfakt, während bestehende Boolean-Consumer ihr
Parser-Verfügbarkeitsverhalten behalten, bis sie explizit migrieren.

## Unterstützte Evidenz

Der Klassifikator erkennt eine begrenzte, case-sensitive Menge direkter
Dateisystem-Writer, Prozesssignal-Befehle, Output-Redirects,
Git-Mutationsfamilien und explizite Write-Modi in `find`, `sed`, `awk`,
`sort`, `tree`, `uniq`, `tee` und `dd`. Sed und AWK verwenden geteilte
lineare Scanner, die Inline-Programme von Optionswerten und Dateiargumenten
unterscheiden, sodass escapede, missgebildete oder hochrepetitive Eingaben
weder Regex-Backtracking auslösen noch Write-Evidenz aus einem Dateinamen
erfinden können. Git-Output-Dateien für `diff`, `log` und `show` sind
Writes. Zustandsbehaftete `printf -v`-Formen sind unknown. Explizite
Git-Helfer und Signaturverifikation, einschließlich
Pager-/Config-Umgebungsoptionen, Diff-/Textkonversions-Helfer, externer
Pager von grep und Signatur-Platzhalter, sind unknown; nicht unterstützte
globale Git-Optionen und Subcommand-Help-Pfade schlagen ebenfalls
fail-closed, weil Help einen externen Viewer starten kann. Dynamische
Ausführung, externe Skripte, mehrdeutige Output-Ziele, Interpreter und
Wrapper, `sort --compress-program`, Ripgrep-Präprozessoren, Hostname-Helfer
und Archivsuche (`--pre`, `--hostname-bin`, `--search-zip` und `-z`) sowie
gewöhnliche Pager-Befehle bleiben `unknown`. Options-Terminatoren und die
Wert-Arität unterstützter Optionen werden interpretiert, sodass eine Datei
oder Nachricht, die wörtlich `--help` heißt, nicht mit einem Help-Aufruf
verwechselt wird. Anders geschriebene Befehlsnamen, nicht gelistete
Paketmanager, Dienste und eigene Executables bleiben ebenfalls `unknown`;
der Klassifikator ist keine Sandbox.

Der deprecatede synchrone Checker spiegelt jedes neu abgelehnte Muster, das
das synchrone Scheduling braucht. Er bewahrt Parameter-Expansionen mit
Sentinels, statt zuzulassen, dass `shell-quote` sie löscht, lehnt
missgebildete nachgestellte Pipelines und Zuweisungs-Compound-Statements ab
und evaluiert Wrapper aus dem Originalbefehl. Er bleibt absichtlich boolean
und ist konservativer als der AST-Klassifikator: `printf`, optionsreiche
`sort`-, `tree`-, `uniq`-, `rg`- und `ripgrep`-Befehle sowie
Git-Branch-Formen jenseits der einfachsten Listing-Modi laufen sequenziell.

## Consumer und Migrationsgrenze

Die aktuellen Boolean-Consumer sind Shell, Monitor, PermissionManager, das
Spekulations-Gate und die Memory-scoped-Agent-Konfiguration; ihre Call-Sites
ändern sich in diesem Refactoring nicht. Der synchrone Checker wird außerdem
vom Core-Tool-Scheduler und dem Legacy-Shell-Permission-Utility verwendet.
Der Scheduler übergibt jetzt den Originalbefehl an den Checker, damit Wrapper
`unknown` bleiben, statt in einen scheinbar read-only Befehl entpackt zu
werden. `extractCommandRules()` bleibt unabhängig von der
Sicherheitsklassifikation.

Die Folgeänderung `fix(core): Route unknown Plan shell commands to one-off approval`
sollte `classifyShellCommandSafety()` nur an der Plan-Permission-Grenze
konsumieren. Sie muss Genehmigungsherkunft, Lifetime, ACP-Verhalten und die
Interaktion mit Plan-Exit separat definieren; diese Policies gehören nicht
in die Fakt-Schicht.

## Claude-Code-Referenz

Die Bash-Analyse von Claude Code dient als Evidenz für zwei
Designprinzipien: Parse-Unsicherheit muss explizit repräsentiert werden, und
Permission-Entscheidungen müssen fail-closed sein, wenn Parsen nicht
verfügbar oder zu komplex ist. Ihr größerer Bash-Parser und ihre
Policy-Engine werden nicht kopiert, weil Qwen Code an der aktuellen Grenze
nur einen kleinen Klassifikator braucht.

## Verifikation

Die Unit-Abdeckung nutzt tabelldriven Matrizen für alle drei Zustände,
Compound-Präzedenz, Substitutionen, Syntaxfehler, Parser-Initialisierung und
Laufzeitfehler, begrenztes Verhalten bei adversariellen verschachtelten und
escapeden Eingaben sowie Kompatibilitäts-Monotonie. Die Tests des synchronen
Checkers und des Schedulers verhindern, dass neu bekannte unsichere Befehle
in gleichzeitige Shell-Batches aufgenommen werden.
