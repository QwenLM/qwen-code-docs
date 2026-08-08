# JetBrains IDE

> JetBrains IDE는 Agent Client Protocol(ACP)을 통해 AI 코딩 어시스턴트를 네이티브로 지원합니다. 이 통합을 통해 Qwen Code를 JetBrains IDE에서 실시간 코드 제안과 함께 직접 사용할 수 있습니다.

### 기능

- **네이티브 에이전트 경험**: JetBrains IDE 내에 통합된 AI 어시스턴트 패널
- **Agent Client Protocol**: 고급 IDE 상호작용을 가능하게 하는 ACP 완전 지원
- **심볼 관리**: #-mention 파일로 대화 컨텍스트에 추가
- **대화 기록**: IDE 내에서 과거 대화 접근
- **컨텍스트 사용량**: Qwen Code 작동 중 현재 컨텍스트 창 점유율 확인

### 요구사항

- ACP 지원 JetBrains IDE (IntelliJ IDEA, WebStorm, PyCharm 등)
- Qwen Code CLI 설치됨

### 설치

#### ACP Registry에서 설치 (권장)

1. Qwen Code CLI 설치:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE를 열고 AI Chat 도구 창으로 이동합니다.

3. **Add ACP Agent**를 클릭한 다음 **Install**을 클릭합니다.

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   JetBrains AI Assistant 및/또는 다른 ACP 에이전트를 사용하는 경우, Agents List에서 **Install From ACP Registry**를 클릭한 다음 Qwen Code ACP를 설치합니다.

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Qwen Code 에이전트가 AI Assistant 패널에서 사용 가능해야 합니다.

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### 수동 설치 (이전 버전의 JetBrains IDE용)

1. Qwen Code CLI 설치:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE를 열고 AI Chat 도구 창으로 이동합니다.

3. 우측 상단의 3점 메뉴를 클릭하고 **Configure ACP Agent**를 선택한 다음 다음 설정으로 Qwen Code를 구성합니다:

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/path/to/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. Qwen Code 에이전트가 AI Assistant 패널에서 사용 가능해야 합니다

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## 문제 해결

### 에이전트가 표시되지 않음

- 터미널에서 `qwen --version`을 실행하여 설치 확인
- JetBrains IDE 버전이 ACP를 지원하는지 확인
- JetBrains IDE 재시작

### Qwen Code가 응답하지 않음

- 인터넷 연결 확인
- 터미널에서 `qwen`을 실행하여 CLI 작동 확인
- 문제가 계속되면 [GitHub에 이슈를 제기하세요](https://github.com/qwenlm/qwen-code/issues)
