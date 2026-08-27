---
title: Themes
---

# 테마

Qwen Code는 색상 체계와 외관을 사용자 정의할 수 있는 다양한 테마를 지원합니다. `/theme` 명령어나 `"ui.theme"` 구성 설정을 통해 선호에 맞는 테마로 변경할 수 있습니다.

## 사용 가능한 테마

Qwen Code는 미리 정의된 테마 세트를 제공하며, CLI 내의 `/theme` 명령어로 목록을 확인할 수 있습니다:

- **다크 테마:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
  - `Qwen Dark`
  - `Shades Of Purple`
- **라이트 테마:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Qwen Light`
  - `Xcode`

### 테마 변경

1.  Qwen Code에 `/theme`을 입력합니다.
2.  사용 가능한 테마를 나열하는 대화상자 또는 선택 프롬프트가 나타납니다.
3.  방향 키를 사용하여 테마를 선택합니다. 일부 인터페이스는 선택 중 실시간 미리보기 또는 하이라이트를 제공합니다.
4.  선택을 확인하여 테마를 적용합니다.

**참고:** `settings.json` 파일에 테마가 정의되어 있으면(이름 또는 파일 경로로) `/theme` 명령어로 테마를 변경하기 전에 파일에서 `"ui.theme"` 설정을 제거해야 합니다.

### 테마 지속성

선택한 테마는 Qwen Code의 [구성](../configuration/settings)에 저장되어 세션 간에 선호도가 기억됩니다.

---

## 자동 테마 감지

테마가 `"auto"`로 설정되거나(또는 설정되지 않은 경우) Qwen Code는 터미널이 다크 또는 라이트 배경을 사용하는지 자동으로 감지하여 일치하는 Qwen 테마(`Qwen Dark` 또는 `Qwen Light`)를 선택합니다.

### 활성화 방법

`settings.json`에서 테마를 `"auto"`로 설정하세요:

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

또는 `/theme` 대화상자에서 **Auto**를 선택하세요. 명시적으로 테마가 구성되지 않은 경우의 기본 동작입니다.

### 감지 방식

Qwen Code는 폴백 체인에서 여러 감지 방식을 사용합니다. 시작 시(비동기 경로)의 순서는 다음과 같습니다:

| 우선순위 | 방식                    | 플랫폼     | 작동 방식                                                                                              |
| -------- | ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| 1        | `COLORFGBG`             | 전체       | `COLORFGBG` 환경 변수를 읽습니다(iTerm2, rxvt, Konsole 같은 터미널에서 설정됨)                         |
| 2        | OSC 11                  | 전체(TTY)  | 터미널에 `ESC]11;?` 쿼리를 전송하고 응답에서 배경색을 파싱합니다(~200ms)                               |
| 3        | macOS 시스템 외관       | macOS 전용 | `defaults read -g AppleInterfaceStyle`를 실행하여 macOS 다크 모드가 활성인지 확인합니다                  |
| 4        | 기본값                  | 전체       | 어떤 방식도 성공하지 못하면 다크 테마로 폴백합니다                                                     |

결과를 반환하는 첫 번째 방식이 승리합니다. 감지된 값은 세션 동안 캐시되어 후속 테마 해석(예: `/theme` 대화상자에서 Auto 재선택)이 일관되게 유지됩니다.

### Auto를 사용해야 하는 경우

- **대부분의 사용자** — 터미널 배경이 OS 외관과 일치하거나 터미널이 `COLORFGBG`를 설정 / OSC 11을 지원하면 Auto가 잘 작동합니다.
- **tmux / screen 사용자** — OSC 11은 멀티플렉서를 통과하지 못할 수 있습니다. 감지는 `COLORFGBG` 또는 macOS 시스템 외관으로 폴백합니다. 둘 다 사용할 수 없으면 기본 다크 테마가 사용됩니다. 자동 감지가 잘못된 결과를 제공하면 특정 테마를 설정하세요.
- **SSH 세션** — 감지는 원격 환경에 따라 다릅니다. `COLORFGBG`가 전달되지 않고 원격 터미널이 OSC 11에 응답하지 않으면 기본 다크 테마가 사용됩니다.

---

## 사용자 정의 색상 테마

Qwen Code는 `settings.json` 파일에 사용자 정의 색상 테마를 지정하여 자체 색상 테마를 만들 수 있습니다. 이를 통해 CLI에서 사용되는 색상 팔레트를 완전히 제어할 수 있습니다.

### 사용자 정의 테마 정의 방법

사용자, 프로젝트 또는 시스템 `settings.json` 파일에 `customThemes` 블록을 추가하세요. 각 사용자 정의 테마는 고유한 이름과 색상 키 세트를 가진 객체로 정의됩니다. 예:

```json
{
  "ui": {
    "customThemes": {
      "MyCustomTheme": {
        "name": "MyCustomTheme",
        "type": "custom",
        "Background": "#181818",
        ...
      }
    }
  }
}
```

**색상 키:**

- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`
- `DiffAdded`(선택 사항, diff에서 추가된 라인용)
- `DiffRemoved`(선택 사항, diff에서 제거된 라인용)
- `DiffModified`(선택 사항, diff에서 수정된 라인용)

