# 실험적 Mods

Qwen Code는 헤드리스 세션에서 Claude Code Mod API의 작은 하위 집합을 실행할 수 있습니다.
이 기능은 옵트인이며 신뢰할 수 있는 워크스페이스와 활성화된 Claude 또는
네이티브 Qwen 확장이 필요합니다. Agent Plugins v1 패키지는 계속 hook을 무시합니다.

다음 설정을 Qwen 설정에 추가하세요:

```json
{
  "experimental": { "mods": true }
}
```

다음 파일들을 포함한 플러그인 디렉토리를 생성하세요:

```text
hello-mod/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.js
```

`.claude-plugin/plugin.json`:

```json
{ "name": "hello-mod", "version": "1.0.0" }
```

`hooks/hooks.json` (모듈 경로는 이 파일 기준 상대 경로):

```json
{ "modules": ["./register.js"] }
```

`hooks/register.js`:

```javascript
let calls = 0;

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hello',
      description: 'Say hello without a model request',
    });
    return next(e);
  });

  on('command.run', { command: 'hello' }, ($, e) => ({
    text: `Hello ${e.args || 'world'}! Call ${++calls}.`,
  }));

  on('session.end', ($, e, next) => {
    $.ui.log(`Finished ${e.sessionId}`, { to: 'debug' });
    return next(e);
  });
}
```

플러그인을 설치하고 명령어를 실행하세요:

```bash
qwen extensions install ./hello-mod --consent
qwen -p '/hello Qwen' --output-format json
```

시작 시 일반 CLI 인증 설정이 여전히 필요합니다. Mod
명령어 자체는 모델 요청을 하지 않습니다. Text, JSON, stream-json 헤드리스 출력
형식이 지원됩니다. stream-json 프로세스는 턴 간에 모듈 변수를 유지합니다.

## 지원되는 하위 집합

| 표면    | 동작                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 패키징  | 설치된 플러그인 내에서 하나의 `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` 또는 `.cts` ESM 엔트리; 상대적 정적 임포트 및 리_exports                                                        |
| 엔트리      | `register(on, options)`; 비동기 등록이 대기됨; 타입이 지정된 비-secret 옵션이 복사되고 깊이 고정됨                                                                           |
| 라이프사이클  | 모든 모듈이 초기 `session.start` 체인 전에 등록됨; 종료 및 대화 교체 시 `session.end`; clear/resume은 모듈을 다시 로드하지 않음                                   |
| 명령어   | `session.start` 중에 name, description 및 선택적 argumentHint를 사용하여 등록; 플러그인 간에 등록된 Mod 명령어를 가로챔; `{text}` 또는 `{}`를 반환                            |
| 도구      | `tool.call`로 기존 메인 세션 도구를 가로챔; `tool.check`로 네이티브 권한 결정을 검사하고 제한함                                                              |
| 미들웨어 | 패턴 및 재귀 매처; 명시적이고 반복 가능한 `next(e)`; `.catch` 및 플러그인별 장애 복구; 고정된 입력 및 호스트 아이덴티티                                               |
| API 이벤트 | `command.register` 및 `ui.log` 호출은 호스트 제공 origin과 함께 미들웨어 체인을 통과함                                                                                       |
| 로깅    | `$.ui.log`는 void를 반환하고 전달을 큐에 추가함; 트랜스크립트 로그는 텍스트 모드에서 stderr를 사용하거나 JSON 모드에서 `system/ui_log`를 사용; 디버그 로그는 디버그 로거에 유지됨; 둘 다 모델 입력이 되지 않음 |
| 격리  | 세션 워커 내 플러그인당 별도의 QuickJS 환경; Node, 파일시스템 또는 네트워크 API 없음; 메모리, 스택, 소스/출력 및 실행 제한                                 |

이것은 지원되는 하위 집합이며 기존 Claude Mods와의 완전한 호환성이 아닙니다.
JSX/TSX, 런타임 패키지 임포트, 내장 명령어 가로채기, 도구 등록 및 활성 `$.tool` API, 컨텍스트,
state/store, 렌더링, 스트리밍 이벤트 및 핫 리로드는 구현되지 않았습니다.
명령어는 아직 `context`, `exitCode` 또는 엔진 참조를 반환할 수 없습니다.

