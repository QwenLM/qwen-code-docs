---
title: Web Fetch Tool
---

# Web Fetch 도구 (`web_fetch`)

이 문서는 Qwen Code의 `web_fetch` 도구에 대해 설명합니다.

## 설명

`web_fetch`를 사용하여 지정된 URL에서 콘텐츠를 가져오고 AI 모델을 사용하여 처리합니다. 이 도구는 URL과 프롬프트를 입력으로 받아 URL 콘텐츠를 가져오고 작고 빠른 모델로 프롬프트를 사용하여 콘텐츠를 처리합니다.

### 인수

`web_fetch`는 세 개의 인수를 받습니다:

- `url` (string, 필수): 콘텐츠를 가져올 URL. `http://` 또는 `https://`로 시작하는 완전한 유효한 URL이어야 합니다.
- `prompt` (string, 필수): 페이지 콘텐츠에서 추출하려는 정보를 설명하는 프롬프트.
- `format` (string, 선택 사항): 서버로 전송되는 `Accept` 헤더만 제어하며, 콘텐츠 선호도를 나타냅니다. **가져온 모든 콘텐츠는 지정된 형식에 관계없이 LLM 처리를 위해 일반 텍스트로 정규화됩니다.** 지정하지 않으면 기본값은 `"auto"`입니다.
  - `"auto"` (기본값): 콘텐츠 협상을 통해 마크다운을 선호합니다(`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`). 그런 다음 HTML, 일반 텍스트 또는 다른 콘텐츠 유형으로 폴백합니다. **마크다운을 지원하는 서버의 경우 토큰 사용량을 최대 80%까지 줄일 수 있으면서 JSON 전용 API에서도 작동하므로 대부분의 사용 사례에 권장됩니다.**
  - `"markdown"`: `Accept: text/markdown, */*;q=0.1`을 선호합니다. 명시적으로 마크다운 콘텐츠가 필요한 경우 사용하세요.
  - `"html"`: `Accept: text/html, */*;q=0.1`을 선호합니다. 서버가 Accept 헤더에 HTML을 요구하는 경우 사용하세요. 콘텐츠는 여전히 LLM 처리를 위해 일반 텍스트로 변환됩니다.
  - `"text"`: `Accept: text/plain, */*;q=0.1`을 선호합니다. 특별히 일반 텍스트 콘텐츠가 필요한 경우 사용하세요.

## Qwen Code에서 `web_fetch` 사용 방법

Qwen Code에서 `web_fetch`를 사용하려면 URL과 해당 URL에서 추출하려는 내용을 설명하는 프롬프트를 제공하세요. 도구는 URL을 가져오기 전에 확인을 요청합니다. 확인되면 도구가 콘텐츠를 직접 가져오고 AI 모델을 사용하여 처리합니다.

이 도구는 자동으로 다음을 수행합니다:

- 필요시 HTML을 텍스트로 변환
- GitHub blob URL 처리(원시 URL로 변환)
- 보안을 위해 HTTP URL을 HTTPS로 업그레이드
- 마크다운을 위한 콘텐츠 협상 지원(토큰 사용량 대폭 감소)

사용법:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

형식 지정과 함께:

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
```

## `web_fetch` 예시

단일 기사 요약:

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

특정 정보 추출:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

GitHub 문서 분석:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

마크다운 콘텐츠 가져오기(Markdown for Agents를 지원하는 서버용):

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## 중요 참고 사항

- **단일 URL 처리:** `web_fetch`는 한 번에 하나의 URL만 처리합니다. 여러 URL을 분석하려면 도구를 별도로 호출하세요.
- **URL 형식:** 이 도구는 HTTP URL을 HTTPS로 자동으로 업그레이드하고 더 나은 콘텐츠 접근을 위해 GitHub blob URL을 원시 형식으로 변환합니다.
- **콘텐츠 협상:** 이 도구는 "Markdown for Agents" 콘텐츠 협상을 지원합니다. `format="auto"`(기본값)를 사용할 때 `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`을 전송하여 마크다운을 지원하는 서버가 HTML 대신 직접 반환할 수 있게 합니다. 낮은 우선순위의 `*/*` 폴백은 JSON 전용 API와 다른 비텍스트 엔드포인트를 가져올 수 있게 합니다. 이렇게 하면 토큰 사용량을 최대 80%까지 줄일 수 있습니다.
- **콘텐츠 처리:** 이 도구는 콘텐츠를 직접 가져오고 AI 모델을 사용하여 처리합니다. 서버가 HTML을 반환하면 읽을 수 있는 텍스트 형식으로 변환합니다. 서버가 마크다운, 일반 텍스트 또는 JSON과 같은 다른 폴백 콘텐츠 유형을 반환하면 그대로 사용합니다.
- **출력 품질:** 출력 품질은 프롬프트의 지시사항의 명확성에 따라 달라집니다.
- **MCP 도구:** MCP 제공 웹 가져오기 도구("mcp\_\_"로 시작)를 사용할 수 있는 경우, 제한이 덜할 수 있으므로 해당 도구를 우선 사용하는 것이 좋습니다.

## Markdown for Agents 지원

Qwen Code의 `web_fetch` 도구는 [Cloudflare의 Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) 사양에 대한 지원을 구현합니다. 이 기능을 사용하면 웹사이트가 AI 에이전트에 직접 마크다운 콘텐츠를 제공할 수 있어 HTML을 파싱하는 것에 비해 토큰 사용량을 대폭 줄일 수 있습니다.

### 작동 방식

1. `format` 매개변수는 서버로 전송되는 `Accept` 헤더**만** 제어합니다(출력 형식에는 영향을 주지 않음):
   - `format="auto"`: `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1` 전송
   - `format="markdown"`: `Accept: text/markdown, */*;q=0.1` 전송
   - `format="html"`: `Accept: text/html, */*;q=0.1` 전송
   - `format="text"`: `Accept: text/plain, */*;q=0.1` 전송
2. 서버가 마크다운을 지원하면 `Content-Type: text/markdown`을 반환합니다
3. 이 도구는 마크다운 또는 일반 텍스트 콘텐츠를 변환 없이 직접 사용합니다
4. 서버가 HTML을 반환하면 LLM 처리를 위해 읽을 수 있는 텍스트 형식으로 변환합니다. 마크다운, 일반 텍스트 및 JSON과 같은 폴백 콘텐츠 유형은 그대로 사용됩니다
5. 모든 콘텐츠는 AI 모델에 의해 처리되기 전에 텍스트로 정규화됩니다

### 이점

- **토큰 효율성:** 마크다운 콘텐츠는 일반적으로 동일한 HTML보다 80% 적은 토큰을 사용합니다
- **더 나은 구조:** 마크다운은 시맨틱 구조(제목, 목록 등)를 보존합니다
- **하위 호환성:** 모든 웹사이트에서 작동하며, 지원하는 서버에서는 향상된 경험을 제공합니다

### 마크다운을 지원하는 서버 예시

- Cloudflare 개발자 문서
- Cloudflare 블로그
- Cloudflare의 "Markdown for Agents" 기능을 사용하는 모든 웹사이트
