# ハンドル束縛のテキストレンジ読み取り

## コンテキスト

PR #7947 により、Serve ワークスペースのファイルシステムは `MAX_READ_BYTES`（256 KiB）を
超えるテキストファイルから上限付きの行ウィンドウを返せるようになった。検証、バイナリ判定、
ストリーミングを通じてそれらの読み取りを 1 つの inode にピン留めするため、呼び出し元所有の
`FileHandle` を任意フィールドとして `readTextRange` にスルーさせ、メモリ上限を無効にして
しまうバッファリングのファストパスを抑止する 2 つ目の任意フィールド `forceStreaming` を
追加した。

1 つのエントリポイントに対する 2 つの任意フィールドは 4 つの組み合わせを生み、
そのうち 1 つだけが意味を持ち、1 つは到達不能、1 つはunsafe:

| `fileHandle` | `forceStreaming` | 結果                                                                 |
| ------------ | ---------------- | ---------------------------------------------------------------------- |
| 未設定        | 未設定            | 通常のパス読み取り                                                     |
| 未設定        | 設定              | 小さなファイルをストリームする — 1 つのテストが使用                                |
| 設定          | 設定              | Serve 境界の読み取り                                              |
| 設定          | 未設定            | ハンドル経由でファイル全体をバッファリング — **どの呼び出し元も到達できない** |

到達不能な組み合わせにはテストカバレッジのない専用ヘルパー `readFileHandleBuffer` が
付いていた。別途、`readFileWithLineAndLimit` も同じ `fileHandle` を受け取っていたが、
レンジブランチでのみ尊重できた: 無制限の読み取りはパスベースの
`readFileWithEncodingInfo` にフォールスルーし、ピン留めされた inode ではなく、その瞬間に
パスが解決する何かからのバイトをサイレントに返していた。PR #7947 のフォローアップコミットは
ランタイムの `RangeError` でそれをガードしたが、これはトラップを取り除くのではなく文書化する
だけだった。

エンコーディング検出も同じ理由で分岐していた。`detectFileEncoding` はパスを受け取り
自身のディスクリプタを開くため、ハンドルパスは使えなかった; 並行してプライベートな
`detectFileHandleEncoding` が追加され、chardet から直接ではなく
`decodeBufferWithEncodingInfoAsync(...).encoding` からエンコーディング名を導出していた。
chardet が `iconv-lite` が読み込めないエンコーディング名を付けた場合、両者は不一致になる:
パス版はその名前を返し、ハンドル版は `'utf-8'` を返してストリーミングデコーダーの
`fatal: true` 失敗に委ねる。両者ともファイルを拒否するが、メッセージが異なる。

## ゴール

- 1 つのエンコーディング検出器で、パスからも借りたディスクリプタからも使えること。
- レンジリーダーにモードフラグを置かない; 到達不能な組み合わせを、単に未使用にするのではなく
  表現不能にする。
- パスベースのフォールスルーを、ガードするのではなく構造的に不可能にする。
- Serve 境界および `read_file` ツールでの観測可能な変更はなし。

## 非ゴール

- `decodeBufferWithEncodingInfo`（同期）をその非同期の双子に統合しない。同期版は意図的な
  パブリック API の互換シムであり（[`lazy-first-use-dependencies.md`](./lazy-first-use-dependencies.md)）、
  同値性テストでピン留めされている。
- Serve 境界が返すものへの変更はしない。これはバイトカーソルページングの準備であり、
  その機能自体ではない。

## 設計

### 検出器は 1 つ

`detectFileEncoding(source: string | FileHandle)`。渡されたハンドルは_借りられ_る:
読み取りは明示的な position を使うため呼び出し元のファイル位置は影響を受けず、`finally`
ブロックはこの関数自身が開いたディスクリプタのみを閉じる。`detectFileHandleEncoding` は
削除され、ベタ書きの BOM→名前の switch は既存の `bomEncodingToName` に置き換える。

