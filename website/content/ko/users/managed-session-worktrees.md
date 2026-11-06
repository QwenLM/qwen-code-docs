# Managed Session worktree


지원되는 로컬 Managed 배포에서 Session을 생성할 때 Git 프로젝트를 선택하세요. composer 아래의 워크스페이스 옆에 있는 Git branch 버튼을 열고 **Worktree**를 선택하세요. 선택기가 닫히고 첫 번째 메시지를 보내면 현재 HEAD에서 자체 branch로 격리된 checkout이 자동으로 생성됩니다. 입력할 branch나 디렉토리 양식은 없습니다. 커밋되지 않은 파일, 무시된 구성 및 설치된 종속성은 소스 디렉토리에 그대로 유지됩니다.

보내기 전에 **Current branch**를 선택하거나 Worktree 칩을 지워 소스 branch에서 직접 작업하세요. 격리가 선택되지 않으면 칩에 **main**과 같은 실제 소스 branch가 표시됩니다.

Session은 준비 상태를 보고하고 동일한 저장소를 사용하는 다른 도구를 기다릴 수 있습니다. worktree가 준비되면 파일 참조 및 Workspace 업로드를 사용할 수 있습니다. 프로젝트 지침은 대상 디렉토리에서 가져옵니다. Managed 모델, 승인, Skills, MCP 및 Extensions 설정은 Session 핀을 유지합니다.

Home 채팅에서 session의 추가 정보 카드에 worktree 상태, branch 및 base commit이 포함됩니다. 준비된 worktree 세부 정보는 더 이상 대화 상단에 공간을 차지하지 않으며, 준비 및 오류 메시지는 필요할 때 여전히 dort 표시됩니다.

채팅을 닫거나 아카이브하거나 삭제해도 checkout과 branch는 유지됩니다. 동일한 Workspace의 새 작업 composer 팝오버에서 **Session worktrees**를 열어 유지된 디렉토리를 검사하세요. 정리하기 전에 Session을 닫고 백그라운드 작업을 완료하세요. 추적/추적되지 않음/무시된 콘텐츠를 먼저 커밋하거나 저장하세요. 정리는 깨끗한 checkout만 제거하고 모든 branch를 유지하며, 소스에 변경 사항을 병합하지 않습니다.

배포는 `qwen.managed-agent.runtime-broker.session-worktrees-enabled`를 활성화합니다. 기본적으로 꺼져 있으며 `qwen serve --managed`는 적격한 로컬 호스트를 활성화합니다. 이 버전은 LOCAL macOS/Linux 저장소, Session 격리된 내구성 로컬 프로세스 작업자 및 Git 2.40 이상을 지원합니다. 저장소와 해당 Git 일반 디렉토리는 등록된 저장소 루트 내에 있어야 합니다. Git 메타데이터가 다른 곳에 있는 기존 연결된 checkout의 경우 원래 checkout을 선택하거나 관리자에게 둘 다 포함하는 루트를 등록하도록 요청하세요. SSH 및 CSI는 이 버전에서 지원되지 않습니다.

준비된 Session을 재시작하면 원래 checkout을 재사용합니다. 누락되거나 교체된 디렉토리는 실행을 차단합니다. Git이 worktree를 생성하거나 제거하는 동안 서버가 종료되면 확인되지 않은 원래 Git 프로세스가 작업을 차단하고 유지 보수 보류 상태를 그대로 유지합니다. 재확인해도 복구가 강제되지 않으며, 이 경우에 대한 macOS 자동 복구는 이 버전에서 지원되지 않습니다. 원래 실행을 조정할 수 있을 때까지 디렉토리와 branch를 보존하세요.

공개 Session 생성 요청은 `worktree: {"base_ref":"main"}`을 추가합니다. `worktree: {}`는 HEAD를 선택하고 생략하면 현재 디렉토리를 사용합니다. 명시적으로 인증된 `workspace`를 보내고 재시도 시 동일한 Idempotency-Key를 유지하세요. 후속 입력을 보내기 전에 반환된 Session의 `worktree.state`를 쿼리하세요.

이 개발 버전은 공유 V1 스키마 기준선을 업데이트합니다. 해당 기준선에서 다시 생성된 개발 카탈로그를 사용하세요. 이전 카탈로그에 대한 업그레이드 마이그레이션은 포함되어 있지 않습니다.