두 개의 Mod가 동일한 명령어 이름을 등록할 수 없습니다: 나중 등록은 거부됩니다.
Qwen 내장 명령어와의 충돌은 여전히 Qwen의 명령어 충돌 정책을 사용합니다:
확장 명령어는 `extensionName.commandName`으로 이름이 변경됩니다. 비활성화된 슬래시
명령어 이름은 결과 이름에 대해 매칭됩니다.

## 미들웨어 및 복구

패턴은 `session.start`, `session.end`, `command.run`,
`command.register`, `ui.log`, `tool.call`, `tool.check` 중에서 선택합니다. 정확한 이름, `command.*`와 같은 접두사,
`*`, 또는 `!session.*`과 같은 단일 부정을 사용합니다. 다른 구체적 이벤트 및
`!*`와 `!!...` 패턴은 거부됩니다.

매처는 부분 객체입니다. 지정된 모든 필드가 일치해야 하며, 배열은
대안이고, 중첩된 객체는 자체 필드에 대해 매칭되며, 정규식은
필드의 문자열 표현을 테스트합니다. 매처는 등록 중에 복사됩니다.
최대 8단계와 256개의 노드를 허용합니다. 상태 저장 `g`/`y` 정규식과 중첩
수량자는 거부됩니다; 65,536자보다 긴 정규식 입력은 보수적으로 매칭하여
결정을 hook에 맡깁니다. 중첩된 객체는 데이터이며
`startsWith`와 같은 연산자가 아닙니다.

정확한 이벤트는 매처 없는 등록 하나와 매처가 있는 여러 개의
등록을 가질 수 있으며, 동일한 매처도 포함됩니다. 각 와일드카드 또는 부정된
패턴은 한 번만 등록할 수 있습니다. 플러그인 내에서 등록 순서가
체인을 결정합니다; 소비자는 선언된 의존성 제공자 전에 실행됩니다. 핸들러는
일찍 응답할 수 있으며, `session.start`에서도 가능합니다. 나중 핸들러가 실행되는 것을 방지합니다. `command.run`에서는 명령어 `args`만 재작성할 수 있습니다; 라이프사이클 및
명령어 아이덴티티 필드는 고정된 상태로 유지됩니다.

## 도구 가로채기

`tool.call`은 Qwen 도구의 인수를 `tool` 및 `tool_use_id`와 함께
플랫 필드로 받습니다. 이름, 인수 스키마 및 출력 레코드는 Qwen의 네이티브
계약을 사용하므로 Claude의 내장 도구를 위해 작성된 Mod는 적응이 필요할 수 있습니다.
별도의 `tool.result` 이벤트는 없습니다; `await next(e)`가 반환하는 값을 검사하거나
변경하세요:

```javascript
export function register(on) {
  on('tool.call', { tool: 'write_file' }, async ($, e, next) => {
    if (!e.file_path.endsWith('.txt'))
      return { deny: 'Only text files are allowed' };
    return next({ ...e, content: e.content.trim() });
  });

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e);
    if (e.tool === 'run_shell_command') {
      return { decision: 'deny', reason: 'Shell is disabled by this Mod' };
    }
    return verdict;
  });
}
```

모든 일반 `tool.call` next는 새로운 네이티브 도구 시도를 시작합니다: 검증,
클래식 hook, 권한, 승인 및 호출 가드가 모두 여전히 적용됩니다.
추가 시도는 `--max-tool-calls`에 대해 계산됩니다; catch 리플레이는 시도를 추가하지 않습니다.
도구 미들웨어가 있는 세션은 도구 호출을 직렬화합니다. 병렬
next 호출도 포함되며, 재작성된 인수가 부작용을 도입할 수 있기 때문입니다. 하나의 루트
호출은 최대 64개의 네이티브 시도와 32개의 미결 호스트 작업을 허용합니다.
60초 루트 제한은 네이티브 실행과 승인을 기다리는 데 소요된 시간을 포함합니다.
미결 next가 완료되기 전에 반환하면 해당 작업이 취소되고
완료될 때까지 대기합니다.

