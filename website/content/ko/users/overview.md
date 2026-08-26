# Qwen Code 개요

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> 터미널에서 작동하며 아이디어를 코드보다 빠르게 구현할 수 있도록 도와주는 Qwen의 에이전트 기반 코딩 도구인 Qwen Code에 대해 알아보세요.

## 30초 만에 시작하기

### Qwen Code 설치:

권장 설치 방법은 플랫폼에서 사용 가능한 경우 독립 실행형 아카이브를 사용하는 것입니다. npm으로 대체될 경우, PATH에 Node.js 22 이상이 npm과 함께 사용 가능해야 합니다.

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> 설치 후 `qwen`이 즉시 PATH에서 사용할 수 없으면 터미널을 재시작하는 것이 좋습니다. 설치에 실패하면 Quickstart 가이드의 [수동 설치](./quickstart#manual-installation)를 참조하세요. 오프라인 설치의 경우 릴리스 아카이브를 다운로드하고 `--archive PATH` 옵션으로 설치 프로그램을 실행하세요. 아카이브 옆에 `SHA256SUMS` 파일을 유지하세요.

### Qwen Code 사용 시작:

```bash
cd your-project
qwen
```

처음 실행하면 모델 제공자를 연결하라는 메시지가 표시됩니다. 메뉴에는 **Alibaba ModelStudio**(Coding Plan, Token Plan 또는 표준 API 키), **Third-party Providers**(DeepSeek, MiniMax, Z.AI, Kimi, OpenRouter 등 내장 제공자, API 키로 연결), **Custom Provider**(로컬 서버, 프록시 또는 지원되지 않는 제공자)가 있습니다. [Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))의 경우 **Alibaba ModelStudio → Coding Plan**을 선택하고, ModelStudio API 키를 사용하려면 **Alibaba ModelStudio → Standard API Key**를 선택한 후 API 설정 가이드([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721))를 따르세요. 그런 다음 코드베이스를 이해하는 것부터 시작해 봅시다. 다음 명령어 중 하나를 시도해 보세요:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

첫 사용 시 로그인 메시지가 표시됩니다. 이제 시작할 준비가 되었습니다! [Quickstart 계속하기 (5분) →](./quickstart)

> [!tip]
>
> 문제가 발생하면 [문제 해결](./support/troubleshooting)을 참조하세요.

> [!note]
>
> **새 VS Code 확장 프로그램(Beta)**: 그래픽 인터페이스를 선호하시나요? 새로운 **VS Code 확장 프로그램**은 터미널에 대한 익숙함 없이도 사용하기 쉬운 네이티브 IDE 경험을 제공합니다. Marketplace에서 설치하고 사이드바에서 바로 Qwen Code로 코딩을 시작하세요. [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)을 지금 다운로드하고 설치하세요.

## Qwen Code가 해주는 일

- **설명으로 기능 구축**: 만들고 싶은 것을 자연어로 Qwen Code에게 알려주세요. 계획을 세우고, 코드를 작성하고, 제대로 작동하는지 확인합니다.
- **디버깅 및 문제 수정**: 버그를 설명하거나 오류 메시지를 붙여넣으세요. Qwen Code가 코드베이스를 분석하고 문제를 찾아 수정합니다.
- **어떤 코드베이스도 탐색**: 팀의 코드베이스에 대해 무엇이든 질문하면 생각 있는 답변을 받을 수 있습니다. Qwen Code는 전체 프로젝트 구조를 인지하고, 웹에서 최신 정보를 찾을 수 있으며, [MCP](./features/mcp)를 통해 Google Drive, Figma, Slack과 같은 외부 데이터 소스에서 정보를 가져올 수 있습니다.
- **번거로운 작업 자동화**: 까다로운 lint 문제를 수정하고, 병합 충돌을 해결하고, 릴리스 노트를 작성하세요. 개발 머신에서 하나의 명령어로, 또는 CI에서 자동으로 모든 작업을 수행할 수 있습니다.
- **[후속 제안](./features/followup-suggestions)**: Qwen Code가 다음에 입력할 내용을 예측하여 고스트 텍스트로 표시합니다. Tab을 눌러 수락하거나 계속 입력하여 무시할 수 있습니다.

## 개발자들이 Qwen Code를 사랑하는 이유

- **터미널에서 작동**: 또 다른 채팅 창이 아닙니다. 또 다른 IDE가 아닙니다. Qwen Code는 이미 작업하는 곳에서, 이미 사랑하는 도구로 여러분을 만납니다.
- **실제 작업을 수행**: Qwen Code는 파일을 직접 편집하고, 명령을 실행하고, 커밋을 생성할 수 있습니다. 더 많은 것이 필요하신가요? [MCP](./features/mcp)를 통해 Qwen Code가 Google Drive의 설계 문서를 읽고, Jira의 티켓을 업데이트하거나, _여러분의_ 커스텀 개발 도구를 사용할 수 있습니다.
- **Unix 철학**: Qwen Code는 합성 가능하고 스크립팅 가능합니다. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"`이 _실제로 작동합니다_. CI에서 `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`를 실행할 수 있습니다.