これによりハンドルパスはわずかに厳格になるが、それが意図した方向である: `iconv-lite` が
読み込めないエンコーディングは、デコーダーまで到達して汎用の `'invalid-utf8'` バリアントを
投げるのではなく、そのエンコーディング名を付した `LargeNonUtf8TextError(detected)` を
投げる。拒否は不変; メッセージが改善される。Serve 境界は両方を `binary_file` にマップする
ため、下流は何も動かない。

統合に伴う 2 つ目の小さな差分: `detectFileEncoding` はすべてのエラーをキャッチして
`'utf-8'` にフォールバックするのに対し、`detectFileHandleEncoding` にはハンドラーがなく
I/O 失敗を伝播させていた。この失敗は失われない — 8 KiB の判定で失敗するほど悪い
ハンドルはその直後のストリーミング読み取りでも失敗し、実際には UTF-8 でないファイルは
引き続き `fatal: true` のデコーダーが拒否する — つまりエラーは消えるのではなく別の
呼び出しから表面化する。単一のフォールバックポリシーのために受け入れ; どの呼び出しが
問題を報告するかが実際に変わるためここに記す。

### エントリポイントは 2 つ

```ts
readTextRange(request: ReadTextRangeRequest)                    // パス
readTextRangeFromHandle(fh, request: ReadTextRangeFromHandleRequest)
```

ハンドル版は常にストリームする — フラグはない。呼び出し元がハンドルに手を伸ばすのは
まさに読み取りに上限が必要なときであり、バッファリングのファストパスはファイル全体を
読み込んでしまうからである。そのリクエスト型には `path` がない（曖昧性を解消する対象が
ない）、オープニングの `fstat` からキャプチャした数値の `fileSize` を保持し、両方の
バイト境界を任意ではなく必須にする。`maxOutputBytes` は読み取りが返す量の上限、
`maxScanBytes` はコストの上限、`fileSize` は読み取りの in-flight 中に追記が
ディスクリプタのスナップショットを広げるのを防ぐ。ハンドル束縛の読み取りが存在するのは、
セキュリティ境界がこの 3 つすべての境界を必要とするからである。

`maxScanBytes` はパス版では任意のまま。デフォルトは `Infinity` で、`read_file` ツールは
不変。

両者は同じストリーミング実装に委譲し、それは今 `source: string | FileHandle` を受け取り、
`createReadStream` か `chunksFromHandle` かを選択する。`readFileHandleBuffer` と
それを呼んでいたブランチは削除される。

### フォールスルーは消える

`readFileWithLineAndLimit` は `fileHandle`、`forceStreaming`、`maxScanBytes` を失う —
唯一のプロダクション呼び出し元はどれも渡していない。
`StandardFileSystemService.readTextFileFromHandle` は今 `readTextRangeFromHandle` を
直接呼び出し、2 つの読み取りパスは `toReadTextFileResponse` ヘルパーを共有するため
メタデータ整形がドリフトできない。無視すべき `fileHandle` パラメータが残っていないため、
`RangeError` ガードは削除される: それが記述していたトラップはもはや表現できない。

`readTextFileFromHandle` は `FileSystemService` インターフェースの外にとどまるため、
`AcpFileSystemService` と `filesystem.test.ts` の型付きフォールバックモックは影響を受けない。

## 影響範囲

- `readTextRange` は `packages/core/src/index.ts` からエクスポートされていない;
  エクスポートされているのは 3 つの境界向けエラークラス。再整形されたリーダーサーフェスは
  core 内部。
- `readTextRange` と `readFileWithLineAndLimit` のプロダクション呼び出し元はそれぞれ
  正確に 1 つ（`fileUtils.ts`、`fileSystemService.ts`）。
- `detectFileEncoding` は `export * from './utils/fileUtils.js'` 経由でパブリック。
  パラメータの拡大はソース互換。