`tool.check`는 네이티브 검증 및 클래식 입력 재작성 후에 `{tool, input, tool_use_id}`를 받습니다.
모든 필드는 고정됩니다. next는 도구를 실행하지 않고 선언적
`{decision: 'allow' | 'ask' | 'deny', reason?}`를 반환합니다.
Qwen은 답변을 제한적으로 병합합니다: Mod는 네이티브 deny 또는 ask를 allow로
업그레이드할 수 없습니다. Mod ask는 현재 승인 모드의 기존 결정
흐름을 따릅니다; 필요한 인간 상호작용 및 클래식 강제 ask는 여전히 권위적입니다.
이것은 의도적으로 Claude의 소비자 권한 재정보다 더 엄격합니다.
네이티브 PermissionRequest hook이 인수를 재구성하면 다시 확인됩니다.
Mod가 작성한 `rule`, `hook` 또는 `ceiling`은 호스트 권한을 생성할 수 없습니다.

차단하려면 `{deny: reason}`을 반환하거나, 실행 없이 JSON 결과를 제공하려면
`{result: value}`를 반환하세요. 네이티브 next는 `{ref, result, text, isError?}`를 반환합니다.
`result`는 네이티브 함수 응답 레코드이며, 일반적으로 `{output: ...}` 또는
`{error: ...}`입니다. 변경되지 않은 결과를 가진 반환된 ref는 이미지 및 출력 메타데이터를 포함한
원본 출력을 유지합니다; 해당 참조 옆의 text 또는 error 플래그를 변경해도
변경되지 않습니다. 호스트 실행 팩트는 이전 결과가 선택된 경우에도
모든 시도에 걸쳐 유지됩니다. 출력을 변경하려면
새 결과를 반환하세요: `{result: {output: 'Replacement text'}}`. 문자열 `output`/`error` 필드만 포함하는 레코드는 해당 형태를 유지합니다; 다른 JSON은 완전히 직렬화되어
`output` 문자열로 저장되므로 네이티브 출력 버udget이 여전히 적용됩니다. 호스트가 함수 응답을 소유합니다: JSON은 ID, 미디어 파트 또는 실행 팩트로 해석되지 않습니다.
알 수 없는 ref 및 `isReadOnly` 클레임은 출처를 부여하지 않습니다. Mod 페이로드에 비해 너무 큰 결과는 생략 알림과 ref를 포함합니다; 해당 쌍을 변경하지 않고 반환하면 완전한 네이티브 응답이 보존됩니다.

네이티브 오류, 승인 요구 사항 및 취소는 Mod 결과를 변경하여
성공적인 실행으로 전환할 수 없습니다. next 이후의 거부는 도구의 효과를
되돌릴 수 없습니다: Qwen은 도구가 이미 실행되었음을 보고합니다. 이전 시도가 실행되었고
나중 시도가 거부된 경우에도 동일하게 적용됩니다. 컨텍스트 주입 및 요청 메타데이터는 지원되지 않습니다.

도구 아이덴티티, 호출 ID, 동의 및 호스트 메타데이터는 고정됩니다. `tool`, `tool_use_id`, `agentId`, `consent`,
`requestMeta` 또는 `$shadowed`와 충돌하는 네이티브 인수 이름은 호스트가 생성한 고정된 `$shadowed`
레코드에 보존되고 실행을 위해 복원됩니다. 유효한 지연된 `tool_call` 요청은
래퍼의 네이티브 권한 게이트를 유지하면서 확인된 대상의 이름과 인수를 노출합니다.
잘못된 래퍼, 알 수 없는 도구, 고정 정책 호출 및 합성 `structured_output` 터미널 도구는 원래 경로를 유지합니다.
`tool_search` 및 `search_memory`도 네이티브로 유지되므로 게스트가 작성한 결과는 네이티브 출력 버udget 면제를 상속할 수 없습니다.
Goal 도구 호출도 네이티브 경로를 유지합니다: 이 단계에서는 Mod가 작성한 결과가 Goal의 카탈로그에 외부 증거로 진입하는 것을 허용하지 않습니다.
하위 에이전트 및 중첩된 코드 모드 스케줄러는 이 미들웨어를 상속하지 않습니다.

## 명령어 복구

```javascript
export function register(on) {
  on('command.run', { command: /^hello/ }, async ($, e, next) => {
    const result = await next({ ...e, args: e.args.trim() });
    return { text: `[wrapped] ${result.text || ''}` };
  }).catch(($, e, next) => next(e));
}
```

