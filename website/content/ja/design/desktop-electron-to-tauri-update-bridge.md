# Electron から Tauri へのデスクトップアップデートブリッジ

## Context

最後に公開されたデスクトップリリース `desktop-v0.0.5` は、バンドル識別子
`com.alibaba.qwen-code` を持つ `Qwen Code Desktop` という名前の Electron アプリ
である。その macOS アップデーターは、固定の `desktop-latest` リリースから
`latest-mac.yml` を読み取り、ZIP アーカイブをインストールする。

新しいデスクトップシェルは Tauri アプリである。現在は異なる製品名とバンドル識別子
を使用し、`desktop-latest.json` を公開しているため、既存の Electron アプリはそれ
を検出したり置き換えたりできない。

## Goals

- サイン済みの macOS Electron `0.0.5` インストールが、最初の安定版 Tauri リリース
  に直接アップデートできるようにする。
- 既存の macOS アプリケーションのアイデンティティを維持し、アップデーターがイン
  ストール済みのアプリバンドルを置き換えられるようにする。
- 移行後のすべてのリリースで、Tauri のサイン済みアップデーターフィードを維持する。
- ブリッジはオプトインかつ一回限りとする。以降のリリースは Electron のビルドツー
  ルを必要としてはならない。

## Non-goals

- Electron の設定、セッション、ワークスペース状態の移行。Tauri アプリは初回起動
  時にワークスペースを求める場合がある。
- Windows または Linux の Electron インストールのブリッジ。
- Electron の差分 blockmap の生成。Electron のアップデーターは、チェックサムで
  検証されたフル ZIP にフォールバックする。

## Compatibility contract

Tauri バンドルはレガシーの macOS アイデンティティを使用する:

- 製品名: `Qwen Code Desktop`
- バンドル識別子: `com.alibaba.qwen-code`
- アーティファクトプレフィックス: `Qwen-Code-Desktop`
- 署名アイデンティティ: 既存の Developer ID Application 証明書

ブリッジリリースは `0.0.5` より新しいバージョンでなければならない。同じサイン
済みアプリバンドルに対して、2 つのアップデータービューを公開する:

1. `latest-mac.yml` はレガシーの Electron クライアントを
   `Qwen-Code-Desktop-arm64.zip` または `Qwen-Code-Desktop-x64.zip` に向ける。
2. `desktop-latest.json` は Tauri クライアントをサイン済みの Tauri アップデーター
   アーカイブに向ける。

ZIP は、すでにサインと公証が済んだ `.app` から作成される。Electron のツールで再
ビルドはされない。

## Release flow

`Desktop Release` に `electron_bridge` 入力が追加され、デフォルトでは無効である。

- すべての macOS ビルドは引き続き Tauri アプリ、DMG、アップデーターアーカイブ、
  アップデーター署名を生成する。
- `electron_bridge` が有効な場合、各 macOS ビルドはレガシー互換の ZIP も作成する。
- 公開ジョブは 2 つの ZIP と 2 つの DMG から `latest-mac.yml` を生成する。
- 安定版のブリッジリリースは、レガシーのメタデータとペイロードを
  `desktop-latest.json` とともに `desktop-latest` にアップロードする。
- その後の安定版リリースは `electron_bridge` を無効のままにする。
  `desktop-latest.json` の更新ではブリッジファイルは削除されないため、後から復帰
  する Electron インストールも引き続き Tauri に移行できる。

ドラフトおよびプレリリースの実行は、検査のためにブリッジアーティファクトをビルド
して公開する場合があるが、安定版フィードを更新することは決してない。

## Signing credentials

リポジトリにはすでに、Electron 時代の Apple 証明書と App Store Connect API キー
が、`MAC_CSC_*` と `APPLE_NOTARY_*` のシークレット名で格納されている。ワーク
フローはそれらの名前を、より新しい Tauri 名に対するフォールバックとして受け
付けるため、Developer ID のアイデンティティは変更されないままである。

Tauri のアップデーターアーティファクトには、さらに
`TAURI_SIGNING_PRIVATE_KEY` が必要である。
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` は、暗号化された秘密鍵の場合にのみ必要と
なる。秘密鍵は、最初の Tauri リリースの公開前に、Tauri 設定内の公開鍵と一致
していなければならない。

## Validation

自動化されたリリースヘルパーのテストは次を検証する:

- レガシーのアプリケーションアイデンティティ、
- 正確なブリッジアーティファクトの選択、
- `latest-mac.yml` 内の SHA-512 とサイズの値、
- 必要なブリッジアーティファクトが欠落している場合の失敗、
- 既存の Tauri アップデーターマニフェストとバージョン同期の挙動。

安定版リリースの前に、サイン済みの `desktop-v0.0.5` arm64 と x64 ビルドをイン
ストールし、隔離されたブリッジフィードを指すように設定して、`0.0.5 -> Tauri
ブリッジ` と `Tauri ブリッジ -> 新しい Tauri` の両方のアップデートを検証する。
