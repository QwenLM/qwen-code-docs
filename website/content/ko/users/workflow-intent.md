# 한 턴에 대한 워크플로우 요청


`tools.workflowsEnabled`가 활성화된 상태에서, 인간 제출에 `ultracode` 또는 기존
`workflow` 키워드를 포함하면 해당 턴에 Workflow 도구를 사용하도록 제안합니다. 예를 들어: `ultracode: audit these three modules`.
모델이 워크플로우가 요청에 적합한지 판단합니다. 키워드가 워크플로우를 시작하거나, 권한을 변경하거나, 모델을 선택하거나, 노력 수준을 변경하지는 않습니다.

Ink 및 OpenTUI의 터미널 입력, IDE 컴포저 입력, Web Shell 컴포저 입력이 이 리마인더를 지원합니다. 리마인더는 표시되는 메시지와 별도로 모델 요청에 추가됩니다. 다음 일반 제출은 이를 상속하지 않습니다.
도구 계속 실행 및 자동 재시도는 이를 다시 추가하지 않습니다.
컴포저에 붙여넣은 텍스트는 인간 입력으로 간주됩니다; 첨부 파일 확장 및 Hook이 추가한 컨텍스트는 그렇지 않습니다.

리콜된 히스토리 및 Ink Vim 레지스터 붙여넣기는 버퍼를 지우거나 Vim을 비활성화한 후에도 알 수 없는 입력으로 남아 있습니다. 새 Vim 삽입 모드 입력은 여전히 리마인더를 활성화할 수 있습니다.

`ultracode`는 완전한 인용/코드 스팬 및 `ultracode.js`, `x-ultracode`, `ultracode/file`과 같은 경로 유사 토큰을 무시합니다. 기존 `workflow`
호환성 규칙은 `(workflow)`와 같은 독립적인 공백으로 구분된 단어와 가장자리 구두점을 허용하지만, `workflows`나 `my-workflow-runner`는 허용하지 않습니다.
두 키워드가 모두 나타날 때, 하나의 리마인더만 추가됩니다.

일반 `qwen -p`, 일반 stdin, 예약된 입력 및 SDK 문자열 프롬프트는 자동으로 옵트인하지 않습니다. TypeScript SDK 스트리밍 입력은 각 원래 인간 메시지를 명시적으로 식별할 수 있습니다:

```ts
import { query, type SDKUserMessage } from ' @qwen-code/sdk';

async function* messages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: crypto.randomUUID(),
    parent_tool_use_id: null,
    origin: { kind: 'human' },
    message: { role: 'user', content: 'ultracode: inspect the modules' },
  };
}

for await (const event of query({ prompt: messages() })) {
  console.log(event);
}
```

애플리케이션 생성 컨텍스트, 자동화, 도구 결과 및 히스토리 리플레이에 대해서는 `origin`을 생략하십시오. 누락되거나 잘못된 origin은 키워드 리마인더 없이 일반 채팅을 계속 작동하게 합니다. 이 선언은 도구 권한을 부여하지 않습니다.
ACP 클라이언트는 기존 요청별 `_meta['qwen.submittedPrompt']`
선언을 원래 인간 텍스트에 사용할 수 있습니다; 데몬 전용 메타데이터는 예약된 상태로 유지됩니다.

`ui.disableWorkflowKeywordTrigger`를 `true`로 설정하여 이러한 진입점에서 두 키워드를 모두 비활성화합니다. 터미널 설정 대화상자에서 이것은
**Disable Workflow Keyword Trigger**이며 새 제출에 대해 적용됩니다.
리마인더는 워크플로우 또는 필수 도구 표면이 사용 불가능할 때도 생략됩니다. 이름 전용 워크플로우 세션은 `{ name, args }`와 함께 저장된 워크플로우만 제안하며; 스크립트 작성을 제안하지 않습니다.