일반 `next`는 모든 호출에서 다운스트림을 실행합니다. 플러그인의 등록은
하나의 레이어를 형성하며, 장애 레코드와 시간 버budget을 공유합니다. throw, 타임아웃 또는
잘못된 결과 시, catch가 정의되지 않은 답변을 반환하거나 `next`를 호출할 때까지 등록 순서대로 시도됩니다. undefined를 반환하거나 `next`를 호출하지 않고 throw하는 catch는 다음 매칭 catch가 실행되도록 허용합니다. Claude Code
2.1.296에서와 같이, 잘못된 답변 또는 `next` 이후의 장애는 catch 선택을 종료하고
공유 폴백 레코드를 사용합니다; 나중 catch를 시도하지 않습니다. catch의 `next.called`는
플러그인이 복구가 시작되기 전에 다음 플러그인으로 진입했음을 의미하며, 자체의 다른 등록으로만
진입한 것이 아닙니다.

플러그인이 이미 다운스트림을 호출한 경우, 복구는 마지막에 시작된 호출을 대기하고 리플레이하며,
해당 거부도 포함하며, 리플레이 인수는 무시합니다. 호출하지 않았었다면,
catch의 첫 `next`가 다운스트림을 한 번 실행하고 후속 호출은 이를 리플레이합니다.
실패한 catch는 동일한 레코드를 사용합니다. 성공적인 catch가 없으면 플러그인이
건너뛰어지거나 기록된 결과가 유지됩니다. 아무도 응답하지 않는 등록된 명령어는
명시적으로 실패합니다; 모델에게 전송되지 않습니다.

`next`는 `event`, `is(pattern)`, 고정된 `origin`, `signal`, 및 `ms`와 `remainingMs`가 포함된 새로운 고정
`budget` 스냅샷을 노출합니다. catch는 추가로 `called` 및 `error.kind`(`throw`, `timeout` 또는 `re-entry`)를 받습니다. 엔진 이벤트는 origin `{ plugin: 'engine', tier: 'core' }`를 사용합니다; Mod API 이벤트는 tier `user`로 호출 플러그인을 식별합니다. Managed-tier `next.to`, 추적 및 사용자 정의 네임스페이스 `lent`
복구는 사용할 수 없습니다.

API 이벤트는 체인 헤드에서 시작합니다. 입력은 명령어 사양 또는
`{text, to}` 로그 페이로드입니다. `next(e)`, 답변할 `{value}`, 또는 API 호출을 거부할 `{deny: reason}`을 반환하세요.
즉시 자체 재진입은 해당 등록을 건너뜁니다; 활성
조상 등록은 catch를 사용할 수 있습니다. Re-entry catch는 APIs를 호출할 수 없으며,
`next`는 원래 이벤트를 한 번 재사용합니다. `ui.log`는 void 알림으로 유지됩니다:
`await $.ui.log(...)`는 인터셉터를 대기하지 않습니다. 헤드리스 경계는 출력을 반환하기 전에
큐에 추가된 알림을 비웁니다.

일반 플러그인 레이어는 크로스 플러그인 `next` 또는 API 호출을 대기하는 시간을 제외한
자체 시간 10초를 가집니다. 대기 중인 void `ui.log` 알림은 호출자의 버budget을 일시 중지하지
않습니다. catch 및 재진입 복구는 1초 버budget을 사용합니다.
재진입 디스패치는 해당 플러그인의 다른 등록과 이 더 짧은 버budget을 공유합니다. Qwen은 추가로 각 루트 디스패치를 60초로, 각
방해받지 않은 게스트 실행 슬라이스를 10초로 제한합니다. 모든 `session.end` 작업은
1.5초를 공유합니다. 일찍 완료되는 외부 핸들러는 미결 다운스트림
작업을 포기합니다; 취소는 폴백 작업을 시작하지 않습니다. 유지된 next/API 함수는
호출이 종료된 후 작업을 수행할 수 없습니다. 250밀리초 내에 취소를 인정할 수 없는 워커는 종료되며, 새 세션이 필요합니다.

