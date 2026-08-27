---
title: File System Tools
---

# Qwen Code 파일 시스템 도구

Qwen Code는 로컬 파일 시스템과 상호 작용하기 위한 포괄적인 도구 모음을 제공합니다. 이 도구들을 통해 모델은 파일과 디렉토리를 읽고, 쓰고, 나열하고, 검색하고, 수정할 수 있으며, 모든 작업은 사용자의 제어 하에 이루어지고 민감한 작업에는 일반적으로 확인이 필요합니다.

**참고:** 모든 파일 시스템 도구는 보안을 위해 `rootDirectory`(일반적으로 CLI를 실행한 현재 작업 디렉토리) 내에서 작동합니다. 이 도구들에 제공하는 경로는 일반적으로 절대 경로이거나 이 루트 디렉토리를 기준으로 해석됩니다.

## 1. `list_directory` (ListFiles)

`list_directory`는 지정된 디렉토리 경로 내의 파일 및 하위 디렉토리 이름을 나열합니다. 제공된 glob 패턴과 일치하는 항목을 선택적으로 무시할 수 있습니다.

**참고:** 이 도구는 옵트인이며 기본적으로 비활성되어 있습니다. 대부분의 경우 `glob`이 디렉토리 나열을 커버하기 때문입니다. 설정에서 `tools.listDirectory.enabled`를 `true`로 설정하거나 `coreTools` 허용 목록(`--core-tools` / `tools.core`)에 `list_directory`를 명시적으로 추가하여 활성화하세요.

