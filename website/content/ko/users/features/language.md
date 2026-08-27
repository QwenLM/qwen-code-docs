# 국제화 (i18n) 및 언어

Qwen Code는 다국어 워크플로우를 위해 설계되었습니다: CLI에서 UI 현지화(i18n/l10n)를 지원하고, 어시스턴트 출력 언어를 선택할 수 있으며, 사용자 정의 UI 언어 팩을 허용합니다.

## 개요

사용자 관점에서 Qwen Code의 "국제화"는 여러 계층에 걸쳐 있습니다:

| 기능 / 설정              | 제어 내용                                                        | 저장 위치                    |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | 터미널 UI 텍스트 (메뉴, 시스템 메시지, 프롬프트)                  | `~/.qwen/settings.json`      |
| `/language output`       | AI가 응답하는 언어 (UI 번역이 아닌 출력 환경 설정)                | `~/.qwen/output-language.md` |
| 사용자 정의 UI 언어 팩   | 내장 UI 번역을 오버라이드/확장                                    | `~/.qwen/locales/*.js`       |

## UI 언어

CLI의 UI 현지화 계층(i18n/l10n)입니다: 메뉴, 프롬프트 및 시스템 메시지의 언어를 제어합니다.

### UI 언어 설정

`/language ui` 명령어를 사용하세요:

```bash
/language ui zh-CN    # 중국어
/language ui en-US    # 영어
/language ui ru-RU    # 러시아어
/language ui de-DE    # 독일어
/language ui ja-JP    # 일본어
/language ui pt-BR    # 포르투갈어 (브라질)
/language ui fr-FR    # 프랑스어
/language ui ca-ES    # 카탈로니아어
```

별칭도 지원됩니다:

```bash
/language ui zh       # 중국어
/language ui en       # 영어
/language ui ru       # 러시아어
/language ui de       # 독일어
/language ui ja       # 일본어
/language ui pt       # 포르투갈어
/language ui fr       # 프랑스어
/language ui ca       # 카탈로니아어
```

### 자동 감지

첫 시작 시, Qwen Code는 시스템 로케일을 감지하여 UI 언어를 자동으로 설정합니다.

감지 우선순위:

1. `QWEN_CODE_LANG` 환경 변수
2. `LANG` 환경 변수
3. JavaScript Intl API를 통한 시스템 로케일
4. 기본값: 영어

## LLM 출력 언어

LLM 출력 언어는 어떤 언어로 질문을 입력하든 AI 어시스턴트가 응답하는 언어를 제어합니다.

### 작동 방식

LLM 출력 언어는 `~/.qwen/output-language.md`의 규칙 파일로 제어됩니다. 이 파일은 시작 시 LLM의 컨텍스트에 자동으로 포함되어 지정된 언어로 응답하도록 지시합니다.

### 자동 감지

첫 시작 시, `output-language.md` 파일이 없으면 Qwen Code는 시스템 로케일을 기반으로 자동으로 생성합니다. 예를 들어:

- 시스템 로케일 `zh`는 중국어 응답 규칙을 생성
- 시스템 로케일 `en`은 영어 응답 규칙을 생성
- 시스템 로케일 `ru`는 러시아어 응답 규칙을 생성
- 시스템 로케일 `de`는 독일어 응답 규칙을 생성
- 시스템 로케일 `ja`는 일본어 응답 규칙을 생성
- 시스템 로케일 `pt`는 포르투갈어 응답 규칙을 생성
- 시스템 로케일 `fr`은 프랑스어 응답 규칙을 생성
- 시스템 로케일 `ca`는 카탈로니아어 응답 규칙을 생성

### 수동 설정

`/language output <language>`를 사용하여 변경하세요:

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

어떤 언어 이름이든 작동합니다. LLM은 해당 언어로 응답하도록 지시받습니다.

> [!note]
>
> 출력 언어를 변경한 후, 변경 사항을 적용하려면 Qwen Code를 재시작하세요.

### 파일 위치

```
~/.qwen/output-language.md
```

## 구성

### 설정 대화 상자를 통해

1. `/settings`를 실행하세요
2. General에서 "Language"를 찾으세요
3. 원하는 UI 언어를 선택하세요

### 환경 변수를 통해

```bash
export QWEN_CODE_LANG=zh
```

이는 첫 시작 시 자동 감지에 영향을 줍니다(UI 언어를 설정하지 않았고 `output-language.md` 파일이 아직 없는 경우).

## 사용자 정의 언어 팩

