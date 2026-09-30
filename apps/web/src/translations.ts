/** Native language names and localized UI copy. English is the source language. */
export const languages = [
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "en", name: "English" },
  { code: "ja", name: "日本語" },
] as const;

/** Columns: English key | Simplified Chinese | Traditional Chinese | Japanese. */
export const translationRows = `
Use the local research client for this action.|请在本地研究客户端中操作|請在本地研究客戶端中操作|この操作はローカル研究クライアントで行ってください。
Topic|主题|主題|テーマ
Subproblem|子问题|子問題|小課題
Research attempts|研究尝试|研究嘗試|研究の試行
Research records|研究记录|研究紀錄|研究記録
Collaboration updates|协作动态|協作動態|共同研究の更新
Replication & review|复现与评审|重現與評審|再現とレビュー
Review|评审|評審|レビュー
Attachments|附件|附件|添付ファイル
Branches|分支|分支|分岐
Withdrawal|撤回|撤回|撤回
SELF-HOSTED TESTNET · 0.2|自建试验网 · 0.2|自建試驗網 · 0.2|自主運営テストネット · 0.2
Local research · offline|本地研究 · 离线|本地研究 · 離線|ローカル研究 · オフライン
Public explorer|公共浏览入口|公開瀏覽入口|公開エクスプローラー
Identity locked|身份已锁定|身分已鎖定|ID はロック中です
Main navigation|主导航|主導覽|メインナビゲーション
Explore & research|探索与研究|探索與研究|探索と研究
Network & subscriptions|网络与订阅|網路與訂閱|ネットワークと購読
Identity & agents|身份与 Agent|身分與 Agent|ID とエージェント
Migrate identity|旧身份迁移|舊身分遷移|旧 ID の移行
Working…|正在处理…|正在處理…|処理中…
Unlock your identity|解锁本地身份|解鎖本地身分|ローカル ID を解除
Create your identity|创建本地身份|建立本地身分|ローカル ID を作成
Your private key stays in the encrypted local vault. Connecting or saving never authorizes publication.|私钥保存在本地加密密钥库。连接网络与保存记录均不产生发布授权。|私鑰保存在本地加密金鑰庫。連接網路與儲存紀錄均不產生發佈授權。|秘密鍵はローカルの暗号化保管庫に保存されます。接続や保存だけでは公開は許可されません。
Identity unlocked|身份已解锁|身分已解鎖|ID のロックを解除しました
Name|名称|名稱|名前
Vault passphrase|密钥库口令|金鑰庫密語|保管庫のパスフレーズ
Unlock / create|解锁 / 创建|解鎖 / 建立|解除 / 作成
Search topics|搜索主题|搜尋主題|テーマを検索
Search a topic, question, or research direction|搜索主题、问题或研究方向|搜尋主題、問題或研究方向|テーマ、問い、研究分野を検索
Search indexes|查询公共索引|查詢公開索引|索引を検索
Public index URL|公共索引地址|公開索引位址|公開索引の URL
Source: {source} · coverage limited to this index|索引来源：{source} · 仅覆盖该索引|索引來源：{source} · 僅涵蓋該索引|出典：{source} · この索引の範囲のみ
Browse, search, and share approved research. Use the Sidelore local client to subscribe, research, and preview publications.|浏览、搜索与分享已批准的研究。请使用 Sidelore 本地客户端订阅、开展研究和预览发布。|瀏覽、搜尋與分享已批准的研究。請使用 Sidelore 本地客戶端訂閱、開展研究和預覽發佈。|承認済みの研究を閲覧・検索・共有できます。購読、研究、公開プレビューには Sidelore ローカルクライアントをお使いください。
Open questions|开放的问题|開放的問題|未解決の問い
Explore in parallel. Keep the counterexamples and failures.|并行尝试，保留反例与失败证据。|並行嘗試，保留反例與失敗證據。|並行して試し、反例や失敗の証拠を残しましょう。
Unable to load this topic.|主题读取失败|主題讀取失敗|テーマを読み込めませんでした。
Interdisciplinary|跨领域|跨領域|分野横断
Create your first topic or import a shared topic link.|创建第一个主题，或导入主题分享链接开始。|建立第一個主題，或匯入主題分享連結開始。|最初のテーマを作成するか、共有リンクを読み込んでください。
Unsubscribed|已取消订阅|已取消訂閱|購読を解除しました
Subscribed. This does not start research or announce participation.|已订阅；不会自动开展研究或发布参与声明|已訂閱；不會自動開展研究或發佈參與聲明|購読しました。研究の開始や参加表明の公開は自動では行われません。
Unsubscribe|取消订阅|取消訂閱|購読を解除
Subscribe to topic|订阅主题|訂閱主題|テーマを購読
Share link copied|分享链接已复制|分享連結已複製|共有リンクをコピーしました
Copy share link|复制分享链接|複製分享連結|共有リンクをコピー
Subproblems · parallel attempts welcome|子问题 · 允许并行尝试|子問題 · 允許並行嘗試|小課題 · 並行した試行を歓迎
Handoffs & progress|交接与进展|交接與進展|引き継ぎと進捗
Replication, counterexamples & reviews|复现、反例与评审|重現、反例與評審|再現・反例・レビュー
Select a topic to explore its subproblems, attempts, and reviews.|选择一个主题，查看子问题、研究尝试与评审。|選擇一個主題，查看子問題、研究嘗試與評審。|テーマを選び、小課題、試行、レビューを確認してください。
Local research workspace|本地研究工作区|本地研究工作區|ローカル研究ワークスペース
New work stays on this device. For failures, explain why the hypothesis or method failed; logs can support the evidence.|所有新内容先保存在本机。失败记录请描述假设或方法为什么失败；运行日志可作为证据。|所有新內容先儲存在本機。失敗紀錄請描述假設或方法為何失敗；執行日誌可作為證據。|新しい内容はまずこの端末に保存されます。失敗の記録には仮説や手法が失敗した理由を書き、ログは補足の証拠として使ってください。
Workspace|工作区|工作區|ワークスペース
Approval each time|逐次确认|逐次確認|毎回承認
Public research task|公开研究任务|公開研究任務|公開研究タスク
Saved locally. Select records below to preview a publication.|已保存到本地，请在下方选择记录预览发布|已儲存到本地，請在下方選擇紀錄預覽發佈|ローカルに保存しました。下で記録を選び、公開内容を確認してください。
Record type|记录类型|紀錄類型|記録の種類
New topic|新主题|新主題|新しいテーマ
Attempt / failure evidence|研究尝试 / 失败证据|研究嘗試 / 失敗證據|研究の試行 / 失敗の証拠
Add a research record|补充研究记录|補充研究紀錄|研究記録を追加
Progress / handoff|进展 / 交接|進展 / 交接|進捗 / 引き継ぎ
Replication / review|复现 / 评审|重現 / 評審|再現 / レビュー
Topic:|所属主题：|所屬主題：|テーマ：
Select a topic first|请先选择主题|請先選擇主題|まずテーマを選んでください
Research question|研究问题|研究問題|研究の問い
Context|背景|背景|背景
Title|标题|標題|タイトル
Problem statement|问题描述|問題描述|課題の説明
Research notes|研究内容|研究內容|研究内容
Attachments (optional, up to 7 MiB total)|附件（可选，合计不超过 7 MiB）|附件（選填，合計不超過 7 MiB）|添付ファイル（任意、合計 7 MiB まで）
Attachments exceed 7 MiB.|附件超过 7 MiB|附件超過 7 MiB|添付ファイルが 7 MiB を超えています。
Evidence type|证据类型|證據類型|証拠の種類
Hypothesis|假设|假設|仮説
Experiment|实验|實驗|実験
Failure evidence|失败证据|失敗證據|失敗の証拠
Counterexample|反例|反例|反例
Result|研究结果|研究結果|研究結果
Open question|未解决问题|未解決問題|未解決の問い
Activity|活动|活動|活動
Start an independent attempt|独立开始尝试|獨立開始嘗試|独立した試行を開始
Request a handoff|请求交接|請求交接|引き継ぎを依頼
Progress summary|进展摘要|進展摘要|進捗の概要
Challenge a claim|提出质疑|提出質疑|疑問を提示
Evidence note|证据说明|證據說明|証拠の説明
Review conclusion|评审结论|評審結論|レビューの結論
Replicated|已复现|已重現|再現済み
Partially replicated|部分复现|部分重現|一部再現
Challenged|提出反例|提出反例|反例を提示
Not reproducible|无法复现|無法重現|再現できず
Corrected|更正|更正|訂正済み
Replication method|复现方法|重現方法|再現方法
Results & evidence|结果与证据|結果與證據|結果と証拠
Subproblem (optional)|子问题（可选）|子問題（選填）|小課題（任意）
Entire topic|整个主题|整個主題|テーマ全体
Save locally|保存到本地|儲存到本地|ローカルに保存
Choose records to share|选择本次发布的记录|選擇本次發佈的紀錄|今回公開する記録を選択
Destination network|接收网络|接收網路|送信先ネットワーク
Select a network|选择网络|選擇網路|ネットワークを選択
Freeze & preview|冻结内容并预览|凍結內容並預覽|内容を固定してプレビュー
Preview Bridge snapshot|Bridge 快照预览|Bridge 快照預覽|Bridge スナップショットを確認
Publish with permission|受控发布|受控發佈|承認に基づく公開
Approval applies to the complete snapshot. Any edit needs a new preview. Once transmitted, withdrawal cannot guarantee deletion of other nodes’ copies.|批准绑定完整快照；任何修改都需要重新准备。已传播的内容只能请求撤回，不能保证删除其他节点副本。|批准綁定完整快照；任何修改都需要重新準備。已傳播的內容只能請求撤回，不能保證刪除其他節點副本。|承認は完全なスナップショットに適用されます。編集後は再確認が必要です。送信後の撤回では、他のノードのコピーの削除は保証できません。
Publication preview|发布前预览|發佈前預覽|公開前のプレビュー
Content CID|内容 CID|內容 CID|コンテンツ CID
Size|大小|大小|サイズ
{count} bytes|{count} 字节|{count} 位元組|{count} バイト
Includes {count} already-approved dependencies|补齐 {count} 条已批准依赖|補齊 {count} 條已批准相依紀錄|承認済みの依存記録 {count} 件を含みます
I have checked the content, attachments, filenames, references, and destination network. I approve this immutable snapshot.|我已检查正文、附件、文件名、引用和接收网络，批准这个不可变快照。|我已檢查正文、附件、檔名、引用和接收網路，批准這個不可變快照。|本文、添付ファイル、ファイル名、参照、送信先ネットワークを確認し、この変更不可のスナップショットを承認します。
Approved. Waiting for transmission and confirmation from other nodes.|已获准发布，等待传播与其他节点确认|已獲准發佈，等待傳播與其他節點確認|公開を承認しました。送信と他のノードの受信確認を待っています。
Approve this snapshot|批准此快照|批准此快照|このスナップショットを承認
Review later|稍后处理|稍後處理|あとで確認
{count} records|{count} 条记录|{count} 條紀錄|{count} 件の記録
No other node has confirmed receipt. This content may still exist only on your device.|尚未收到其他节点确认，内容仍可能只存在本机。|尚未收到其他節點確認，內容仍可能只存在本機。|他のノードの受信確認はまだありません。内容はこの端末にしか存在しない可能性があります。
Export approved Bridge|导出已批准 Bridge|匯出已批准 Bridge|承認済み Bridge を書き出す
Preview & approve|预览并确认|預覽並確認|確認して承認
Forwarding stopped on this node and a withdrawal request was recorded. Other copies may remain.|已停止本节点转发并记录撤回请求；其他副本可能仍存在|已停止本節點轉發並記錄撤回請求；其他副本可能仍存在|このノードの転送を停止し、撤回依頼を記録しました。他のコピーは残る場合があります。
Unsent publication cancelled|尚未传播的发布已取消|尚未傳播的發佈已取消|未送信の公開を取り消しました
Request withdrawal|请求撤回|請求撤回|撤回を依頼
Cancel publication|取消发布|取消發佈|公開を取り消す
Connect to your research network|连接你的研究网络|連接你的研究網路|研究ネットワークに接続
Clients need no domain or public endpoint. This release uses a self-hosted testnet; add bootstrap nodes supplied by an operator.|普通客户端无需域名或公网入口。当前发行版使用自建试验网；请导入运营者提供的引导节点。|一般客戶端無需網域或公網入口。目前版本使用自建試驗網；請匯入營運者提供的引導節點。|クライアントにドメインや公開エンドポイントは不要です。この版は自主運営テストネット用です。運営者のブートストラップノードを追加してください。
Network profile|网络配置|網路設定|ネットワーク設定
Local research|本地研究|本地研究|ローカル研究
Network started. Offline work remains on your device.|网络已启动，离线内容仍保留在本地|網路已啟動，離線內容仍保留在本地|ネットワークを起動しました。オフラインの作業は端末に保持されます。
Connect|连接网络|連接網路|接続
Disconnected|已断开|已中斷連線|切断しました
Disconnect|断开|中斷連線|切断
Sync complete|同步完成|同步完成|同期が完了しました
Sync now|立即同步|立即同步|今すぐ同期
Add bootstrap nodes / organization network|添加替代引导节点 / 组织网络|新增替代引導節點 / 組織網路|代替ノード / 組織ネットワークを追加
Network profile saved; not connected yet.|网络配置已保存；尚未连接|網路設定已儲存；尚未連接|ネットワーク設定を保存しました。まだ接続していません。
Network ID|网络 ID|網路 ID|ネットワーク ID
Type|类型|類型|種類
Public network|公开网络|公開網路|公開ネットワーク
Organization network (separate storage)|组织网络（独立存储）|組織網路（獨立儲存）|組織ネットワーク（独立した保存領域）
Bootstrap / relay multiaddresses|引导 / 中继 Multiaddr|引導 / 中繼 Multiaddr|ブートストラップ / リレーの Multiaddr
One multiaddress per line|每行一个 multiaddr|每行一個 multiaddr|1 行に 1 つの Multiaddr
Public index URLs (leave empty for organizations)|公共索引 URL（组织网络留空）|公開索引 URL（組織網路留空）|公開索引の URL（組織ネットワークでは空欄）
Organization member peer IDs|组织成员 Peer ID|組織成員 Peer ID|組織メンバーの Peer ID
Automatic cache limit (MiB)|自动缓存上限 MiB|自動快取上限 MiB|自動キャッシュの上限（MiB）
Save profile|保存配置|儲存設定|設定を保存
Import a shared topic|导入主题分享链接|匯入主題分享連結|テーマの共有リンクを読み込む
Subscribed to the shared topic|已订阅分享的主题|已訂閱分享的主題|共有されたテーマを購読しました
Topic share link|主题分享链接|主題分享連結|テーマの共有リンク
Subscribe|订阅|訂閱|購読
Subscriptions & sync progress|订阅与同步进度|訂閱與同步進度|購読と同期の進捗
· Last synced|· 上次同步|· 上次同步|· 最終同期
Not synced yet|尚未同步|尚未同步|未同期
Cache limit:|缓存上限：|快取上限：|キャッシュの上限：
MiB · attachments download on demand|MiB · 附件按需下载|MiB · 附件按需下載|MiB · 添付ファイルは必要時にダウンロード
Identity, recovery & task permissions|身份、恢复与任务授权|身分、復原與任務授權|ID・復元・タスクの権限
Export local research backup|导出本地研究备份|匯出本地研究備份|ローカル研究をバックアップ
Lock identity|锁定身份|鎖定身分|ID をロック
Research backups may contain private material. Restoring does not re-enable networking or automatic publication grants.|研究备份可能包含私有资料。恢复不会恢复联网或自动发布授权。|研究備份可能包含私有資料。復原不會恢復連網或自動發佈授權。|研究のバックアップには非公開資料が含まれる場合があります。復元してもネット接続や自動公開の権限は再開されません。
New identity-backup passphrase (store separately)|新的身份备份口令（请单独保存）|新的身分備份密語（請單獨保存）|ID バックアップの新しいパスフレーズ（別途保管）
Export encrypted identity backup|导出加密身份备份|匯出加密身分備份|暗号化した ID を書き出す
Restore research backup|恢复研究备份|復原研究備份|研究のバックアップを復元
Restored locally. Automatic connections and grants were disabled.|已恢复到本地并关闭自动连接与授权|已復原到本地並關閉自動連接與授權|ローカルに復元し、自動接続と自動公開権限を無効にしました。
Restore encrypted identity|恢复加密身份|復原加密身分|暗号化した ID を復元
Identity restored. The network remains disconnected.|身份恢复成功，网络保持断开|身分復原成功，網路保持中斷|ID を復元しました。ネットワークは切断されたままです。
Encrypted backup|加密备份|加密備份|暗号化バックアップ
Identity ID (optional for a single identity)|Identity ID（单个身份可留空）|Identity ID（單個身分可留空）|Identity ID（ID が 1 つの場合は省略可）
Original passphrase|原口令|原密語|元のパスフレーズ
Verify & restore|验证并恢复|驗證並復原|検証して復元
A legacy browser identity was found. Old storage is cleared only after local vault verification succeeds.|检测到旧浏览器身份。只有本地密钥库验证成功后才会清理旧存储。|偵測到舊瀏覽器身分。只有本地金鑰庫驗證成功後才會清理舊儲存。|旧ブラウザー ID が見つかりました。ローカル保管庫での検証に成功した後にだけ旧データを削除します。
Legacy identity moved to the encrypted vault|旧身份已迁入加密密钥库|舊身分已遷入加密金鑰庫|旧 ID を暗号化保管庫に移行しました
Migration passphrase|迁移口令|遷移密語|移行用パスフレーズ
Verify & migrate|验证并迁移|驗證並遷移|検証して移行
Export for local migration|导出供本地迁移|匯出供本地遷移|ローカル移行用に書き出す
Organization Bridge|组织 Bridge|組織 Bridge|組織 Bridge
Enabling only allows snapshot preparation. Every transfer between networks needs its own preview and approval.|启用仅允许准备快照；每次跨网络转移都必须单独预览并批准。|啟用僅允許準備快照；每次跨網路轉移都必須單獨預覽並批准。|有効化されるのはスナップショットの準備だけです。ネットワーク間の転送には毎回個別の確認と承認が必要です。
Bridge enabled; no content has been approved for transfer.|Bridge 已启用；尚未批准发送任何内容|Bridge 已啟用；尚未批准傳送任何內容|Bridge を有効にしました。転送が承認された内容はまだありません。
Enable Bridge|启用 Bridge|啟用 Bridge|Bridge を有効化
Import an approved Bridge snapshot|导入已批准的 Bridge 快照|匯入已批准的 Bridge 快照|承認済み Bridge スナップショットを読み込む
Destination-network snapshot verified and imported|已验证并导入目标网络快照|已驗證並匯入目標網路快照|送信先ネットワークのスナップショットを検証し、読み込みました
New workspace|新建工作区|新增工作區|ワークスペースを作成
Workspace created. Its classification cannot be changed.|工作区已创建；类型创建后不可更改|工作區已建立；類型建立後不可更改|ワークスペースを作成しました。作成後に分類は変更できません。
Research material scope|研究资料范围|研究資料範圍|研究資料の範囲
May access private material: human approval every time|可能接触私有资料：每次人工确认|可能接觸私有資料：每次人工確認|非公開資料に触れる可能性あり：毎回人が承認
Explicitly designated public research task|明确指定的公开研究任务|明確指定的公開研究任務|明示的に指定した公開研究タスク
Create workspace|创建工作区|建立工作區|ワークスペースを作成
Agent access|Agent 接入|Agent 接入|エージェントの接続
Allowed workspace|限定工作区|限定工作區|許可するワークスペース
Create scoped credential|创建受限凭据|建立受限憑證|範囲を限定した認証情報を作成
This credential is shown locally only. Agents cannot give human approval or manage grants.|此凭据仅显示在本地。Agent 无人工批准与授权管理权限。|此憑證僅顯示在本地。Agent 無人工批准與授權管理權限。|この認証情報はローカルにのみ表示されます。エージェントは人による承認や権限管理を行えません。
Hide credential|隐藏凭据|隱藏憑證|認証情報を隠す
Allow automatic publication for a scoped task|授予限定任务的自动发布权限|授予限定任務的自動發佈權限|限定したタスクに自動公開を許可
Task grant created; attachments are excluded by default.|任务授权已创建；默认不包含附件|任務授權已建立；預設不包含附件|タスクの権限を作成しました。添付ファイルは標準では含まれません。
Public research workspace|公开研究工作区|公開研究工作區|公開研究ワークスペース
Target network|目标网络|目標網路|対象ネットワーク
Allowed content type|允许的内容类型|允許的內容類型|許可する内容の種類
Research progress / handoff|研究进展 / 交接|研究進展 / 交接|研究の進捗 / 引き継ぎ
Expires at|有效期|有效期限|有効期限
Publication limit|数量上限|數量上限|公開件数の上限
Total size limit (KiB)|总大小上限 KiB|總大小上限 KiB|合計サイズの上限（KiB）
Grant task permission|授予任务权限|授予任務權限|タスクの権限を付与
uses · expires|次 · 有效至|次 · 有效至|回 · 有効期限
Revoked|已撤销|已撤銷|失効済み
Scope checked on use|按范围检查|按範圍檢查|使用時に範囲を確認
Grant revoked|授权已撤销|授權已撤銷|権限を取り消しました
Revoke|撤销|撤銷|権限を取り消す
Move your legacy identity to the local vault|把旧身份迁入本地密钥库|把舊身分遷入本地金鑰庫|旧 ID をローカル保管庫へ移行
Export an encrypted migration file, verify and restore it under Identity & agents in the desktop client, then import the receipt. The old browser identity is removed only after the receipt is verified.|导出加密迁移文件，在桌面端“身份与 Agent”中验证恢复，再导入验证回执。只有回执核验成功后，才清理这里的旧身份。|匯出加密遷移檔案，在桌面端「身分與 Agent」中驗證復原，再匯入驗證回執。只有回執核驗成功後，才清理這裡的舊身分。|暗号化した移行ファイルを書き出し、デスクトップの「ID とエージェント」で検証・復元してから、検証結果を読み込んでください。検証結果の確認後にだけ旧ブラウザー ID を削除します。
No legacy identity found.|没有旧身份|沒有舊身分|旧 ID が見つかりません。
Migration file passphrase|迁移文件口令|遷移檔案密語|移行ファイルのパスフレーズ
Export encrypted migration file|导出加密迁移文件|匯出加密遷移檔案|暗号化した移行ファイルを書き出す
Import desktop verification receipt|导入桌面端验证回执|匯入桌面端驗證回執|デスクトップの検証結果を読み込む
Receipt verification failed; the old identity was kept.|迁移回执验证失败；旧身份已保留|遷移回執驗證失敗；舊身分已保留|検証結果を確認できませんでした。旧 ID は保持されています。
Local migration verified; the old browser identity was removed.|本地迁移已验证，旧浏览器身份已清理|本地遷移已驗證，舊瀏覽器身分已清理|ローカル移行を検証し、旧ブラウザー ID を削除しました。
Agent ID|Agent ID|Agent ID|エージェント ID
{network} · Last synced: {date}|{network} · 上次同步：{date}|{network} · 上次同步：{date}|{network} · 最終同期：{date}
Cache limit: {count} MiB · attachments download on demand|缓存上限：{count} MiB · 附件按需下载|快取上限：{count} MiB · 附件按需下載|キャッシュ上限：{count} MiB · 添付ファイルは必要時にダウンロード
Used {used}/{max} · expires {date}|已用 {used}/{max} 次 · 有效至 {date}|已用 {used}/{max} 次 · 有效至 {date}|使用済み {used}/{max} 回 · 有効期限 {date}
A secret-like string may be present. Review it carefully.|可能包含密钥或令牌，请仔细检查。|可能包含金鑰或權杖，請仔細檢查。|鍵やトークンが含まれる可能性があります。慎重に確認してください。
An email address or long numeric identifier may be present. Check for personal information.|可能包含邮箱或长数字标识，请检查个人信息。|可能包含電子郵件或長數字識別碼，請檢查個人資訊。|メールアドレスや長い数字の識別子が含まれる可能性があります。個人情報を確認してください。
No artifact or record license was supplied.|尚未提供附件或记录的许可说明。|尚未提供附件或紀錄的授權說明。|添付ファイルや記録のライセンスが指定されていません。
Attachments exceed the 100 MiB review threshold.|附件超过 100 MiB，需要额外检查。|附件超過 100 MiB，需要額外檢查。|添付ファイルが 100 MiB の確認しきい値を超えています。
An attachment exceeds the automatic inspection limit. Review it manually.|附件超过自动内容检查上限，请人工检查。|附件超過自動內容檢查上限，請人工檢查。|添付ファイルが自動検査の上限を超えています。手動で確認してください。
Research workspace|研究工作台|研究工作臺|研究ワークスペース
Every attempt moves the question forward.|每一次尝试，都让问题更进一步。|每一次嘗試，都讓問題更進一步。|一つひとつの試行が、問いを前に進めます。
Publication queue|发布队列|發佈佇列|公開キュー
Review your work before sharing it with the commons.|先检查内容，再让研究走向共同体。|先檢查內容，再讓研究走向共同體。|内容を確認してから、共同体へ共有しましょう。
Connect with peers. Follow questions worth pursuing.|连接同行，关注值得继续的问题。|連接同儕，關注值得繼續的問題。|仲間とつながり、追究したい問いを見つけましょう。
Manage your identity, workspaces, and research assistants.|管理你的身份、工作区和研究助手。|管理你的身分、工作區和研究助手。|ID、ワークスペース、研究アシスタントを管理します。
Keep your research identity with you.|安全延续你的研究身份。|安全延續你的研究身分。|研究者としての ID を安全に引き継ぎます。
Skip to content|跳到内容|跳到內容|コンテンツへ移動
Research commons|研究共同体|研究共同體|研究の共有地
WORKSPACE|工作空间|工作空間|ワークスペース
Local by default|研究先留在本地|研究先留在本地|研究はまずローカルに
You decide when to share.|由你决定何时分享。|由你決定何時分享。|共有のタイミングはあなたが決めます。
Local identity|本地身份|本地身分|ローカル ID
Read-only explorer|只读浏览|唯讀瀏覽|閲覧専用
Connected|已连接|已連接|接続済み
Interface language|界面语言|介面語言|表示言語
Switch to light theme|切换为浅色|切換為淺色|ライトテーマに切り替え
Switch to dark theme|切换为深色|切換為深色|ダークテーマに切り替え
Technical details|技术详情|技術詳情|技術的な詳細
Decentralized research network. Shared evidence.|去中心化研究网络，共享证据。|去中心化研究網路，共享證據。|分散型研究ネットワーク。証拠を共有する。
Publication requires explicit permission|公开内容需明确授权|公開內容需明確授權|公開には明示的な承認が必要です
Research topics|研究主题|研究主題|研究テーマ
Subscriptions|已订阅|已訂閱|購読中
Pending publications|待确认发布|待確認發佈|承認待ち
Start with a good question|从一个好问题开始|從一個好問題開始|よい問いから始めよう
Room for the next discovery|为下一次发现留一个位置|為下一次發現留一個位置|次の発見のための場所
RECORD & REFLECT|记录与思考|紀錄與思考|記録と思考
Only selected records enter the preview. Saving does not publish.|仅所选记录进入预览，保存不会自动发布。|僅所選紀錄進入預覽，儲存不會自動發佈。|選択した記録だけを確認画面に含めます。保存だけでは公開されません。
Selected: {count}|已选择 {count} 条|已選擇 {count} 條|{count} 件を選択中
After saving your research, choose what to share here.|保存研究后，可在这里选择要分享的内容。|儲存研究後，可在這裡選擇要分享的內容。|研究を保存したら、ここで共有する内容を選べます。
Content CID & destination network ID|内容 CID 与接收网络标识|內容 CID 與接收網路識別碼|コンテンツ CID と送信先ネットワーク ID
Your research. Your moment to share.|你的研究，由你决定何时分享|你的研究，由你決定何時分享|研究をいつ共有するかは、あなたが決める
Select records in your workspace, preview them, then approve publication.|在研究工作区选择记录，预览后再批准发布。|在研究工作區選擇紀錄，預覽後再批准發佈。|ワークスペースで記録を選び、内容を確認してから公開を承認してください。
Research contribution|研究成果|研究成果|研究成果
Approved for publication|获准发布|獲准發佈|公開承認
Transmitted|已传播|已傳播|送信
Sent|已发送|已傳送|送信済み
Waiting to send|等待发送|等待傳送|送信待ち
Received by peers|其他节点接收|其他節點接收|他のノードが受信
{count} peers|{count} 个节点|{count} 個節點|{count} ノード
Signature & transmission details|签名与传播详情|簽章與傳播詳情|署名と送信の詳細
Not transmitted yet|尚未传播|尚未傳播|未送信
Offline|离线|離線|オフライン
Connection|连接状态|連線狀態|接続状態
Connected peers|已连接节点|已連接節點|接続中のノード
Bootstrap nodes|引导节点|引導節點|ブートストラップノード
Cache limit|缓存上限|快取上限|キャッシュの上限
Connection diagnostics|连接技术详情|連線技術詳情|接続の技術情報
Follow a question worth pursuing|关注一个值得继续的问题|關注一個值得繼續的問題|追究したい問いを購読しよう
Subscriptions sync updates. They do not start research or announce your participation.|订阅只同步更新，不会启动研究或公开你的参与。|訂閱只同步更新，不會啟動研究或公開你的參與。|購読は更新の同期のみを行います。研究の開始や参加の公開は行いません。
Language and appearance stay on this device. Research content is never translated or changed.|语言和外观只保存在此设备，不会改变研究原文。|語言和外觀只儲存在此裝置，不會改變研究原文。|言語と外観の設定はこの端末にのみ保存され、研究の原文は変更されません。
Identity & backups|身份与备份|身分與備份|ID とバックアップ
Workspaces|工作区管理|工作區管理|ワークスペースの管理
Agent access & permissions|Agent 接入与授权|Agent 接入與授權|エージェントの接続と権限
No records yet. Leave the first step of an exploration.|这里还没有记录，欢迎留下第一步探索。|這裡還沒有紀錄，歡迎留下第一步探索。|まだ記録がありません。最初の探索を残しましょう。
Unnamed attachment|未命名附件|未命名附件|名前のない添付ファイル
Full snapshot & references|完整快照与引用详情|完整快照與引用詳情|完全なスナップショットと参照
All signed fields, identities, references, and dependencies are included. Approval remains bound to this complete snapshot.|包含所有签名字段、身份、引用和依赖；批准仍绑定此完整快照。|包含所有簽章欄位、身分、引用和相依紀錄；批准仍綁定此完整快照。|署名済みの全フィールド、ID、参照、依存記録を含みます。承認はこの完全なスナップショットに適用されます。
Open|开放中|開放中|未解決
Active|研究中|研究中|研究中
Blocked|遇到阻碍|遇到阻礙|進行困難
Solved|已解决|已解決|解決済み
Reopened|重新开放|重新開放|再開
Retired|已归档|已封存|終了
Draft|草稿|草稿|下書き
Negative result|否定结果|否定結果|否定的な結果
Unresolved|待解决|待解決|未解決
Partial|部分完成|部分完成|一部完了
Reframed|重新表述|重新表述|問いを再構成
Withdrawn|已撤回|已撤回|撤回済み
Author claim|作者声明|作者聲明|著者による主張
Unverified|尚未验证|尚未驗證|未検証
Formally verified|已形式化验证|已形式化驗證|形式的検証済み
Seen|已阅|已閱|確認済み
Awaiting approval|待人工确认|待人工確認|承認待ち
Approved|已批准|已批准|承認済み
Cancelled|已取消|已取消|取消済み
Withdrawal requested|已请求撤回|已請求撤回|撤回依頼済み
Observation|观察|觀察|観察
Pivot|调整方向|調整方向|方向転換
Response|回应|回應|応答
Status update|状态更新|狀態更新|状態の更新
Organization network|组织网络|組織網路|組織ネットワーク
Local mode|本地模式|本地模式|ローカルモード
This action could not be completed. Check your input or connection and try again.|操作未完成，请检查输入或连接后重试。|操作未完成，請檢查輸入或連線後重試。|操作を完了できませんでした。入力や接続を確認して再度お試しください。
Unlock your local identity first.|请先解锁本地身份。|請先解鎖本地身分。|まずローカル ID のロックを解除してください。
Check your passphrase and backup file.|请检查口令和备份文件。|請檢查密語和備份檔案。|パスフレーズとバックアップファイルを確認してください。
Some references are not approved. Select the required records or prepare a new summary.|包含未批准的引用，请补充必要记录或准备新的摘要。|包含未批准的引用，請補充必要紀錄或準備新的摘要。|未承認の参照が含まれています。必要な記録を選択するか、新しい要約を作成してください。
The content changed or is no longer pending. Prepare a new preview.|内容已变化或不再待批准，请重新准备预览。|內容已變化或不再待批准，請重新準備預覽。|内容が変わったか、承認待ちではなくなりました。プレビューを作り直してください。
This action requires human authority. Use the local interface.|该操作需要人工权限，请从本地界面操作。|該操作需要人工權限，請從本地介面操作。|この操作には人の権限が必要です。ローカル画面から操作してください。
Connection unavailable. Check your network profile.|连接尚不可用，请检查网络配置。|連線尚不可用，請檢查網路設定。|接続できません。ネットワーク設定を確認してください。
The index is unavailable. Check its URL or try again later.|索引暂不可用，请检查地址或稍后重试。|索引暫不可用，請檢查位址或稍後重試。|索引を利用できません。URL を確認するか、しばらくしてから再試行してください。
This content may contain sensitive information. Review it before approving.|文件可能包含敏感内容，请检查后再批准。|檔案可能包含敏感內容，請檢查後再批准。|機密情報が含まれる可能性があります。承認前に確認してください。
`;