최대 32개의 Mod 환경, 64개의 등록된 명령어, 플러그인당 128개의 등록,
및 루트 호출당 4,096개의 루트/API 이벤트 체인이 있습니다. 다른 플러그인을 통과하는 것은
추가 이벤트를 소비하지 않습니다. 각 환경은 64 MiB
메모리 제한을 가집니다. 로그 및 메시지 페이로드도 제한됩니다. 등록, 컴파일레이션
및 설정 장애는 여전히 초기화를 거부합니다; 일반 hook 장애는 모듈 상태를 재설정하지 않고 복구할 수
있습니다. 게스트 promise 작업은 호스트 요청이 활성 상태인 동안에만 실행되며, 큐에 추가된 알림 드레인도 포함됩니다.

Mods는 이 버전에서 TUI, ACP, managed/SSH, 샌드박스 또는 세션 에이전트 진입점에서 실행되지 않습니다.
안전 모드, 베어 모드 및 `disableAllHooks`도 로딩을 방지합니다.
플러그인 코드, 옵션 또는 확장 활성화를 변경한 후 재시작하세요. 이미 로드된
명령어는 실행 전에 참여하는 모든 플러그인을 다시 확인하고 변경되거나
비활성화된 미들웨어 체인을 거부합니다. 외부 설정 편집은 재시작 후에 적용됩니다.
절대 또는 외부 hooks 매니페스트 경로를 가진 네이티브 Qwen 확장은 계속
클래식 hook 로더만 사용합니다. 변환이 이미 절대 경로 또는 확장 외부 때문에 무시하는 Claude hooks 경로도
Mod 검색에서 건너뜁니다. Mod 매니페스트는 확장 내부의 상대 경로여야 합니다.

## TypeScript 및 상대적 임포트

TypeScript를 사용하려면 hooks 엔트리를 `./register.ts`로 변경하세요. 임포트 및
리_exports는 상대 경로, 확장자 없는 경로, 디렉토리 `index` 파일,
또는 TypeScript 파일의 JavaScript 철자를 사용할 수 있습니다(`./helper.js`는 `helper.ts`로 해석될 수 있음).
정확한 파일이 우선합니다. 그 다음 `.js` → `.ts`, `.mjs` → `.mts`, 및
`.cjs` → `.cts` 치환이 오고, `.ts`, `.js`, `.mjs`, `.cjs`, `.mts`,
`.cts` 후보가 뒤따르며, 각 파일을 시도한 다음 디렉토리 인덱스를 시도합니다. 여섯 개의
모든 접미사는 `.cjs`와 `.cts`를 포함하여 ESM을 사용합니다. 모듈 사이클 및 하나의 플러그인 내에서 공유되는 임포트된
상태가 지원됩니다.

컴파일레이션은 취소 가능한 워커 내에서 고정 옵션을 사용합니다; 타입 검사를 하지 않으며
`tsconfig.json`, 패키지 리졸버 또는 빌드 플러그인을 로드하지 않습니다. Type-only
임포트는 `claude-code`의 타입을 포함하여 지워집니다. `claude-code`에서의 런타임 값 임포트는
이 하위 집합 외부의 API가 필요하며 거부됩니다. 패키지/Node/URL 임포트, 동적 임포트, `require`, JSX 및 임포트된 최상위
`await`도 거부됩니다. 게스트 코드는 계속 QuickJS에서만 실행됩니다.

## 플러그인 옵션

플러그인 매니페스트에 `userConfig`를 선언하세요:

```json
{
  "name": "hello-mod",
  "version": "1.0.0",
  "userConfig": {
    "greeting": {
      "type": "string",
      "title": "Greeting",
      "description": "Greeting used by /hello",
      "default": "Hello"
    }
  }
}
```

사용자 또는 시스템 설정에서 옵션을 설정한 다음 `register`의 두 번째 인수에서 `options.greeting`을 읽으세요:

```json
{
  "experimental": { "mods": true },
  "pluginConfigs": {
    "hello-mod": { "options": { "greeting": "Welcome" } }
  }
}
```

필드에는 `type`, `title` 및 `description`이 필요합니다. 지원되는 타입은 `string`,
`number`, `boolean`, `directory` 및 `file`입니다. 선택적 제약 조건에는 `required`, `default`, 숫자 `min`/`max`, 문자열 `multiple` 및 문자열
`options` 선택이 포함됩니다. 파일 및 디렉토리 값은 문자열이며, 존재
확인이나 추가된 파일시스템 접근은 없습니다. `sensitive: true`는 명시적으로 지원되지 않으며,
기본값이 제공되는 경우에도 마찬가지입니다; secret 저장소 또는 설정 UI가 없습니다.