**필수 속성:**

- `name`(`customThemes` 객체의 키와 일치해야 하며 문자열이어야 함)
- `type`(문자열 `"custom"`이어야 함)
- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`

모든 색상 값에 16진수 코드(예: `#FF0000`) **또는** 표준 CSS 색상 이름(예: `coral`, `teal`, `blue`)을 사용할 수 있습니다. 지원되는 이름의 전체 목록은 [CSS 색상 이름](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords)을 참조하세요.

`customThemes` 객체에 더 많은 항목을 추가하여 여러 사용자 정의 테마를 정의할 수 있습니다.

### 파일에서 테마 로드

`settings.json`에 사용자 정의 테마를 정의하는 것 외에도, `settings.json`에 파일 경로를 지정하여 JSON 파일에서 테마를 직접 로드할 수 있습니다. 이는 테마를 공유하거나 기본 구성과 분리하여 유지하는 데 유용합니다.

파일에서 테마를 로드하려면 `settings.json`의 `ui.theme` 속성을 테마 파일의 경로로 설정하세요:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

테마 파일은 `settings.json`에 정의된 사용자 정의 테마와 동일한 구조를 따르는 유효한 JSON 파일이어야 합니다.

**`my-theme.json` 예시:**

```json
{
  "name": "My File Theme",
  "type": "custom",
  "Background": "#282A36",
  "Foreground": "#F8F8F2",
  "LightBlue": "#82AAFF",
  "AccentBlue": "#61AFEF",
  "AccentPurple": "#BD93F9",
  "AccentCyan": "#8BE9FD",
  "AccentGreen": "#50FA7B",
  "AccentYellow": "#F1FA8C",
  "AccentRed": "#FF5555",
  "Comment": "#6272A4",
  "Gray": "#ABB2BF",
  "DiffAdded": "#A6E3A1",
  "DiffRemoved": "#F38BA8",
  "DiffModified": "#89B4FA",
  "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
}
```

**보안 참고:** 안전을 위해 Qwen Code는 홈 디렉토리 내에 있는 테마 파일만 로드합니다. 홈 디렉토리 외부에서 테마를 로드하려고 하면 경고가 표시되며 테마가 로드되지 않습니다. 이는 신뢰할 수 없는 출처의 잠재적으로 악성 테마 파일이 로드되는 것을 방지하기 위함입니다.

### 사용자 정의 테마 예시

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### 사용자 정의 테마 사용

- Qwen Code에서 `/theme` 명령어를 사용하여 사용자 정의 테마를 선택하세요. 사용자 정의 테마가 테마 선택 대화상자에 나타납니다.
- 또는 `settings.json`의 `ui` 객체에 `"theme": "MyCustomTheme"`을 추가하여 기본값으로 설정하세요.
- 사용자 정의 테마는 사용자, 프로젝트 또는 시스템 수준에서 설정할 수 있으며 다른 설정과 동일한 [구성 우선순위](../configuration/settings)를 따릅니다.

## 테마 미리보기

|  다크 테마   |                                                                                미리보기                                                                                 |  라이트 테마   |                                                                                미리보기                                                                                 |
| :----------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |    Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |  Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   GitHub Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode      | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
