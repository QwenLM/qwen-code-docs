---
title: Multi-File Read
---

# Multi-File Read (`read_many_files`)

> [!note]
>
> `read_many_files`는 이전에 독립 실행형 도구로 노출되었지만 내부 유틸리티 함수로 리팩토링되었습니다. 모델은 더 이상 이를 직접 호출하지 않으며, 대신 `read_file`, `glob`, `grep_search` 도구가 개별 및 다중 파일 읽기를 처리합니다. 아래 정보는 참고용으로 유지됩니다.

## 설명

`read_many_files`는 경로 또는 glob 패턴으로 지정된 여러 파일의 내용을 읽습니다. 동작은 파일 유형에 따라 다릅니다:

- 텍스트 파일의 경우, 이 도구는 내용을 단일 문자열로 연결합니다.
- 이미지(PNG, JPEG 등), PDF, 오디오(MP3, WAV) 및 비디오(MP4, MOV) 파일의 경우, 이름 또는 확장자로 명시적으로 요청된 경우 base64 인코딩 데이터로 읽고 반환합니다.

`read_many_files`는 코드베이스 개요 파악, 특정 기능 구현 위치 찾기, 문서 검토 또는 여러 구성 파일에서 컨텍스트 수집과 같은 작업을 수행하는 데 사용할 수 있습니다.

**참고:** `read_many_files`는 제공된 경로 또는 glob 패턴을 따르는 파일을 찾습니다. `"/docs"`와 같은 디렉토리 경로는 빈 결과를 반환합니다. 이 도구는 관련 파일을 식별하기 위해 `"/docs/*"` 또는 `"/docs/*.md"`와 같은 패턴이 필요합니다.

### 인수

`read_many_files`는 다음 인수를 받습니다:

- `paths` (list[string], 필수): 도구의 대상 디렉토리를 기준으로 하는 glob 패턴 또는 경로의 배열(예: `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], 선택 사항): 제외할 파일/디렉토리에 대한 glob 패턴(예: `["**/*.log", "temp/"]`). `useDefaultExcludes`가 true인 경우 기본 제외에 추가됩니다.
- `include` (list[string], 선택 사항): 포함할 추가 glob 패턴. `paths`와 병합됩니다(예: 넓게 제외된 테스트 파일을 구체적으로 추가하는 `["*.test.ts"]` 또는 특정 이미지 유형을 포함하는 `["images/*.jpg"]`).
- `recursive` (boolean, 선택 사항): 재귀적으로 검색할지 여부. 이는 주로 glob 패턴의 `**`에 의해 제어됩니다. 기본값은 `true`.
- `useDefaultExcludes` (boolean, 선택 사항): 기본 제외 패턴 목록(예: `node_modules`, `.git`, 이미지가 아닌/pdf 바이너리 파일)을 적용할지 여부. 기본값은 `true`.
- `respect_git_ignore` (boolean, 선택 사항): 파일을 찾을 때 .gitignore 패턴을 존중할지 여부. 기본값은 true.

## Qwen Code에서 `read_many_files` 사용 방법

`read_many_files`는 제공된 `paths` 및 `include` 패턴과 일치하는 파일을 검색하면서 `exclude` 패턴과 기본 제외(활성화된 경우)를 존중합니다.

- 텍스트 파일: 일치하는 각 파일의 내용을 읽고(명시적으로 이미지/PDF로 요청되지 않은 바이너리 파일은 건너뛰기 시도) 각 파일 내용 사이에 `--- {filePath} ---` 구분자를 사용하여 단일 문자열로 연결합니다. 기본적으로 UTF-8 인코딩을 사용합니다.
- 도구는 마지막 파일 뒤에 `--- End of content ---`를 삽입합니다.
- 이미지 및 PDF 파일: 이름 또는 확장자로 명시적으로 요청된 경우(예: `paths: ["logo.png"]` 또는 `include: ["*.pdf"]`), 도구가 파일을 읽고 내용을 base64 인코딩 문자열로 반환합니다.
- 도구는 초기 내용에서 null 바이트를 확인하여 다른 바이너리 파일(일반적인 이미지/PDF 유형과 일치하지 않거나 명시적으로 요청되지 않은 파일)을 감지하고 건너뛰려고 시도합니다.

사용법:

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` 예시

`src` 디렉토리의 모든 TypeScript 파일 읽기:

```
read_many_files(paths=["src/**/*.ts"])
```

기본 README, `docs` 디렉토리의 모든 Markdown 파일 및 특정 로고 이미지를 읽되 특정 파일 제외:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

모든 JavaScript 파일을 읽되 테스트 파일과 `images` 폴더의 모든 JPEG를 명시적으로 포함:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 중요 참고 사항

- **바이너리 파일 처리:**
  - **이미지/PDF/오디오/비디오 파일:** 이 도구는 일반적인 이미지 유형(PNG, JPEG 등), PDF, 오디오(mp3, wav) 및 비디오(mp4, mov) 파일을 읽고 base64 인코딩 데이터로 반환할 수 있습니다. 이러한 파일은 `paths` 또는 `include` 패턴으로 명시적으로 대상 지정_되어야_ 합니다(예: `video.mp4`와 같은 정확한 파일 이름 또는 `*.mov`와 같은 패턴 지정).
  - **다른 바이너리 파일:** 이 도구는 초기 내용에서 null 바이트를 확인하여 다른 유형의 바이너리 파일을 감지하고 건너뛰려고 시도합니다. 이 도구는 이러한 파일을 출력에서 제외합니다.
- **성능:** 매우 많은 수의 파일이나 매우 큰 개별 파일을 읽으면 리소스를 많이 소비할 수 있습니다.
- **경로 특정성:** 도구의 대상 디렉토리를 기준으로 경로와 glob 패턴이 올바르게 지정되었는지 확인하세요. 이미지/PDF 파일의 경우, 패턴이 이를 포함할 만큼 충분히 구체적인지 확인하세요.
- **기본 제외:** 기본 제외 패턴(`node_modules`, `.git` 등)을 인지하고, 이를 재정의해야 하는 경우 `useDefaultExcludes=False`를 사용하되 주의해서 사용하세요.
