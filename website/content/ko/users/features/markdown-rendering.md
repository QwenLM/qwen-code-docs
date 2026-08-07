# Markdown 렌더링

Qwen Code는 일반적인 Markdown 구조를 TUI에서 직접 렌더링하여 모델 답변을 터미널을 떠나지 않고도 더 쉽게 스캔할 수 있습니다. 렌더러는 원본 소스에 접근할 수 있도록 설계되었으며, 특히 Mermaid 다이어그램 및 LaTeX 수학 블록과 같은 시각적 블록에 대해 그렇습니다.

## 렌더 및 원시 모드

기본적으로 Markdown은 `render` 모드로 표시됩니다. 지원되는 블록은 가능한 경우 시각적 미리보기로 렌더링됩니다:

- Mermaid 펜스 코드 블록
- Markdown 테이블
- 작업 목록
- 인용구
- 인라인 및 블록 LaTeX 수학
- 구문 강조가 적용된 펜스 코드 블록

`Alt/Option+M`을 눌러 현재 세션의 모드를 토글하세요. macOS에서는 터미널이 Option을 Meta로 전송해야 이 단축키가 작동합니다; 그렇지 않으면 Option+M은 일반 텍스트 입력으로 처리됩니다.

- `render`: 지원되는 Markdown에 대한 풍부한 터미널 미리보기를 표시합니다.
- `raw`: Mermaid, 테이블 및 LaTeX와 같은 시각적 블록에 대한 소스 지향 Markdown을 표시합니다.

기본적으로 원시 모드에서 Qwen Code를 시작하려면 `ui.renderMode`를 설정하세요:

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

허용되는 값은 `"render"`와 `"raw"`입니다. 단축키는 현재 세션 뷰만 변경하며 설정 파일을 다시 작성하지 않습니다.

## Mermaid

`render` 모드에서 펜스 `mermaid` 코드 블록이 시각적으로 렌더링됩니다. TUI는 계층적 전략을 사용합니다:

1. 활성화되고 지원되는 경우, Qwen Code는 Mermaid CLI(`mmdc`)에 다이어그램을 PNG로 렌더링하도록 요청하고 터미널 이미지 프로토콜로 전송합니다.
2. 터미널 이미지를 사용할 수 없지만 `chafa`가 설치된 경우, 같은 PNG를 ANSI 블록 그래픽으로 변환할 수 있습니다.
3. 그렇지 않으면, Qwen Code는 터미널 와이어프레임 또는 컴팩트 텍스트 미리보기로 폴백합니다.
4. Mermaid 다이어그램 타입을 미리보기할 수 없으면, Qwen Code는 플레이스홀더 뒤에 숨기지 않고 원래 펜스 소스를 표시합니다.

Mermaid 이미지 렌더링은 외부 렌더러와 터미널 이미지 지원이 필요하므로 기본적으로 비활성화됩니다. 활성화하려면:

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

선택적 환경 변수:

| 변수                                          | 설명                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`         | 외부 Mermaid 이미지 렌더링을 활성화합니다.                                        |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`          | 다른 곳에서 활성화되어 있어도 Mermaid 이미지 렌더링을 비활성화합니다.              |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`      | Kitty 프로토콜 출력을 강제합니다. Kitty 및 Ghostty와 같은 터미널에 유용합니다.    |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`     | iTerm2 인라인 이미지를 요청합니다. 대화형 TUI 렌더링은 텍스트/ANSI로 폴백합니다.  |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`        | 터미널 이미지 프로토콜을 비활성화하고 텍스트 또는 `chafa` 폴백을 허용합니다.       |
| `QWEN_CODE_MERMAID_MMD_CLI=/path/to/mmdc`     | 특정 Mermaid CLI 실행 파일을 사용합니다.                                          |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`              | `mmdc`가 설치되지 않았을 때 Qwen Code가 `npx @mermaid-js/mermaid-cli`를 실행하도록 허용합니다. |
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1`  | `node_modules/.bin` 아래의 프로젝트 로컬 렌더러 바이너리를 허용합니다.             |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`         | PNG 렌더 너비를 오버라이드합니다.                                                  |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000`   | 외부 렌더 타임아웃을 오버라이드하며, 60000ms로 제한됩니다.                         |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`     | 터미널 폰트 셀 지오메트리에 대한 이미지 행 맞춤을 조정합니다.                      |

첫 이미지 렌더는 느릴 수 있습니다. 특히 `npx`가 Mermaid CLI를 해결하거나 다운로드해야 하는 경우. 스트리밍 중에 Qwen Code는 제한된 텍스트 미리보기를 표시하고 모델 응답이 완료된 후에만 이미지 렌더링을 시도합니다.

### Mermaid 소스 복사

렌더링된 모든 Mermaid 블록에는 다음과 같은 소스 힌트가 포함됩니다:

```text
Mermaid flowchart (TD) · source: /copy mermaid 1
```

마지막 AI 응답에서 Mermaid 소스를 복사하려면 이 명령어를 사용하세요:

| 명령어                 | 동작                                          |
| ---------------------- | --------------------------------------------- |
| `/copy mermaid`        | 마지막 Mermaid 블록을 복사합니다.              |
| `/copy mermaid 1`      | 첫 번째 Mermaid 블록을 복사합니다.             |
| `/copy code mermaid`   | 마지막 펜스 `mermaid` 코드 블록을 복사합니다.  |
| `/copy code mermaid 1` | 첫 번째 펜스 `mermaid` 코드 블록을 복사합니다. |

