# Zed Editor

> Zed Editor는 Agent Client Protocol(ACP)을 통해 AI 코딩 어시스턴트를 네이티브로 지원합니다. 이 통합을 통해 Zed 인터페이스 내에서 Qwen Code를 직접 사용할 수 있으며 실시간 코드 제안이 제공됩니다.

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 기능

- **네이티브 에이전트 경험**: Zed 인터페이스 내에 통합된 AI 어시스턴트 패널
- **Agent Client Protocol**: 고급 IDE 상호작용을 가능하게 하는 ACP 완전 지원
- **파일 관리**: 파일을 @로 언급하여 대화 컨텍스트에 추가
- **대화 기록**: Zed 내에서 과거 대화 접근

### 요구 사항

- Zed Editor (최신 버전 권장)
- Qwen Code CLI 설치됨

### 설치

#### ACP Registry에서 설치 (권장)

1. Qwen Code CLI 설치:

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) 다운로드 및 설치

3. Zed에서 오른쪽 상단의 **설정 버튼**을 클릭하고, **"Add agent"**를 선택한 다음, **"Install from Registry"**를 선택하고, **Qwen Code**를 찾은 후 **Install**을 클릭하세요.

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP Installed](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### 수동 설치

1. Qwen Code CLI 설치:

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) 다운로드 및 설치

3. Zed에서 오른쪽 상단의 **설정 버튼**을 클릭하고, **"Add agent"**를 선택한 다음, **"Create a custom agent"**를 선택하고 다음 구성을 추가하세요:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## 문제 해결

### 에이전트가 표시되지 않음

- 터미널에서 `qwen --version`을 실행하여 설치를 확인하세요
- JSON 구성이 유효한지 확인하세요
- Zed Editor를 재시작하세요

### Qwen Code가 응답하지 않음

- 인터넷 연결을 확인하세요
- 터미널에서 `qwen`을 실행하여 CLI가 작동하는지 확인하세요
- 문제가 계속되면 [GitHub에 이슈를 등록하세요](https://github.com/qwenlm/qwen-code/issues)
