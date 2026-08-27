# 제거

제거 방법은 CLI를 설치한 방식에 따라 다릅니다.

## 방법 1: npx 사용

npx는 영구 설치 없이 임시 캐시에서 패키지를 실행합니다. CLI를 "제거"하려면 이 캐시를 비워야 하며, 이 과정에서 qwen-code와 이전에 npx로 실행된 다른 패키지가 모두 제거됩니다.

npx 캐시는 기본 npm 캐시 폴더 내의 `_npx`라는 디렉토리입니다. `npm config get cache`를 실행하여 npm 캐시 경로를 확인할 수 있습니다.

**macOS / Linux의 경우**

```bash
# 경로는 일반적으로 ~/.npm/_npx입니다
rm -rf "$(npm config get cache)/_npx"
```

**Windows의 경우**

_명령 프롬프트_

```cmd
:: 경로는 일반적으로 %LocalAppData%\npm-cache\_npx입니다
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# 경로는 일반적으로 $env:LocalAppData\npm-cache\_npx입니다
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 방법 2: npm 사용 (전역 설치)

CLI를 전역으로 설치한 경우(예: `npm install -g @qwen-code/qwen-code`), `npm uninstall` 명령어를 `-g` 플래그와 함께 사용하여 제거하세요.

```bash
npm uninstall -g @qwen-code/qwen-code
```

이 명령어는 시스템에서 패키지를 완전히 제거합니다.

## 방법 3: 독립 실행형 설치

독립 실행형 설치 프로그램(`curl ... | bash` 또는 `irm ... | iex`)을 통해 설치한 경우 전용 제거 스크립트를 사용하세요.

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

제거 프로그램은 독립 실행형 런타임, 생성된 `qwen` 래퍼 및 설치 프로그램이 관리하는 PATH 변경 사항을 제거합니다. Qwen Code 구성(`~/.qwen`)은 기본적으로 유지됩니다.