- **도구 이름:** `list_directory`
- **표시 이름:** ListFiles
- **파일:** `ls.ts`
- **매개변수:**
  - `path` (string, 필수): 나열할 디렉토리의 절대 경로.
  - `ignore` (string 배열, 선택 사항): 목록에서 제외할 glob 패턴 목록(예: `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, 선택 사항): 파일 나열 시 `.gitignore` 패턴을 존중할지 여부. 기본값은 `true`.
- **동작:**
  - 파일 및 디렉토리 이름 목록을 반환합니다.
  - 각 항목이 디렉토리인지 여부를 나타냅니다.
  - 디렉토리를 먼저, 그 다음 알파벳 순으로 정렬합니다.
- **출력 (`llmContent`):** `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`와 같은 문자열.
- **확인:** 아니오.

## 2. `read_file` (ReadFile)

`read_file`는 지정된 파일의 내용을 읽고 반환합니다. 이 도구는 현재 모델이 지원하는 모달리티의 텍스트 파일과 미디어 파일(이미지, PDF, 오디오, 비디오)을 처리합니다. 텍스트 파일의 경우 특정 행 범위를 읽을 수 있습니다. 지원되지 않는 PDF는 텍스트 추출을 시도하고 아래에 설명된 경계가 지정된 vision fallback을 사용합니다. 다른 지원되지 않는 미디어 파일은 도움이 되는 오류 메시지를 반환합니다. 다른 이진 파일 유형은 일반적으로 건너뜁니다.

- **도구 이름:** `read_file`
- **표시 이름:** ReadFile
- **파일:** `read-file.ts`
- **매개변수:**
  - `file_path` (string, 필수): 읽을 파일의 절대 경로.
  - `offset` (number, 선택 사항): 텍스트 파일의 경우, 읽기를 시작할 0 기반 행 번호. `limit`이 설정되어 있어야 합니다.
  - `limit` (number, 선택 사항): 텍스트 파일의 경우, 읽을 최대 행 수. 생략하면 기본 최대값(예: 2000행) 또는 가능한 경우 파일 전체를 읽습니다.
  - `pages` (string, 선택 사항): PDF의 경우, 1 기반 페이지 또는 닫힌 페이지 범위(예: `"3"` 또는 `"20-25"`). 요청에는 최대 20페이지까지 포함할 수 있습니다.
- **동작:**
  - 텍스트 파일: 내용을 반환합니다. `offset`과 `limit`을 사용하면 해당 행 슬라이스만 반환합니다. 행 제한 또는 행 길이 제한으로 인해 내용이 잘렸는지 여부를 나타냅니다.
  - 미디어 파일(이미지, PDF, 오디오, 비디오): 현재 모델이 파일의 모달리티를 지원하면 파일 내용을 base64 인코딩 `inlineData` 객체로 반환합니다. 모델이 모달리티를 지원하지 않으면 skill이나 외부 도구를 제안하는 안내 메시지와 함께 오류를 반환합니다.
  - 텍스트 전용 기본 모델의 PDF: 텍스트 추출을 먼저 시도합니다. 추출이 실패하거나 명시적으로 요청된(또는 실제) 단일 페이지가 12K 토큰 텍스트 예산을 초과하는 경우, 구성된 vision bridge가 요청된 첫 페이지부터 시작하여 최대 4페이지를 자동으로 렌더링하고 기록합니다. 요청된 범위는 알려진 경우 실제 문서 끝으로 잘립니다. 결과는 기록된 범위와 남아 있는 것으로 알려진 페이지를 식별하며, 페이지 수를 사용할 수 없는 경우 추가 페이지가 있을 수 있음을 나타냅니다. 일반 다중 페이지 텍스트 오버플로는 vision으로 전환하는 대신 더 좁은 `pages` 범위를 요청합니다.
  - Vision bridge PDF 기록은 손실이 있으며 신뢰할 수 없는 기계 생성 콘텐츠로 표시됩니다. 도구 결과는 렌더링된 이미지 대신 텍스트를 포함하며, 사용자 대상 TUI, ACP, 비인터랙티브 구조화된 출력 및 내보내기 표시는 알려진 경우 vision 모델과 엔드포인트를 식별합니다. bridge가 실패하면 정확한 원본 PDF 추출 오류가 모델에 반환되는 동안 사용자 표시는 여전히 bridge 시도를 공개합니다.
  - 다른 이진 파일: 식별 및 건너뛰기를 시도하며, 일반 이진 파일임을 나타내는 메시지를 반환합니다.
- **출력 (`llmContent`):**
  - 텍스트 파일: 파일 내용으로, 잘림 메시지가 앞에 올 수 있습니다(예: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - 지원되는 미디어 파일: `mimeType`과 base64 `data`를 포함한 `inlineData`를 포함하는 객체(예: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - 지원되지 않는 미디어 파일: 현재 모델이 이 모달리티를 지원하지 않는다는 설명과 대안 제안이 포함된 오류 메시지 문자열.
  - 다른 이진 파일: `Cannot display content of binary file: /path/to/data.bin`과 같은 메시지.
- **확인:** 아니오.

### Jupyter 노트북 읽기

Jupyter 노트북(`.ipynb`)의 경우, `read_file`는 노트북 JSON을 파싱하고 원시 JSON 대신 구조화된 모델 친화적 노트북 뷰를 반환합니다. 렌더링된 출력에는 노트북 언어, 정렬된 셀, 셀 ID, 소스 및 요약된 출력이 포함됩니다.

노트북 셀은 `notebook_edit`로 편집할 수 있습니다. 모델은 셀을 대상으로 할 때 `read_file`가 표시하는 셀 ID를 사용해야 합니다.

`offset`과 `limit`은 `.ipynb` 파일에서 지원되지 않습니다. 노트북 읽기는 구조화된 전체 파일 읽기로 처리됩니다. 렌더링된 노트북 출력이 너무 커서 내부적으로 잘린 경우, `notebook_edit`는 셀 수준 편집을 거부하고 편집 전에 출력을 줄이거나 노트북을 분할하도록 요청합니다.

## 3. `notebook_edit` (NotebookEdit)

`notebook_edit`는 Jupyter 노트북(`.ipynb`) 파일을 셀 수준에서 안전하게 편집합니다. 노트북 셀을 변경할 때 `edit`이나 `write_file` 대신 사용하세요.

- **도구 이름:** `notebook_edit`
- **표시 이름:** NotebookEdit
- **파일:** `notebook-edit.ts`
- **매개변수:**
  - `notebook_path` (string, 필수): `.ipynb` 파일의 절대 경로.
  - `cell_id` (string, 선택 사항): `read_file`가 표시한 대상 셀 ID. `replace`와 `delete`에 필요합니다. `insert`의 경우 새 셀이 이 셀 뒤에 삽입됩니다. 생략하면 새 셀이 맨 앞에 삽입됩니다.
  - `new_source` (string, 선택 사항): `replace`와 `insert`를 위한 새 셀 소스. `delete`에는 필요하지 않습니다.
  - `cell_type` (`code` 또는 `markdown`, 선택 사항): 삽입된 셀의 셀 유형, 또는 셀 교체 시 대상 유형.
  - `edit_mode` (`replace`, `insert` 또는 `delete`, 선택 사항): 편집 작업. 기본값은 `replace`.
- **동작:**
  - 현재 세션에서 `read_file`로 노트북을 먼저 읽어야 합니다.
  - `read_file`가 렌더링한 ID를 사용하여 셀을 대상으로 합니다. 실제 노트북 셀 ID와 표시된 `cell-N` fallback ID를 포함합니다.
  - 모호한 렌더링된 셀 ID는 추측하지 않고 거부합니다.
  - 코드 셀의 경우 소스가 변경될 때 오래된 출력을 지우고 `execution_count`를 재설정합니다.
  - 가능한 경우 노트북 JSON 포맷, 줄 바꿈, 인코딩 및 BOM을 보존합니다.
  - 표시된 fallback ID가 변경될 수 있는 구조적 편집 후 이전 읽기 상태를 무효화하므로 다음 노트북 편집에는 새 `read_file`가 필요합니다.
- **출력 (`llmContent`):** 편집된 노트북 셀을 설명하는 성공 메시지와, delete가 아닌 작업의 경우 업데이트된 소스.
- **확인:** 예. 노트북 JSON diff를 표시하고 쓰기 전에 사용자 승인을 요청합니다. 현재 권한 모드나 규칙이 편집 도구를 자동 승인하는 경우는 예외입니다.

### `notebook_edit` 예시

코드 셀 교체:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

기존 셀 뒤에 마크다운 셀 삽입:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

셀 삭제:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file` (WriteFile)

`write_file`는 지정된 파일에 내용을 씁니다. 파일이 존재하면 덮어씁니다. 파일이 존재하지 않으면 해당 파일과 필요한 모든 상위 디렉토리가 생성됩니다.

- **도구 이름:** `write_file`
- **표시 이름:** WriteFile
- **파일:** `write-file.ts`
- **매개변수:**
  - `file_path` (string, 필수): 쓸 파일의 절대 경로.
  - `content` (string, 필수): 파일에 쓸 내용.
- **동작:**
  - 제공된 `content`를 `file_path`에 씁니다.
  - 원시 Jupyter 노트북 JSON은 쓰지 않습니다. `.ipynb` 셀 편집에는 `notebook_edit`를 사용하세요.
  - 상위 디렉토리가 없으면 생성합니다.
- **출력 (`llmContent`):** 성공 메시지, 예: `Successfully overwrote file: /path/to/your/file.txt` 또는 `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **확인:** 예. 변경 사항의 diff를 표시하고 쓰기 전에 사용자 승인을 요청합니다.

## 5. `glob` (Glob)

`glob`은 특정 glob 패턴(예: `src/**/*.ts`, `*.md`)과 일치하는 파일을 찾아 수정 시간순(최신순)으로 정렬된 절대 경로를 반환합니다.

- **도구 이름:** `glob`
- **표시 이름:** Glob
- **파일:** `glob.ts`
- **매개변수:**
  - `pattern` (string, 필수): 일치시킬 glob 패턴(예: `"*.py"`, `"src/**/*.js"`).
  - `path` (string, 선택 사항): 검색할 디렉토리. 지정하지 않으면 현재 작업 디렉토리가 사용됩니다.
- **동작:**
  - 지정된 디렉토리 내에서 glob 패턴과 일치하는 파일을 검색합니다.
  - 절대 경로 목록을 반환하며, 가장 최근에 수정된 파일이 먼저 옵니다.
  - 기본적으로 .gitignore, .qwenignore 및 구성된 사용자 정의 Qwen ignore 파일을 존중합니다.
  - 컨텍스트 오버플로를 방지하기 위해 결과를 100개의 파일로 제한합니다.
- **출력 (`llmContent`):** `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`와 같은 메시지.
- **확인:** 아니오.

## 6. `grep_search` (Grep)

`grep_search`는 지정된 디렉토리 내 파일 내용에서 정규식 패턴을 검색합니다. glob 패턴으로 파일을 필터링할 수 있습니다. 일치하는 행을 파일 경로 및 행 번호와 함께 반환합니다.

- **도구 이름:** `grep_search`
- **표시 이름:** Grep
- **파일:** `grep.ts` (fallback으로 `ripGrep.ts`)
- **매개변수:**
  - `pattern` (string, 필수): 파일 내용에서 검색할 정규식 패턴(예: `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, 선택 사항): 검색할 파일 또는 디렉토리. 기본값은 현재 작업 디렉토리.
  - `glob` (string, 선택 사항): 파일을 필터링할 glob 패턴(예: `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (integer, 선택 사항): 첫 N개의 일치하는 행으로 출력을 제한합니다. 양의 정수여야 합니다. 선택 사항 — 지정하지 않으면 모든 일치를 표시합니다.
- **동작:**
  - 사용 가능할 때 빠른 검색을 위해 ripgrep을 사용합니다. 그렇지 않으면 JavaScript 기반 검색 구현으로 fallback합니다.
  - 파일 경로와 행 번호가 포함된 일치하는 행을 반환합니다.
  - 기본적으로 대소문자를 구분하지 않습니다.
  - .gitignore, .qwenignore 및 구성된 사용자 정의 Qwen ignore 파일을 존중합니다.
  - 컨텍스트 오버플로를 방지하기 위해 출력을 제한합니다.
- **출력 (`llmContent`):** 다음과 같은 포맷된 일치 문자열:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **확인:** 아니오.

### `grep_search` 예시

기본 결과 제한으로 패턴 검색:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

사용자 정의 결과 제한으로 패턴 검색:

```
grep_search(pattern="function", path="src", limit=50)
```

파일 필터링과 사용자 정의 결과 제한으로 패턴 검색:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 7. `edit` (Edit)

`edit`는 파일 내 텍스트를 교체합니다. 기본적으로 `old_string`이 단일 고유 위치와 일치해야 합니다. 모든 발생을 의도적으로 변경하려면 `replace_all`을 `true`로 설정하세요. 이 도구는 정확하고 대상이 지정된 변경을 위해 설계되었으며 올바른 위치를 수정하도록 `old_string` 주변에 충분한 컨텍스트를 요구합니다.

- **도구 이름:** `edit`
- **표시 이름:** Edit
- **파일:** `edit.ts`
- **매개변수:**
  - `file_path` (string, 필수): 수정할 파일의 절대 경로.
  - `old_string` (string, 필수): 교체할 정확한 리터럴 텍스트.

    **중요:** 이 문자열은 변경할 단일 인스턴스를 고유하게 식별해야 합니다. 대상 텍스트 주변의 충분한 컨텍스트를 포함하여 공백과 들여쓰기를 정확하게 일치시켜야 합니다. `old_string`이 비어 있으면 도구는 `file_path`에 `new_string`을 내용으로 하는 새 파일을 생성하려고 시도합니다.

  - `new_string` (string, 필수): `old_string`을 교체할 정확한 리터럴 텍스트.
  - `replace_all` (boolean, 선택 사항): `old_string`의 모든 발생을 교체합니다. 기본값은 `false`.

- **동작:**
  - 원시 Jupyter 노트북 JSON은 편집하지 않습니다. `.ipynb` 셀 편집에는 `notebook_edit`를 사용하세요.
  - `old_string`이 비어 있고 `file_path`가 존재하지 않으면 `new_string`을 내용으로 하는 새 파일을 생성합니다.
  - `old_string`이 제공되면 `file_path`를 읽고 `replace_all`이 true가 아닌 경우 정확히 한 번의 일치를 찾습니다.
  - 일치가 고유하거나 `replace_all`이 true이면 텍스트를 `new_string`으로 교체합니다.
  - **신뢰성 강화(다단계 편집 수정):** 모델이 제공한 `old_string`이 완벽하지 않을 수 있는 경우를 포함하여 편집 성공률을 크게 향상시키기 위해 다단계 편집 수정 메커니즘이 통합되어 있습니다.
    - 초기 `old_string`을 찾을 수 없거나 여러 위치와 일치하는 경우, 도구는 Qwen 모델을 활용하여 `old_string`(및 잠재적으로 `new_string`)을 반복적으로 정제할 수 있습니다.
    - 이 자기 수정 프로세스는 모델이 수정하려고 의도한 고유 세그먼트를 식별하려고 시도하여 약간 불완전한 초기 컨텍스트에서도 `edit` 작업을 더 견고하게 만듭니다.
- **실패 조건:** 수정 메커니즘에도 불구하고 다음 경우 도구가 실패합니다:
  - `file_path`가 절대 경로가 아니거나 루트 디렉토리 밖에 있는 경우.
  - `old_string`이 비어 있지 않지만 `file_path`가 존재하지 않는 경우.
  - `old_string`이 비어 있지만 `file_path`가 이미 존재하는 경우.
  - 수정 시도 후에도 `old_string`을 파일에서 찾을 수 없는 경우.
  - `old_string`이 여러 번 발견되고 `replace_all`이 false이며 자기 수정 메커니즘이 단일 명확한 일치를 해결할 수 없는 경우.
- **출력 (`llmContent`):**
  - 성공 시: `Successfully modified file: /path/to/file.txt (1 replacements).` 또는 `Created new file: /path/to/new_file.txt with provided content.`
  - 실패 시: 이유를 설명하는 오류 메시지(예: `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **확인:** 예. 제안된 변경 사항의 diff를 표시하고 파일에 쓰기 전에 사용자 승인을 요청합니다.

## 파일 인코딩 및 플랫폼별 동작

### 인코딩 감지 및 보존

파일을 읽을 때 Qwen Code는 다단계 전략을 사용하여 파일의 인코딩을 감지합니다:

1. **UTF-8** — 먼저 시도(대부분의 최신 도구는 UTF-8을 출력)
2. **chardet** — UTF-8이 아닌 콘텐츠에 대한 통계적 감지
3. **시스템 인코딩** — OS 코드 페이지로 fallback (Windows `chcp` / Unix `LANG`)

`write_file`과 `edit` 모두 기존 파일의 원본 인코딩과 BOM(byte order mark)을 보존합니다. 파일이 UTF-8 BOM이 있는 GBK로 읽혔다면 같은 방식으로 다시 쓰여집니다.

### 새 파일의 기본 인코딩 구성

`defaultFileEncoding` 설정은 **새로 생성된** 파일의 인코딩을 제어합니다(기존 파일 편집이 아님):

| 값          | 동작                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| _(미설정)_  | BOM 없는 UTF-8, 자동 플랫폼별 조정 포함(아래 참조)                           |
| `utf-8`     | BOM 없는 UTF-8, 자동 조정 없음                                               |
| `utf-8-bom` | 모든 새 파일에 BOM이 있는 UTF-8                                              |

`.qwen/settings.json` 또는 `~/.qwen/settings.json`에서 설정합니다:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: 배치 파일의 CRLF

Windows에서 `.bat` 및 `.cmd` 파일은 자동으로 CRLF(`\r\n`) 줄 바꿈으로 쓰여집니다. 이는 `cmd.exe`가 줄 구분자로 CRLF를 사용하기 때문에 필요합니다. LF 전용 줄 바꿈은 다중 행 `if`/`else`, `goto` 레이블 및 `for` 루프를 깨뜨릴 수 있습니다. 이는 인코딩 설정과 관계없이 Windows에서만 적용됩니다.

### Windows: PowerShell 스크립트의 UTF-8 BOM

**UTF-8이 아닌 시스템 코드 페이지**(예: GBK/cp936, Big5/cp950, Shift_JIS/cp932)를 사용하는 Windows에서 새로 생성된 `.ps1` 파일은 자동으로 UTF-8 BOM과 함께 쓰여집니다. 이는 Windows에 내장된 Windows PowerShell 5.1이 BOM이 없는 스크립트를 시스템의 ANSI 코드 페이지를 사용하여 읽기 때문에 필요합니다. BOM이 없으면 스크립트의 비 ASCII 문자가 잘못 해석됩니다.

이 자동 BOM은 다음 경우에만 적용됩니다:

- 플랫폼이 Windows인 경우
- 시스템 코드 페이지가 UTF-8이 아닌 경우(코드 페이지 65001이 아님)
- 파일이 새 `.ps1` 파일인 경우(기존 파일은 원본 인코딩을 유지)
- 사용자가 설정에서 `defaultFileEncoding`을 명시적으로 설정하지 **않은** 경우

PowerShell 7+(pwsh)는 기본적으로 UTF-8을 사용하며 BOM을 투명하게 처리하므로 BOM이 있어도 문제가 없습니다.

`defaultFileEncoding`을 명시적으로 `"utf-8"`로 설정하면 자동 BOM이 비활성화됩니다. 이는 BOM을 거부하는 저장소 또는 도구를 위한 의도적인 탈출구입니다.

### 요약

| 파일 유형      | 플랫폼                        | 자동 동작                     |
| -------------- | ----------------------------- | ----------------------------- |
| `.bat`, `.cmd` | Windows                       | CRLF 줄 바꿈                  |
| `.ps1`         | Windows (UTF-8이 아닌 코드 페이지) | 새 파일에 UTF-8 BOM       |
| 기타 모두      | 전체                          | BOM 없는 UTF-8 (기본값)       |

이 파일 시스템 도구들은 Qwen Code가 로컬 프로젝트 컨텍스트를 이해하고 상호 작용할 수 있는 기반을 제공합니다.