UI 번역의 경우, `~/.qwen/locales/`에 사용자 정의 언어 팩을 생성할 수 있습니다:

- 예시: 스페인어의 경우 `~/.qwen/locales/es.js`
- 예시: 프랑스어의 경우 `~/.qwen/locales/fr.js`

사용자 디렉토리는 내장 번역보다 우선합니다.

> [!tip]
>
> 기여를 환영합니다! 내장 번역을 개선하거나 새 언어를 추가하고 싶으신 경우.
> 구체적인 예시는 [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238)를 참조하세요.

### `zh-TW` 유지 관리 (대만을 위한 번체 중국어)

`zh-TW`는 `zh.js`의 자동 OpenCC s2t 변환이 **아닙니다** — 수동으로 유지 관리되는 대만 어휘 번역입니다. 키를 추가하거나 업데이트할 때 아래 규칙을 따르세요.

"CI 강제?" 열은 `npm run check-i18n`이 위반 시 빌드를 실패시키는지를 나타냅니다. **No**로 표시된 행은 리뷰에서만 강제되는 스타일 가이드입니다 — 일반적으로 해당 형태가 합법적인 비 UI 의미를 가지기 때문입니다(`文件`은 "문서"를 의미할 수 있음, `打開`는 대만에서 구어체로 정상적).

| 피해야 할 것          | 대신 사용할 것        | CI 강제? | 이유                                                                                                                                                                            |
| --------------------- | --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 (file)           | 檔案                  | No       | 파일시스템 파일의 대만 용어 (`文件`은 합법적으로 "문서"를 의미할 수 있음)                                                                                                                               |
| 服務器 / 服务器       | 伺服器                | Yes      | "server"의 대만 용어                                                                                                                                                                                  |
| 菜單 / 菜单           | 選單                  | Yes      | "menu"의 대만 용어                                                                                                                                                                                     |
| 鏈接 / 链接           | 連結                  | Yes      | "link"의 대만 용어 (맨 `鏈`은 괜찮음 — 예: 區塊鏈)                                                                                                                                                      |
| 打開                  | 開啟                  | No       | "open"(UI)의 대만 선호 동사 (`打開`는 구어체로 일반적)                                                                                                                                                  |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | Yes      | 원시 OpenCC s2t의 변형 번체. 참고: `曆`은 맥락에 따라 올바르며 달력 용어(日曆, 農曆, 西曆)에서 올바릅니다; CI는 `曆史` 바이그램만 플래그하고 맨 `曆`은 플래그하지 않습니다.                                  |

번체 중국어 화자가 아니고 값을 부트스트랩해야 한다면, **원시 OpenCC `s2t` 출력을 붙여넣지 마세요**: 기본 s2t 프로필은 대만에서 사용하지 않는 변형 번체 문자(예: 爲, 啓)를 내보내며, 중국 본토 어휘(服務器, 菜單)를 절대 재작성하지 않습니다. `s2twp.json`(간체 → 대만, 어구 매핑 포함)을 시작점으로 사용하고 대만 중국어 화자에게 리뷰를 요청하세요.

`check-i18n` 스크립트(CI에서 `npm run check-i18n`를 통해 실행)는 CI 강제 서브스트링 중 하나가 `zh-TW` 값에 나타나면 빌드를 실패시킵니다. 전체 목록은 `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS`를 참조하세요. 번역에 합법적으로 CI 금지 서브스트링이 필요하면 같은 파일의 `ZH_TW_ALLOWED_EXCEPTIONS`에 간단한 근거와 함께 키를 추가하세요.

> [!note]
>
> 검사는 일반 서브스트링 매칭을 사용하며 중국어 단어 경계를 이해하지 못합니다. 바이그램 패턴은 따라서 합성 단어 경계를 가로질러 거짓 양성을 낼 수 있습니다 — 예를 들어, `區塊鏈接口` (= `區塊鏈` + `接口`)는 `鏈接` 서브스트링을 포함하지만 두 단어 모두 올바릅니다. 이러한 종류의 놀라운 CI 실패가 발생하면, 패턴을 제거하는 대신 번역 키를 `ZH_TW_ALLOWED_EXCEPTIONS`에 추가하세요.

### 언어 팩 형식

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... 더 많은 번역
};
```

## 관련 명령어

- `/language` - 현재 언어 설정 표시
- `/language ui [lang]` - UI 언어 설정
- `/language output <language>` - LLM 출력 언어 설정
- `/settings` - 설정 대화 상자 열기
