# Agent Plugins v1

Qwen Code는 휴대 가능한 [Agent Plugins v1](https://agent-plugins.org/) 패키지를 네이티브로 로드합니다. 패키지는 표준 `plugin.json`, `mcp.json`, `SKILL.md` 파일을 그대로 유지합니다. 설치 시 `qwen-extension.json`이 생성되거나 휴대 가능한 파일이 다시 작성되지 않습니다.

기존 확장 명령어를 로컬 디렉토리, 링크, 아카이브, Git 저장소, 아카이브 URL 또는 스코프된 npm 패키지와 함께 사용합니다:

```bash
qwen extensions install ./my-agent-plugin
qwen extensions link ./my-agent-plugin
qwen extensions install owner/my-agent-plugin
```

루트 매니페스트는 표준 v1 스키마를 대상으로 해야 합니다:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-agent-plugin",
  "version": "1.0.0"
}
```

## 지원되는 기능

| 기능                                       | 지원                                     |
| ------------------------------------------ | ---------------------------------------- |
| 직접 자식 `skills/*/SKILL.md`              | 예                                       |
| stdio MCP 서버                             | 예                                       |
| Streamable HTTP MCP 서버                   | 예                                       |
| 레거시 HTTP+SSE MCP 서버                   | 아니오; 항목이 건너뛰어짐               |
| Commands, agents 및 hooks                  | 아니오; 해당 디렉토리는 무시됨           |
| Qwen 컨텍스트, 설정, 채널 및 앱            | 아니오                                   |
| `extensions.*` 클라이언트 네임스페이스      | 아니오; 미구현 네임스페이스는 무시됨     |

Skill은 [Agent Skills 명세](https://agentskills.io/specification)를 따릅니다. 잘못된 skill은 유효한 형제 skill을 비활성화하지 않고 건너뛰어집니다. 실험적 `allowed-tools` 필드는 문자열로 인식되지만 사전 승인된 Qwen 도구를 부여하지는 않습니다.

stdio MCP 서버의 경우 Qwen Code는 `args`, 환경 값 및 `cwd`에서 `${PLUGIN_ROOT}`와 `${PLUGIN_DATA}`를 한 번씩 확장합니다. `PLUGIN_DATA`는 쓰기 가능한 설치별 디렉토리이며 내용은 업데이트 및 재설치 간에도 유지됩니다. 원격 MCP 엔드포인트는 루프백 HTTP 엔드포인트를 제외하고 HTTPS를 사용해야 합니다.

Agent Plugins v1은 마켓플레이스 통합이 아닌 패키지 형식입니다. Qwen Code의 기존 확장 소스를 통해 패키지를 설치하세요.
