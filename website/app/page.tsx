import { withBasePath } from "../src/lib/utils";

const REDIRECT_URL = withBasePath("/en/");

export default function RedirectToEnglish() {
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
