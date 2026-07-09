# Channel Lifecycle Status Umbrella

Datum: 2026-07-01

## Ziel

Bereitstellung einer einheitlichen Review-Übersicht, die das Lifecycle-Status-Verhalten der unterstützten Channel-Adapter zusammenfasst und aufzeigt, was bewusst out of scope bleibt.

## Scope

- Telegram
- Weixin
- DingTalk
- Feishu

## Explizite Non-Goals

- Slack bleibt out of scope.
- QQ Bot bleibt für die Lifecycle-Status-UI out of scope.
- Das Plugin-Beispiel bleibt für die Lifecycle-Status-UI out of scope.
- Das DingTalk Terminal-Emoji bleibt out of scope.

## Reviewer-Matrix

| Channel        | Unterstützte Lifecycle-Events                 | Native Surface                      | `started`-Verhalten                                                                                                      | `text_chunk`-Verhalten                                                                                                           | Terminal-Verhalten                                                                                                         | Grund für Unsupported / No-op                                                                                                                               | Exakte Testdateien                                                                                |
| -------------- | --------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Telegram       | `started`, `completed`, `cancelled`, `failed` | Typing-Indicator                    | Startet die bestehende Typing-Loop pro Chat einmal. Doppelte `started`-Events fügen keine weitere Loop hinzu.            | Wird vom Lifecycle-Hook ignoriert. Der Response-Content wird über den normalen Reply-Pfad fortgesetzt.                           | Stoppt die Typing-Loop bei jedem Terminal-Event und hinterlässt kein veraltetes Intervall.                               | `tool_call` hat keine native Status-Surface und benötigt keine Adapter-UI.                                                                                  | `packages/channels/telegram/src/TelegramAdapter.test.ts`                                        |
| Weixin         | `started`, `completed`, `cancelled`, `failed` | Typing-Indicator                    | Ruft `setTyping(chatId, true)` einmal für den aktiven Chat auf. Doppelte `started`-Events stacken den Typing-State nicht erneut. | Wird vom Lifecycle-Hook ignoriert. Der Response-Content wird über den normalen Send-Pfad fortgesetzt.                            | Ruft bei Terminal-Events `setTyping(chatId, false)` auf. Fehlgeschlagene Startversuche löschen den lokalen State, sodass ein späteres `started` es erneut versuchen kann. | `tool_call` hat keine separate Status-Surface und es sollte keine zusätzliche Nachricht gesendet werden.                                                    | `packages/channels/weixin/src/WeixinAdapter.test.ts`                                            |
| DingTalk       | `started`, `completed`, `cancelled`, `failed` | Eye-Reaktion auf die Inbound-Nachricht | Hängt die bestehende Eye-Reaktion einmal an, wenn eine Conversation-ID verfügbar ist.                                  | Wird vom Lifecycle-Hook ignoriert. Der Response-Content wird über den normalen Send-Pfad fortgesetzt.                            | Entfernt die Eye-Reaktion bei Terminal-Events, einschließlich spät auflösender Attach-Races nach einer Cancellation.   | Direkte Robot-Webhook-Chats stellen die für Reaktionen benötigte Conversation-ID nicht bereit, sodass der Lifecycle-Status dort ein No-op ist. `tool_call` hat ebenfalls keine UI im Scope. | `packages/channels/dingtalk/src/DingtalkAdapter.test.ts`                                        |
| Feishu         | `started`, `completed`, `cancelled`, `failed` | Streaming-Card-Status-Label       | Belässt die Card in ihrem Running-State und reserviert Platz für das Running-Label, während der bestehende Card-Stream aktiv ist. | Wird nicht direkt vom Lifecycle-Hook konsumiert. Das Content-Streaming bleibt in der Verantwortung des bestehenden Response/Card-Stream-Hooks.         | Finalisiert das Card-Status-Label als completed, cancelled oder failed, ohne den gestreamten Answer-Body zu überschreiben. | `tool_call` bleibt verborgen, da die Card bereits nur den Answer-Stream plus Terminal-Status-Label verwendet.                                                 | `packages/channels/feishu/src/adapter.test.ts`, `packages/channels/feishu/src/markdown.test.ts` |
| QQ Bot         | Keine                                         | Keine                               | No-op.                                                                                                                   | No-op. QQ Bot streamt weiterhin Reply-Chunks über Outbound-Message-Sends, aber nicht über Lifecycle-Status-Updates.                | No-op.                                                                                                                   | Der Channel hat keinen Typing- oder Task-Status-Endpoint, und `QQChannel` lässt `onPromptStart`, `onPromptEnd` und `onTaskLifecycle` by design leer.              | `packages/channels/qqbot/src/send.test.ts`, `packages/channels/qqbot/src/api.test.ts`           |
| Plugin-Beispiel | Keine                                        | Nur WebSocket-Protokoll-Nachrichten | No-op für den Lifecycle-Status.                                                                                          | Streamt Response-Chunks über den `chunk`-Message-Typ des Mock-Protokolls von `onResponseChunk` aus, außerhalb der Lifecycle-Status-Behandlung. | Sendet die finale Outbound-Nachricht bei Abschluss der Response, außerhalb der Lifecycle-Status-Behandlung.            | Der Mock-Channel demonstriert nur das Transport-Wiring; er hat keine native Typing-, Reaction- oder Status-Surface.                                           | `integration-tests/channel-plugin.test.ts`                                                      |

## Review-Hinweise

- Das Feishu-Lifecycle-`text_chunk` bleibt im Lifecycle-Hook ein No-op. Es hängt dort keinen Answer-Content an oder aktualisiert ihn.
- Slack ist absichtlich von dieser Matrix ausgeschlossen, da es out of scope ist.
- DingTalk-Terminal-Events nehmen in diesem Scope nur die bestehende Eye-Reaktion zurück. Es wird kein Terminal-Emoji hinzugefügt.