Qwen은 SystemDefaults → User → System 우선 순위를 사용하며, 개별 옵션
키를 병합합니다. 워크스페이스 설정은 신뢰할 수 있는 워크스페이스에서도 무시됩니다. Qwen은
마켓플레이스 출처가 없는 확장을 인라인 아이덴티티에 매핑합니다. `name` 및 `name @inline`을 허용하며; 후자가 각 설정 소스 내에서 우선합니다.
마켓플레이스 플러그인은 실제 `name @marketplace` 아이덴티티를 사용합니다. 더 높은
우선 순위 소스가 더 낮은 우선 순위 소스의 로컬 별칭보다 우선합니다.

검사된 Claude 구현에서와 같이, 누락된 선택적 값은 기본값이 없는 한 `''`이 됩니다; 선택적 `''`도 타입 검사를 우회합니다. 필수
값은 누락되거나 `''`을 거부하며, `false`와 `0`은 유효하게 유지됩니다. 잘못된 저장된
문자열 선택은 기본값으로 폴백합니다. 비어있지 않은 스키마가 있으면 알 수 없는 옵션
키도 통과하며, 문자열, 숫자, 부울 또는 문자열 배열로 제한됩니다.
비어있거나 빈 스키마는 `{}`를 받습니다. 옵션은 재시작까지 고정된 상태로 유지됩니다.

## 설치된 의존성

매니페스트 `dependencies`는 플러그인 이름, `name @marketplace`, 또는 `{ "name": "base", "marketplace": "team", "version": "^1.0.0" }`과 같은 객체를 허용합니다.
bare 이름은 소비자의 마켓플레이스를 참조합니다. 동일한 이름을 가진 설치된 인라인 플러그인은 버전 확인 없이 마켓플레이스 의존성을 재정의할 수 있습니다.
그렇지 않으면, 버전 범위가 설치된 확장의
매니페스트 버전에 대해 확인됩니다. Mods가 없는 일반 확장이 의존성을 충족할 수 있습니다.
선택된 Mod에서 도달 가능한 경우 추이적 의존성이 확인됩니다; 관련 없는 일반 확장의 의존성 선언은 참여하지 않습니다.

의존성은 이미 설치, 활성화 및 선택되어 있어야 합니다.
Qwen은 자동으로 가져오기, 설치 또는 활성화를 하지 않습니다. 선택된 Mods는
Mods 간의 직접 의존성에 대해 안정적인 소비자-우선-의존성 순서로 등록됩니다; 일반 제공자는 등록 노드가 아닙니다. 각 Mod는 별도의 영역을 가집니다; 이벤트가 이 순서로 핸들러를 통과하여 모듈 변수를 공유하지 않고 크로스 플러그인 가로채기를 허용합니다.

누락, 모호, 호환되지 않거나 순환적인 의존성은 어떤 Mod 워커도 시작되기 전에 시작을 거부합니다.
잘못된 Mod 옵션도 시작을 거부합니다. 이것은 Claude의 선택적 의존성 강등 및 순서 폴백과 다릅니다; Qwen은 실험적 하위 집합의 전체 세션 시작 실패 정책을 유지합니다.

## 리소스 제한

리더는 설치된 확장 내부에서 최대 256 KiB의 일반 파일을 수락하며
해당 루트 내의 심볼릭 링크를 거부합니다. 그래프는 64개의 파일, 1 MiB의 입력 및 1 MiB의 컴파일된 코드로 제한됩니다. 이러한 경계와 심볼릭 링크 거부는
Claude보다 더 엄격합니다. 각 게스트는 64 MiB 메모리 제한과 1 MiB 스택 제한을 가집니다.
위에서 설명한 실행 버budget에는 모든 워커 초기화, 컴파일레이션 및 시작 hook을 포함한 60초 시작 제한이 포함됩니다. 게스트 메모리 제한은 컴파일러의 호스트 메모리를 포함하지 않습니다.

작성자 API는 Claude Code 2.1.296 선언 및 [공식 Mod 문서](https://code.claude.com/docs/en/plugins/mods/create)를 기반으로 합니다.