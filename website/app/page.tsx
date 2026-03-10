const REDIRECT_URL = "https://qwen.ai/qwencode";

export default function RedirectToQwenCode() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${REDIRECT_URL}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace("${REDIRECT_URL}");`,
        }}
      />
    </>
  );
}
