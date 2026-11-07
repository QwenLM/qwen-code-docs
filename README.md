# Qwen Code Docs — 1.x

This branch holds the Qwen Code 1.x preview documentation, published at
https://qwenlm.github.io/qwen-code-docs/1.x/ (English and Chinese only).

The stable 0.26 documentation lives on the `main` branch and is served at the
site root. The two branches are maintained independently and are not merged.

## Editing

Pages live in `website/content/{en,zh}`. Both languages are written by hand;
there is no sync from QwenLM/qwen-code and no automatic translation.

```bash
cd website
npm ci
npm run dev
```

## Deployment

Pushing to `1.x` runs `.github/workflows/trigger-deploy.yml`, which dispatches
`deploy-docs.yml` on `main`. That workflow builds both branches and publishes
`main` at the root and `1.x` under `/1.x/` in a single GitHub Pages deploy.