`/copy code 1`은 Mermaid 블록뿐만 아니라 모든 펜스 코드 블록을 셉니다. 렌더링된 제목에 표시되는 Mermaid별 시퀀스를 원하면 `/copy mermaid N`을 사용하세요.

## LaTeX 수학

Qwen Code는 터미널에서 기본 인라인 및 블록 LaTeX 렌더링을 지원합니다:

```markdown
Inline math: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```

렌더러는 일반적인 심볼과 읽기 쉬운 터미널 출력에 중점을 둡니다. 완전한 TeX 엔진이 아니며, 행렬, 정렬된 방정식 및 큰 중첩 표현과 같은 복잡한 레이아웃은 단순화될 수 있습니다.

인라인 `$...$` 표현은 의도적으로 라인당 1024자로 제한되어, 잘못 형성되거나 매우 큰 생성 Markdown이 터미널 렌더링을 중단시키지 못합니다. 더 긴 수식은 원시 모드나 원본 응답에서 여전히 소스 텍스트로 볼 수 있으며 복사할 수 있습니다.

### LaTeX 소스 복사

마지막 AI 응답에서 LaTeX 소스를 복사하려면 이 명령어를 사용하세요:

| 명령어                 | 동작                                |
| ---------------------- | ----------------------------------- |
| `/copy latex`          | 마지막 블록 LaTeX 표현식을 복사합니다.|
| `/copy latex 2`        | 두 번째 블록 표현식을 복사합니다.    |
| `/copy latex inline`   | 마지막 인라인 표현식을 복사합니다.   |
| `/copy latex inline 2` | 두 번째 인라인 표현식을 복사합니다.  |
| `/copy inline-latex 2` | `/copy latex inline 2`의 별칭입니다. |

인라인 LaTeX은 산문을 지저분하게 만들지 않기 위해 렌더링된 텍스트에 표현별 복사 힌트를 표시하지 않습니다. 인라인 소스를 제자리에서 검사하려면 `Alt/Option+M`으로 원시 모드로 전환하세요; macOS에서는 Option-as-Meta 터미널 입력이 필요합니다.

## 일반 코드 복사

`/copy code` 명령어는 마지막 AI Markdown 응답에서 펜스 코드 블록을 읽습니다:

| 명령어                  | 동작                                  |
| ----------------------- | ------------------------------------- |
| `/copy code`            | 마지막 펜스 코드 블록을 복사합니다.    |
| `/copy code 2`          | 두 번째 펜스 코드 블록을 복사합니다.   |
| `/copy code typescript` | 마지막 `typescript` 코드 블록을 복사합니다. |
| `/copy code mermaid 1`  | 첫 번째 `mermaid` 코드 블록을 복사합니다.   |

## 이전 AI 메시지 선택

기본적으로 `/copy`는 가장 최근 AI 메시지를 대상으로 합니다. 양의 정수를 접두사로 붙이면 N번째 마지막 AI 메시지에서 복사합니다 — 최신 응답이 신호가 낮은 것(예: TODO 업데이트)이고 실질적인 출력이 한두 턴 전에 있을 때 유용합니다.

| 명령어                | 동작                                                  |
| --------------------- | ----------------------------------------------------- |
| `/copy 2`             | 마지막에서 두 번째 AI 메시지를 전체적으로 복사합니다.  |
| `/copy 3`             | 마지막에서 세 번째 AI 메시지를 전체적으로 복사합니다.  |
| `/copy 2 code python` | 마지막에서 두 번째에서 마지막 `python` 코드 블록을 복사합니다. |
| `/copy 3 latex`       | 마지막에서 세 번째 메시지에서 마지막 LaTeX 블록을 복사합니다. |

`/copy 1`은 `/copy`와 동일합니다. `N`이 세션의 AI 메시지 수를 초과하면 `/copy`는 아무것도 복사하는 대신 실제 개수를 보고합니다. 선행 정수 없이는 `/copy code python 2`와 같은 하위 선택기가 기존 의미를 유지합니다(마지막 메시지의 2번째 `python` 블록).

## 현재 제한

- Mermaid 이미지 렌더링은 Mermaid CLI와 터미널 이미지 지원에 의존합니다.
- 비동기 iTerm2 인라인 이미지 배치는 TUI에서 비활성화됩니다. 프로토콜이 커서 위치에 바인딩되기 때문입니다; 대화형 이미지 미리보기에는 Kitty/Ghostty 또는 ANSI 폴백을 사용하세요.
- 와이어프레임 Mermaid 렌더링은 읽기 쉬운 터미널 미리보기이며 완전한 Mermaid 레이아웃 엔진이 아닙니다.
- 원시 모드는 렌더링된 Markdown 블록에 대해 전역적입니다; 블록별 토글이 아닙니다.
- LaTeX 렌더링은 일반적인 심볼과 표현을 커버하며 전체 TeX 레이아웃은 아닙니다.
- 소스 복사 명령어는 기본적으로 마지막 AI 응답을 대상으로 하며, `/copy N ...`으로 호출되면 N번째 마지막을 대상으로 합니다.
