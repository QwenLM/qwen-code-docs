# `qwen serve` 로컬 실행 템플릿 (v0.16-alpha)

개발자 워크스테이션에서 `qwen serve`를 장기간 백그라운드 프로세스로 실행하기 위한 레퍼런스 템플릿입니다. [v0.16-alpha 알려진 제한](./qwen-serve.md#v016-alpha-known-limits)과 함께 사용됩니다 — 로컬 전용, 단일 사용자, 자체 bearer token. 컨테이너화 / 다중 호스트 / TLS 프론트 배포는 v0.16.x로 연기됩니다.

> **대상 독자**: 재부팅 후에도 데몬이 유지되길 원하고, 로그를 내구성 있는 위치에 저장하며, 깔끔한 `restart-on-failure` 시나리오를 원하는 dogfooding 개발자. 단일 셸 세션 동안만 데몬이 필요다면 일반 `qwen serve`(foreground, Ctrl-C로 중지)로 충분합니다.

## Bearer token 생성 (한 번만)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # 사용자 관리 경로, 내장 경로 아님
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

경로 / 파일명은 자유롭게 선택할 수 있습니다. v0.16-alpha는 token 파일을 자동 생성하거나 자동 위치를 찾지 않습니다(v0.16.x로 연기). canonical BYO 설정에 대해서는 사용자 가이드의 [인증](./qwen-serve.md#authentication) 섹션을 참조하세요.

> **이 `export`는 현재 셸 세션에만 적용하세요.** `~/.bashrc` / `~/.zshrc`에 추가하지 마세요 — 프로필 수준의 export는 bearer token을 해당 셸에서 파생되는 모든 프로세스(IDE 하위 프로세스, 브라우저 디버거, 무관한 프로젝트의 `npm` 스크립트)에 노출합니다. 장기간 실행되는 설정의 경우 아래 systemd `EnvironmentFile=` / launchd `EnvironmentVariables` 메커니즘을 사용하세요 — 둘 다 token을 데몬 프로세스에만 한정합니다.

데몬은 bearer token을 CLI의 `--token <value>` 또는 `QWEN_SERVER_TOKEN` 환경 변수 중 하나에서 읽습니다(양쪽 모두 공백 제거). TypeScript SDK의 `DaemonClient` 생성자는 `token` 옵션이 전달되지 않을 때 `QWEN_SERVER_TOKEN`으로 대체합니다(PR 27 fallback — 환경 변수가 설정된 클라이언트는 값을 스크립트에 전달할 필요가 없습니다).

하나의 셸 수준 `export`로 서버 부트와 SDK 클라이언트 생성을 모두 처리할 수 있습니다(단, 위 참고에 따라 세션으로 한정하세요).

## 작업 공간 수명과 프로세스 경계

하나의 데몬이 동일한 리스너 아래에서 여러 격리된 작업 공간 런타임을 호스팅할 수 있습니다.
`--workspace`를 절대 디렉토리로 반복하여 명시적 시작
런타임을 생성할 수 있으며, 첫 번째가 기본입니다. 기본 및 기타 명시적 시작/정적
런타임은 프로세스를 재시작하지 않고는 제거할 수 없습니다.

추가 작업 공간은 데몬이 실행 중인 동안
`POST /workspaces`를 통해 등록할 수도 있습니다. `persist: true`를 전달하면 동적 보조
작업 공간을 사용자 수준 등록 저장소에 보관하여 다음 시작 시 복원됩니다.
신뢰할 수 없는 등록은 진단, 경계가 있는 파일 읽기
및 선언된 지속 읽기에 대해 계속 표시되지만 ACP를 시작할 수 없습니다. 동적 및
지속 복원 보조 작업 공간은 제거 가능합니다: 일반 제거는 런타임이 사용 중일 때 거부하며, 강제 제거는 활성
리소스의 종료를 요청하고 동일한 cwd를 다시 추가할 수 있기 전에 논리적 제거를 커밋합니다.
정리는 지속 커밋 시점 이후에 경계가 있고 best-effort입니다. 실패는
제거된 런타임을 복원하지 않고 로그로 기록됩니다.

런타임 격리는 cwd, 환경 오버레이, 파일 시스템/신뢰 경계,
작업 공간 서비스, 브리지, Voice lease 상태, 채널 워커 및 ACP/MCP
리소스 경계를 포함합니다. 프로덕션은 호환성을 위해 신뢰할 수 있는 기본 ACP 자식을 예열하려고 시도합니다. 신뢰할 수 있는 보조 작업 공간은 첫 런타임 기반 명령어 또는 Session에서 시작되며, 신뢰할 수 없는 보조 작업 공간은 ACP를 시작하지 않습니다. 레거시 기본 경로는 기존 호환성 동작을 유지합니다.
인증, HTTP 속도 제한, 리스너 및 Voice 수용 한도,
총 세션 수용, 메트릭, 종료 및 프로세스 장애 반경은
데몬 전역으로 유지됩니다. 이러한 프로세스 수준 경계가 독립적이어야 하는 경우 별도의 데몬을 실행하세요.

## Linux: systemd 사용자 유닛

> **먼저 `qwen` 바이너리와 신뢰할 수 있는 도구 디렉토리를 찾으세요.** 유닛 파일의 `ExecStart=`는 **절대 경로**를 포함해야 하며, 명시적 `PATH`에는 데몬 세션에 필요한 도구(`gh`, `git`, `npm` 및 스크립트 기반 `qwen` 런처가 사용하는 `node` 인터프리터)의 신뢰할 수 있는 디렉토리가 포함되어야 합니다. 서비스 관리자는 셸 프로필을 읽지 않습니다. 일반 셸에서 `which qwen gh git npm node`를 실행한 다음, 아래 템플릿에서 `/PATH/TO/qwen`과 `/PATH/TO/USER/BIN`으로 표시된 곳에 실제 실행 파일과 디렉토리로 대체하세요.

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code daemon (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# 프로젝트로 대체하세요. %h는 사용자 유닛에서 $HOME으로 확장됩니다.
WorkingDirectory=%h/project-a
# `which qwen`을 실행하여 절대 경로를 확인하세요. systemd는 $PATH를 읽지 않습니다.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170 --workspace %h/project-a --workspace %h/project-b
# 첫 번째 항목을 qwen의 인터프리터와 사용자가 설치한 도구가 포함된
# 신뢰할 수 있는 디렉토리로 대체하세요. systemd는 셸 프로필을 읽지 않습니다.
Environment=PATH=/PATH/TO/USER/BIN:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
# 유닛에 인라인으로 삽입하는 대신 chmod 600 파일에서 bearer token을 읽습니다.
# `Environment=`는 유닛 파일에서 token을 노출합니다
# (일반적으로 644 = 모든 사용자 읽기 가능). EnvironmentFile은 token을
# `chmod 600`으로 이미 생성한 사용자 소유 시크릿 파일에 보관합니다.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

env 파일을 한 번 생성하세요(설정 단계의 token 파일은 원시 값을 보관합니다. 이 파일은 systemd가 env 할당으로 읽을 수 있도록 `KEY=value` 형식으로 감쌉니다):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

관리:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # 로그아웃 후에도 / 재부팅 시에도 사용자 관리자를 계속 실행
journalctl --user -u qwen-serve -f               # 로그 추적
systemctl --user restart qwen-serve.service     # token 순환 후
systemctl --user disable --now qwen-serve.service
```

`loginctl enable-linger` 없이는 사용자 수준 systemd 인스턴스가 사용자가 로그아웃할 때 종료되고 다음 로그인 시에만 재시작됩니다 — 헤드리스 개발 박스에서는 SSH 세션이 종료될 때 데몬이 생존하지 못합니다. `enable-linger`가 "재부팅 후에도" 실제로 작동하게 합니다.

**시스템 전체 대안**(공유 개발 호스트, 덜 일반적): 유닛을 `/etc/systemd/system/qwen-serve@.service`에 `User=%i`와 함께 배치하고, `sudo systemctl enable --now qwen-serve@<username>.service`로 관리합니다. 그 외에는 동일한 `[Service]` 본문을 사용합니다. 민감하지 않은 `PATH`는 `Environment=`에 그대로 둘 수 있지만, bearer token은 절대 여기에 넣지 마세요. 사용자의 `chmod 600` 파일을 가리키는 `EnvironmentFile=`을 사용하세요. 단일 사용자 워크스테이션에는 사용자 수준 + linger를 선택하세요.

## macOS: launchd 사용자 에이전트

> **먼저 `qwen` 바이너리와 신뢰할 수 있는 도구 디렉토리를 찾으세요.** systemd와 동일한 제약입니다. `ProgramArguments`는 **절대 경로**를 포함해야 하며, `EnvironmentVariables.PATH`에는 데몬 세션에 필요한 도구가 포함된 신뢰할 수 있는 디렉토리가 포함되어야 합니다. 일반 셸에서 `which qwen gh git npm node`를 실행하세요. macOS의 일반적인 위치는 `/opt/homebrew/bin`(Apple Silicon의 Homebrew), `/usr/local/bin`(Intel의 Homebrew 및 수동 설치), `~/.nvm/versions/node/vX.Y.Z/bin`(nvm), `~/.volta/bin`(Volta)입니다. 아래 실제 절대 경로로 대체하세요. launchd는 `~`나 셸 변수를 확장하지 않습니다.

`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- `which qwen`을 실행하여 절대 경로를 확인하세요. launchd는 $PATH를 읽지 않습니다. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
    <string>--workspace</string>
    <string>/Users/YOUR-USERNAME/project-a</string>
    <string>--workspace</string>
    <string>/Users/YOUR-USERNAME/project-b</string>
  </array>
  <!-- launchd는 `~` 또는 `$HOME`을 확장하지 않습니다 — 절대 경로를 사용하세요. -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/project-a</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- launchd는 셸 프로필을 읽지 않습니다. 첫 번째 항목을
         qwen의 인터프리터와 사용자 도구가 포함된 신뢰할 수 있는
         디렉토리로 대체하세요. -->
    <key>PATH</key>
    <string>/PATH/TO/USER/BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <!-- 이 파일에 실제 token을 포함하여 커밋하지 마세요. 또한
         plist 자체를 chmod 600으로 설정하여 인라인 token이
         모든 사용자에게 읽히지 않도록 하세요. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- 0이 아닌 종료 시에만 재시작(systemd Restart=on-failure와 일치).
       단순 `<true/>`는 정리 SIGTERM 후에도 재시작하여
       `kill <pid>`를 중지 신호로 사용할 수 없게 만듭니다 —
       운영자가 `launchctl unload`를 사용해야 합니다.
       SuccessfulExit=false가 이를 해결합니다. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- 지속적 실패 시 재시작 폭풍 제한(systemd
       RestartSec=5를 미러링. launchd의 기본값은 매 <1초마다 재시작). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- /tmp가 아닌 사용자의 Library에 로그를 기록합니다. /tmp는
       모든 사용자가 쓸 수 있으며(공유 워크스테이션에서 심볼릭 링크 공격 위험),
       periodic-daily에 의해 3일 후 정리됩니다.
       `~/Library/Logs/qwen-serve/`는 사용자 범위에 속하며 생존합니다.
       launchd는 매 `load` 시 이러한 파일을 자릅니다.
       따라서 unload→load token 순환 사이클은 이전 진단 로그를 삭제합니다 —
       사후 조사가 필요하면 백업하세요. -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

관리:

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # 처음만
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist가 인라인 token을 보관
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # 중지 시
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

plist를 편집한 후(예: token 순환) 반드시 `unload`한 다음 다시 `load`해야 합니다 — `launchctl`은 `systemd daemon-reload`와 달리 plist 변경 시 자동으로 다시 로드하지 않습니다. 참고: 각 `load`는 로그 파일을 자르므로 순환 전에 사고를 조사 중이라면 저장해 두세요.

어느 쪽이든 서비스를 시작하거나 재시작한 후, 새 데몬 세션을 열고 명령 내부에서 `PATH`를 변경하지 않고도 필요한 도구가 해결되는지 확인하세요(예: `command -v gh`). 도구가 누락되어 있으면 해당 도구의 신뢰할 수 있는 절대 디렉토리를 서비스 수준의 `PATH`에 추가하고 서비스를 다시 로드하세요. `~/.zshrc`, `~/.bashrc` 또는 다른 대화형 셸 프로필에 의존하지 마세요.

## tmux 세션 (대화형 감독)

`QWEN_SERVER_TOKEN`이 셸에 이미 export되어 있다고 가정합니다(위 설정 섹션 참조):

```bash
tmux new -d -s qwen-serve "qwen serve --hostname 127.0.0.1 --workspace /absolute/path/project-a --workspace /absolute/path/project-b"
tmux attach -t qwen-serve   # 실시간 로그 확인. Ctrl-b d로 분리
tmux kill-session -t qwen-serve
```

`tmux new -d`는 부모 셸의 환경을 상속하므로 `QWEN_SERVER_TOKEN`이 자동으로 전달됩니다. 서비스 유닛에 커밋하지 않고도 데몬의 stdout(인증 경고, MCP 검색 진행, 느린 클라이언트 경고)을 가끔 관찰하고 싶을 때 적합합니다. 터미널 종료는 생존하지만 호스트 재부팅은 생존하지 않습니다.

## nohup 한 줄 명령 (빠르고 간단한 방법)

`QWEN_SERVER_TOKEN`이 셸에 이미 export되어 있다고 가정합니다:

```bash
nohup qwen serve --hostname 127.0.0.1 \
  --workspace /absolute/path/project-a \
  --workspace /absolute/path/project-b \
  > qwen-serve.log 2>&1 &
echo $!  # 데몬 PID. 나중에 깔끔하게 `kill`하려면 캡처해 두세요
```

명시적 절대 `--workspace` 값은 데몬이 셸의 현재 디렉토리에 독립적으로 유지되게 합니다. 클라이언트는 광고된 `capabilities.workspaces[]` 항목 중 하나를 선택하고 세션을 생성할 때 해당 cwd를 전달해야 합니다.

일회성 "백그라운드에서 실행하면서 API를 시험해 보자" 워크플로우에 적합합니다. 단일 세션 이상에는 **권장하지 않습니다** — 충돌 시 재시작 없음, 로그 파일이 무한히 증가, PID를 잊어버리면 데몬을 찾을 방법이 없습니다. 대화형 감독에는 tmux를, 재부팅을 넘겨야 하는 경우 systemd / launchd를 사용하세요.

## 데몬 동작 확인

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # 데몬의 기능 세트
```

인증이 구성된 경우(`--token` 또는 `QWEN_SERVER_TOKEN`), 일반 loopback 바인드에서 `/health`를 제외한 모든 일반 API 경로는 `Authorization: Bearer <token>`을 요구합니다. 채널 webhook 수신은 항상 구성된 `x-qwen-webhook-secret`을 사용하며, Web Shell 문서 및 에셋 경로는 사전 인증 상태로 유지됩니다. `--require-auth=true`는 부팅 시 token을 요구하며, webhook 인증을 변경하지 않고 loopback `/health`를 bearer 게이트 뒤로 이동시킵니다. loopback 기본값에서 token 없이 데몬을 시작한 경우(`qwen serve` zero-config 경로), 두 호출 모두 헤더를 필요로 하지 않으며, 기본 리스너에 도달할 수 있는 모든 로컬 프로세스는 데몬 사용자로 코드 실행을 포함한 전체 운영자 API 권한을 가집니다. 위 템플릿은 모두 token을 구성하므로 실제로는 `Authorization` 헤더가 필요합니다. `/capabilities`가 `401`을 반환하면 유닛 / plist의 token이 `curl`이 사용하는 env-exported token과 일치하지 않는 것입니다.

## Token 순환

1. 새 token을 생성하고 유닛이 참조하는 env 파일을 작성합니다:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (launchd / nohup / tmux 템플릿의 경우: plist의 `<string>` 값을 편집하거나 `QWEN_SERVER_TOKEN`을 다시 `export`하세요. 재생성하는 경우 plist에 `chmod 600`을 적용하는 것을 잊지 마세요.)
2. 데몬을 재시작합니다:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>` 후 env에 새 token으로 재실행
3. 클라이언트 SDK / 스크립트를 업데이트합니다. TypeScript SDK의 `DaemonClient`는 `QWEN_SERVER_TOKEN`을 자동으로 읽습니다(PR 27 fallback) — 클라이언트 셸에서 새 값을 다시 `export`하고 클라이언트를 재생성하세요.

## 재시작 및 충돌 동작

서비스 관리자의 재시작 의미는 템플릿마다 다릅니다:

- **systemd `Restart=on-failure`** — 0이 아닌 종료 / 시그널에서만 재시작. 정리 SIGTERM(`systemctl stop`)은 재시작 루프를 트리거하지 **않습니다**.
- **launchd `KeepAlive` with `SuccessfulExit=false`**(위 템플릿) — systemd 동작과 일치. 단순 `<true/>`는 정리 종료 후에도 재시작합니다. `ThrottleInterval=10`은 지속적 실패 시 재시작 폭풍을 속도 제한하며, systemd의 `RestartSec=5`를 미러링합니다.
- **tmux / nohup** — 자동 재시작 없음. 데몬 충돌 시 재실행할 때까지 죽은 PID로 남습니다.

**단일 데몬 프로세스 수명 내**에서 클라이언트 연결 끊김은 사용자 가이드의 [내구성 모델](./qwen-serve.md#durability-model) 섹션에 따라 SSE `Last-Event-ID` 재개로 복구됩니다 — 리플레이 링은 인메모리입니다.

데몬 **재시작** 시 모든 인메모리 세션이 유실됩니다. 클라이언트는 다시 연결하고 새로 시작합니다. 세션 콘텐츠(프롬프트, 도구 호출, 대화 기록)의 교차 재시작 내구성은 v0.16-alpha에 **포함되지 않습니다**.

## 범위 제외 (v0.16.x 이상으로 연기)

- **컨테이너화 배포** — Dockerfile, docker-compose, Kubernetes 매니페스트, nginx + TLS 리버스 프록시, 다중 인스턴스 token 격리. 엔터프라이즈 파일럿이 확정되면 v0.16.x로 연기됩니다. 아무도 검증하지 않으면 문서가 부패하기 때문입니다.
- **교차 호스트 페더레이션 / 한 호스트에서 다중 데몬 조정** — 하나의 데몬이 여러 등록된 작업 공간 런타임을 호스팅할 수 있지만 데몬 간 조정은 없습니다. 인스턴스 경로 token 키잉 + 오래된 token 정리는 v0.16.x로 연기됩니다.
- **일반 데몬 token 저장** — Local Control은 취소 가능한 데몬 소유 페어링 token을 사용하지만, 장기 실행 런타임 token 저장은 BYO-token으로 유지됩니다. 영구 token 저장소 인프라는 v0.16.x로 연기됩니다.
- **Windows 네이티브 서비스**(`nssm`, Service Control Manager 래퍼) — 지금은 [WSL2](https://learn.microsoft.com/en-us/windows/wsl/)를 사용하고 위 systemd 섹션을 따르세요.

전체 연기된 기능 목록에 대해서는 메인 사용자 가이드의 [v0.16-alpha 알려진 제한](./qwen-serve.md#v016-alpha-known-limits) 콜아웃을 참조하고, v0.16-alpha 롤아웃 추적 이슈에 대해서는 [#4175](https://github.com/QwenLM/qwen-code/issues/4175)를 참조하세요.
