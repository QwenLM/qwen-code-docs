# DSW SWE-bench Verified リリースパイプライン

このパイプラインは、次のものの隔離された実装である:

`GitHub Release -> self-hosted DSW runner -> short run submission -> persistent Coordinator + 10 Executors -> Publisher -> Release result`

PR #7584 のワークフロー、サービス、状態、結果マーカーは使用も変更もしない。

## Production behavior

- 安定版の `vX.Y.0` リリースが、リリースタグのターゲットコミットからワークフロー
  を開始する。パッチリリース、プレリリース、無関係なタグファミリーはスキップ
  される。
- リリースタグは、その不変の Git コミットに解決される。
- 500 インスタンス全体の SWE-bench Verified マニフェストは、ディスパッチ前に
  凍結される。
- セルフホストランナーは、その外向きの GitHub 接続を通じて Actions ジョブを
  受信する。ワンショットのディスパッチスクリプトがマニフェストを凍結し、
  `qwen-benchmark-pool submit` を呼び出して実行と初期タスクを作成する。
- Action はプールの `run_id` を記録し、ベンチマークを待たずに終了する。
- 常駐の Coordinator と 10 個の常駐 Executor が実行を処理する。各 Executor は
  1 つのタスクをアトミックにクレームし、1 度に 1 つの Harbor/Docker トライアル
  を実行する。
- Harbor のライブトライアルディレクトリはローカルの NVMe に置かれる。完了した
  試行のアーティファクトは、OSS の POSIX 権限操作に依存せずに OSS にコピー
  される。
- Executor は自身のリースを heartbeat し、結果をアトミックに提出する。リトライ
  可能なインフラストラクチャエラーには、60 秒、120 秒、240 秒のバックオフで
  最大 4 回の試行が与えられる。
- Coordinator は期限切れのリースを回復し、実行のカウンターを reconciliation
  し、マニフェストの完了と公開のゲートを適用する。隔離されたターミナルの失敗は、
  残りのタスクをキャンセルしない。
- 常駐の DSW publisher がターミナルの実行を監視し、トリガーとなったリリースを
  公開結果 JSON とケースごとの軌跡アーカイブで能動的に更新する。
- スコアは、500 インスタンスすべてが一意のターミナル状態に到達し、キャンセル
  されたタスクがなく、`EXECUTION_ERROR + INFRA_FAILED < 10` である場合にのみ
  書き込まれる。スコアは `RESOLVED / (RESOLVED + UNRESOLVED)` であり、分母には
  有効なグレーダーの結果のみを使用する。
- 10 件以上のターミナルエラー、キャンセルされたタスク、結果の欠落、またはスコア
  対象ケースの軌跡の欠落は、実行を `QUARANTINED` にする。ステータスとカウント
  はスコアなしで書き込まれる。

## Isolation boundaries

- ランナーラベル: `qwen-benchmark-dsw`
- ワークフロー: `.github/workflows/dsw-swe-verified-release.yml`
- スイート: `dsw_release_swe_verified_v1`
- PostgreSQL データベース: `qwen_benchmark_dsw_release_v1`
- ランタイム: `/mnt/workspace/qwen-benchmark-dsw-release-v1`
- モデル認証情報:
  `/mnt/workspace/qwen-benchmark-dsw-release-v1/config/model.key`
  （`root:github-runner`、モード `0640`）
- OSS: `/mnt/data/qwen-benchmark/dsw-release-v1`
- リリースマーカー: `qwen-code-dsw-swe-verified`

Docker イメージのレイヤーは DSW ホストのキャッシュを使用する場合があるが、
実験の状態とアーティファクトは、別のベンチマークパイプラインとパスやテーブルを
共有しない。

## Branch validation

このブランチから `workflow_dispatch` を使用し、隔離されたプレリリースを対象と
する。自動の `release.published` 実行は、意図的に安定版の `vX.Y.0` リリースに
限定されている。

手動でディスパッチされたテスト用プレリリースについては、
`Benchmark-Qwen-Ref: v0.20.0-nightly.20260722.b98306b7e` のような本文の 1 行で、
既存の公開済み Qwen npm バージョンを選択しつつ、結果を隔離された POC リリース
に留めることができる。このオーバーライドはプレリリースに対してのみ受け付け
られる。通常のリリースは常に自身のタグを評価する。

`workflow_dispatch` は、明示的な診断と再実行のために引き続き利用可能である。
手動の検証は、時間とモデルのコストを抑えるため、デフォルトで 1 インスタンスと
なる。5 および 500 インスタンスの実行は、単一ケースの `instance_id` を転送し
ない。いずれのトリガーも非同期である。Actions はディスパッチの受領を記録するが、
ベンチマークの期間中存続し続けることはない。

## Component boundary

- GitHub セルフホストランナー: 長時間実行される GitHub ジョブのレシーバー。
- ディスパッチ/プールへの提出: ワンショットの実行とタスクの作成者。
- PostgreSQL: 共有の永続的な状態ストアであり、スケジューラーではない。
- Coordinator: 期限切れリースの回復、実行の reconciliation、完了ゲート。
- Executor: タスクのクレーム、Harbor/Qwen Code/グレーダーの実行、heartbeat、
  結果の提出。
- Publisher: ターミナル実行の検証、公開結果と軌跡バンドルの生成、GitHub リリース
  への能動的な書き戻し。

DSW の実装は、内部の `qwen-code-benchmark-dsw` リポジトリで個別に維持されて
いる。この PR には、GitHub のトリガー、マニフェスト、ディスパッチアダプター、
公開設計契約のみが含まれる。

## Full-suite validation

隔離されたプレリリースの検証は 2026-07-25 に完了した:

- テストリリース:
  `dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3`
- GitHub Actions 実行: `30079405895`
- プール実行: `pool-31a24bc8acca49d2`
- データセット: `swe-bench/swe-bench-verified@2`、凍結された 500 インスタンス
- 実行: 10 個の常駐 Executor、インスタンスあたり最大 2 回の試行
- Qwen Code: `v0.20.0-nightly.20260722.b98306b7e`
- モデル: `qwen3.7-max`
- 所要時間: 約 12 時間 27 分
- 結果: 332 件 `RESOLVED`、107 件 `UNRESOLVED`、56 件 `EXECUTION_ERROR`、
  5 件 `INFRA_FAILED`
- 有効なグレーダーのカバレッジ: 439/500（87.8%）
- 有効なグレーダー結果内の resolved 率: 332/439（75.6%）
- 実行ステータス: `QUARANTINED`。公式スコアは公開されなかった
- 公開 JSON: 500 レコードと 500 の一意なインスタンス ID

エビデンス:

- https://github.com/QwenLM/qwen-code/releases/tag/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3
- https://github.com/QwenLM/qwen-code/actions/runs/30079405895
- https://github.com/QwenLM/qwen-code/releases/download/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3/swe-bench-verified-dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3.json

非同期ディスパッチ、タスクプール実行、厳格な隔離、Publisher の書き戻しを含め、
全チェーンが検証された。この実行は公式のモデルスコアではない。61 インスタンス
に有効なグレーダーの結果がなく、実行中の Executor プールがソースのホット更新後
も古いエラー分類器を保持していたためである。クリーンなフル再実行には、ピン留め
されたワーカーのコミット/ダイジェストと、再起動されてバージョンチェックされた
Executor が必要である。