- 触ったモジュールの唯一のパッケージ間インポーターは
  `packages/cli/src/serve/fs/workspace-file-system.ts`。その唯一の変更は、ハンドルパスが
  受け付けなくなった 2 つの引数を落とすこと — 下記参照; それが併せて持つ
  `decodeBufferWithEncodingInfoAsync` のインポートは影響なし。

### `CoreReadTextFileHandleRequest` は独立型に

これは `Omit<CoreReadTextFileRequest, 'limit' | 'stats' | 'maxOutputBytes'> &
{...}` であり、ハンドルパスが決して読まない 2 つのフィールドが残っていた:

- **`stats`** は必須と記述されていた — 「そのハンドルからキャプチャした Stats を渡さなければ
  ならない」 — が、下流は何もそのオブジェクトを読まなかった。最終 API は数値の
  `fileSize` のみを保持: ハンドルパスは戦略選択にメタデータを必要としないが、ファイルが
  並行して追記される場合に読み取りを上限付きに保つにはオープニングのサイズが必要。
- **`path`** は、`readTextRangeFromHandle` がパス+ハンドルの呼び出しを置き換えた時点で
  死んだ: 読み取りはディスクリプタに束縛され、エラーはそれを所有する Serve 境界が
  パスでラベル付けする。

どちらもコンパイラには捕捉されなかった。この型が派生した元の ACP `ReadTextFileRequest` は
追加プロパティを許すため、型が削除したフィールドを渡しても何も警告されなかった。
これが、型を派生ではなく独立に宣言する論拠である: `Omit` チェーンは継承した 6 フィールド
のうち 4 つを剥がし、残りをサイレントに再入場させていた。

リファクタコミット時点で `packages/core` のプロダクションロジック 282 行が変更された;
後続のカーソル対応のフォローアップは、そのベースラインの上に挙動とテストを追加する。

## テスト

リファクタコミット時点で、既存のスイートが仕様だった: 要点全体が、Serve 境界が区別できない
ことだった。後続のカーソル対応フォローアップは境界の挙動と自身のテストを追加する。

`read-text-range.test.ts` の 3 つのテストが `readTextRangeFromHandle` に移動した。
2 つは `fileHandle` を直接使用していた。3 つ目は、ファストパスを離れるには小さすぎる
ファイルに対してストリーミングを強制するため `forceStreaming: true` の_パス_を使っており、
EOF での予算境界をテストできるようにしていた; フラグが消えた今、常にストリームするのは
ハンドル版のみ。

移動したテストの 1 つは意味が変わった。以前は 1 つのファイルのハンドルと別のファイルを
指すパスを渡し、ハンドルが勝つことをアサートしていた — 古いシグネチャが許した混乱の
テスト。ハンドル版には `path` がないため、その混乱は表現不能になり、テストは何も
アサートしなくなるはずだった。実際に API を動機付けた性質をカバーするよう書き換えた:
ハンドルを開き、パスの上に別のファイルをリネームし、読み取りが引き続き inode に
従うことを確認する。

`fileSystemService.test.ts` の 2 つのテストは修正せず削除した。これらは
`readFileWithLineAndLimit` をモックし、それが受け取った引数オブジェクトをアサートしていた;
`readTextFileFromHandle` がもはやそれを呼ばないため、新しいモックを指し直すことでしか
維持できず、それは再び「ある関数が別の関数に引数を渡す」ことだけをアサートする。
名目上カバーしていた挙動は、`read-text-range.test.ts` で実際のファイルに対して、
`workspace-file-system.test.ts` で実際の境界に対してテストされている。隣の引数検証
テストは保持 — モックを必要としない。

## フォローアップ

`chunksFromHandle` は、バイトカーソルテキストページングが必要とした唯一の継ぎ目として
`from` パラメータを得た。フォローアップはこれを使って非ゼロのバイトオフセットからの
再開を行う。
