# Qwen Code 로드맵

> **목표**: Claude Code의 제품 기능과 격차를 해소하고, 세부 사항을 지속적으로 개선하여 사용자 경험을 향상시킨다.

| 카테고리                          | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 사용자 경험                 | ✅ Terminal UI<br>✅ Support OpenAI Protocol<br>✅ Settings<br>✅ OAuth<br>✅ Cache Control<br>✅ Memory<br>✅ Compress<br>✅ Theme                                                | Better UI<br>OnBoarding<br>LogView<br>✅ Session<br>Permission<br>🔄 Cross-platform Compatibility<br>✅ Coding Plan<br>✅ Anthropic Provider<br>✅ Multimodal Input<br>✅ Unified WebUI |
| 코딩 워크플로우                 | ✅ Slash Commands<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi Model<br>✅ Chat Management<br>✅ Tools (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Headless Mode<br>✅ Tools (WebSearch)<br>✅ LSP Support<br>✅ Concurrent Runner                                                                              |
| 개방형 기능 구축      | ✅ Custom Commands                                                                                                                                                                 | ✅ QwenCode SDK<br>✅ Extension System                                                                                                                                                  |
| 커뮤니티 생태계 통합 |                                                                                                                                                                                    | ✅ VSCode Plugin<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| 관리 기능     | ✅ Stats<br>✅ Feedback                                                                                                                                                            | Costs<br>Dashboard<br>✅ User Feedback Dialog                                                                                                                                           |

> 자세한 내용은 아래 목록을 참조하세요.

## 기능

#### 완료된 기능

| 기능                 | 버전   | 설명                                             | 카테고리                        | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Coding Plan**         | `V0.10.0` | Alibaba Cloud Coding Plan 인증 및 모델       | 사용자 경험                 | 2     |
| Unified WebUI           | `V0.9.0`  | VSCode/CLI 공유 WebUI 컴포넌트 라이브러리           | 사용자 경험                 | 2     |
| Export Chat             | `V0.8.0`  | 세션을 Markdown/HTML/JSON/JSONL로 내보내기             | 사용자 경험                 | 2     |
| Extension System        | `V0.8.0`  | 슬래시 명령어를 포함한 전체 확장 관리           | 개방형 기능 구축      | 2     |
| LSP Support             | `V0.7.0`  | 실험적 LSP 서비스 (`--experimental-lsp`)         | 코딩 워크플로우                 | 2     |
| Anthropic Provider      | `V0.7.0`  | Anthropic API 프로바이더 지원                          | 사용자 경험                 | 2     |
| User Feedback Dialog    | `V0.7.0`  | 피로도 메커니즘이 포함된 앱 내 피드백 수집       | 관리 기능     | 2     |
| Concurrent Runner       | `V0.6.0`  | Git 통합 배치 CLI 실행                | 코딩 워크플로우                 | 2     |
| Multimodal Input        | `V0.6.0`  | 이미지, PDF, 오디오, 비디오 입력 지원                  | 사용자 경험                 | 2     |
| Skill                   | `V0.6.0`  | 확장 가능한 커스텀 AI skill (실험적)              | 코딩 워크플로우                 | 2     |
| GitHub Actions          | `V0.5.0`  | qwen-code-action 및 자동화                         | 커뮤니티 생태계 통합 | 1     |
| VSCode Plugin           | `V0.5.0`  | VSCode 확장 플러그인                                 | 커뮤니티 생태계 통합 | 1     |
| QwenCode SDK            | `V0.4.0`  | 서드파티 통합을 위한 오픈 SDK                    | 개방형 기능 구축      | 1     |
| Session                 | `V0.4.0`  | 향상된 세션 관리                             | 사용자 경험                 | 1     |
| i18n                    | `V0.3.0`  | 국제화 및 다국어 지원           | 사용자 경험                 | 1     |
| Headless Mode           | `V0.3.0`  | 헤드리스 모드 (비인터랙티브)                         | 코딩 워크플로우                 | 1     |
| ACP/Zed                 | `V0.2.0`  | ACP 및 Zed 에디터 통합                          | 커뮤니티 생태계 통합 | 1     |
| Terminal UI             | `V0.1.0+` | 인터랙티브 터미널 사용자 인터페이스                     | 사용자 경험                 | 1     |
| Settings                | `V0.1.0+` | 설정 관리 시스템                         | 사용자 경험                 | 1     |
| Theme                   | `V0.1.0+` | 멀티 테마 지원                                     | 사용자 경험                 | 1     |
| Support OpenAI Protocol | `V0.1.0+` | OpenAI API 프로토콜 지원                         | 사용자 경험                 | 1     |
| Chat Management         | `V0.1.0+` | 세션 관리 (저장, 복원, 탐색)              | 코딩 워크플로우                 | 1     |
| MCP                     | `V0.1.0+` | 모델 컨텍스트 프로토콜 통합                      | 코딩 워크플로우                 | 1     |
| Multi Model             | `V0.1.0+` | 멀티 모델 지원 및 전환                       | 코딩 워크플로우                 | 1     |
| Slash Commands          | `V0.1.0+` | 슬래시 명령어 시스템                                    | 코딩 워크플로우                 | 1     |
| Tool: Bash              | `V0.1.0+` | 셸 명령어 실행 도구 (is_background 파라미터 포함) | 코딩 워크플로우                 | 1     |
| Tool: FileRead/EditFile | `V0.1.0+` | 파일 읽기/쓰기 및 편집 도구                          | 코딩 워크플로우                 | 1     |
| Custom Commands         | `V0.1.0+` | 커스텀 명령어 로딩                                  | 개방형 기능 구축      | 1     |
| Feedback                | `V0.1.0+` | 피드백 메커니즘 (/bug 명령어)                       | 관리 기능     | 1     |
| Stats                   | `V0.1.0+` | 사용 통계 및 할당량 표시                      | 관리 기능     | 1     |
| Memory                  | `V0.0.9+` | 프로젝트 레벨 및 글로벌 메모리 관리              | 사용자 경험                 | 1     |
| Cache Control           | `V0.0.9+` | 프롬프트 캐싱 제어 (Anthropic, DashScope)           | 사용자 경험                 | 1     |
| PlanMode                | `V0.0.14` | 작업 계획 모드                                      | 코딩 워크플로우                 | 1     |
| Compress                | `V0.0.11` | 채팅 압축 메커니즘                              | 사용자 경험                 | 1     |
| SubAgent                | `V0.0.11` | 전용 서브에이전트 시스템                              | 코딩 워크플로우                 | 1     |
| TodoWrite               | `V0.0.10` | 작업 관리 및 진행 추적                   | 코딩 워크플로우                 | 1     |
| Tool: TextSearch        | `V0.0.8+` | 텍스트 검색 도구 (grep, .qwenignore 지원)           | 코딩 워크플로우                 | 1     |
| Tool: WebFetch          | `V0.0.7+` | 웹 콘텐츠 가져오기 도구                               | 코딩 워크플로우                 | 1     |
| Tool: WebSearch         | `V0.0.7+` | 웹 검색 도구 (Tavily API 사용)                      | 코딩 워크플로우                 | 1     |
| OAuth                   | `V0.0.5+` | OAuth 로그인 인증 (Qwen OAuth)                 | 사용자 경험                 | 1     |

#### 개발 예정 기능

| 기능                      | 우선순위 | 상태      | 설명                       | 카테고리                    |
| ---------------------------- | -------- | ----------- | --------------------------------- | --------------------------- |
| Better UI                    | P1       | 계획 중     | 최적화된 터미널 UI 인터랙션 | 사용자 경험             |
| OnBoarding                   | P1       | 계획 중     | 신규 사용자 온보딩 플로우          | 사용자 경험             |
| Permission                   | P1       | 계획 중     | 권한 시스템 최적화    | 사용자 경험             |
| Cross-platform Compatibility | P1       | 진행 중 | Windows/Linux/macOS 호환성 | 사용자 경험             |
| LogView                      | P2       | 계획 중     | 로그 보기 및 디버깅 기능 | 사용자 경험             |
| Hooks                        | P2       | 진행 중 | 확장 hook 시스템            | 코딩 워크플로우             |
| Costs                        | P2       | 계획 중     | 비용 추적 및 분석        | 관리 기능 |
| Dashboard                    | P2       | 계획 중     | 관리 대시보드              | 관리 기능 |

#### 논의가 필요한 차별화 기능

| 기능          | 상태   | 설명                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | 리서치 중 | 프로젝트 검색 및 빠른 실행                    |
| Competitive Mode | 리서치 중 | 경쟁 모드                                      |
| Pulse            | 리서치 중 | 사용자 활동 펄스 분석 (OpenAI Pulse 참고) |
| Code Wiki        | 리서치 중 | 프로젝트 코드베이스 위키/문서 시스템            |
