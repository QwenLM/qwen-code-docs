# Hosted Workspace オペレーターリカバリ


この手順は、不完全な Hosted Shell キャプチャによりワークスペースリースを保持している、元のホスト上の Linux 永続ローカルプロセスワーカーに対してのみ使用してください。`prepare` と `complete` の間の再起動ではフェンスはクリアされません。オペレーターは、すべての潜在的なライターが停止しており再起動できないことを確認してから、`complete` で証明を提出する必要があります。リカバリにより、物理的なワークスペースが新しいセッションで利用可能になります。元の Shell 呼び出しの完了、再試行、または認定は行いません。

メンテナンスコマンドは `qwen-managed-agent-server-*-operator-recovery.jar` として提供されます。サービスの OS アカウントとして、サービスのデータベース設定、ランタイム資格情報キー、および `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY` を使用して、元のワーカーホストで実行します。このメンテナンスプロセスに対しては、`QWEN_MANAGED_AGENT_RUNTIME_DURABLE_LOCAL_PROCESS=true`、`QWEN_MANAGED_AGENT_RUNTIME_PROVISIONER=local-process`、および `QWEN_MANAGED_AGENT_RUNTIME_OPERATOR_RECOVERY_ENABLED=true` を設定します。データベースと資格情報の環境変数は非公開にしてください。コマンドを実行する前に、サービスのデータベースマイグレーションを適用します。このコマンドは HTTP リスナー、スケジューラー、またはワーカーを起動しません。

1. 影響を受けた実行の `runtime.runtimeBindingId` と `runtime.generation` を特定します。実行レコードが利用できない場合、認可された DBA は影響を受けた `tenant_id` と `workspace_id` に対して `qwen_runtime_binding` への読み取り専用クエリを使用し、`binding_id`、`runtime_generation`、`binding_state` を一覧表示できます。各候補を検査し、保持されたリースと Shell キャプチャが一致するもののみを使用します。`java -jar qwen-managed-agent-server-*-operator-recovery.jar inspect <bindingId> <generation>` を実行します。返された `holderKey`、ランタイムセッション、Shell 呼び出し、`captureStatus`、`captureReason` を記録します。リカバリには、保存された `producer_lost` Shell 結果と、正確でまだ保持されているワークスペースリースが必要です。サポートされていないレガシーワーカー、登録 ID の欠落、またはホルダーの欠落は、代替 ID レコードを作成しても修復できません。
2. `java -jar qwen-managed-agent-server-*-operator-recovery.jar prepare <bindingId> <generation> <holderKey> '<incident reason>'` を実行します。返された `recoveryId` を保存します。ライブまたはリカバリブロックされたバインディングは `OPERATOR_RECOVERY` としてフェンスされます。すでに LOST のバインディングは LOST のままとなり、バックグラウンドリカバリスキャンから除外されます。ワークスペースリースは解放されません。同じサービス OS アカウントと理由で繰り返すことは安全です。異なる記録済みアカウント、理由、世代、またはホルダーは拒否されます。人間のオペレーターはインシデントレコードに別途記録します。`operator_id` はコマンドを実行している OS アカウントを識別します。
3. 元のワーカーを停止し、デタッチされた子プロセスや外部スーパーバイザーを含む、ワークスペースへの**すべて**の潜在的なライターを検査します。元のワーカーとライターが再起動されないようにします。それらが停止したことを確認します。プロセスグループの終了、パイプ EOF、経過時間、および親 PID の喪失だけでは不十分です。これが確認できない場合は、ここで停止し、ワークスペースをフェンスされたままにします。
4. プライベートランタイム状態ディレクトリ直下に、通常ファイル（シンボリックリンクでない）の UTF-8 JSON ファイルを、最大 8 KiB、モード `0600` で作成します。以下のフィールドを正確に含めます（例の値を置き換えます）。

   ```json
   {
     "version": 1,
     "recoveryId": "<recoveryId>",
     "verifiedAt": "2026-09-29T03:00:00Z",
     "method": "host inspection",
     "actions": "Stopped worker and detached writers; disabled their external restart source; verified no writer remains",
     "restartPrevention": true
   }
   ```

   `verifiedAt` は、`prepare` 以降かつメンテナンスホストのクロックの 5 分以内の実際の UTC 検証時刻でなければなりません。具体的な手順と再起動防止の根拠を記録します。それらのチェックを完了する前にこの内容を書き込まないでください。ファイルとインシデントレコードは非公開にしてください。

5. `java -jar qwen-managed-agent-server-*-operator-recovery.jar complete <recoveryId> <absoluteEvidenceFile>` を実行します。このコマンドは、正確に保存されたワーカー ID と同じブートでのその不在を確認し、元のホストの再起動後は変更されたブート ID を確認します。その後、登録を tombstone し、不変のステートメントを永続化し、元のホルダーのみを回収します。クラッシュまたは一時的なデータベース障害の後、**同じファイル**で再試行できます。変更されたステートメントは拒否されます。成功時の出力は `completed` です。

完了後、**新しい**セッションを開始し、ワークスペースを使用できることを確認します。元のターンは別途検査します。部分的な出力と不確実な影響は不確実なままであり、Shell 呼び出しはリプレイされません。拒否を回避するために、SQL テーブルや登録ファイルを手動でクリアしないでください。元の登録が存在しないか破損している場合、またはワーカーが古いエフェメラルモードからの場合、この手順はサポートされていません。証拠を改ざんせず、保存された証拠とともにエスカレーションしてください。

ソフトウェアは登録されたワーカー ID と正確な SQL ホルダーを確認できますが、任意のエスケープした子プロセスが停止したことを証明することはできません。オペレーターのステートメントがその事実の信頼境界です。