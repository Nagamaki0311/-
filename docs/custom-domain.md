# Cloudflareで人生年表メーカーを公開する

公開先は `https://jinsei-yama-tani-maker.nk-pr.com` です。Sitesには登録済みです。Cloudflareでレコードを追加し、Sitesでドメインと証明書の有効化を確認します。

1. Cloudflareにログインし、ドメイン一覧から **nk-pr.com** を選びます。
2. **DNS → レコード → レコードを追加** を開き、以下の3件を1件ずつ保存します。名前は `nk-pr.com` を除いた形で入力します。

| タイプ | 名前 | ターゲットまたはコンテンツ | 設定 |
| --- | --- | --- | --- |
| CNAME | `jinsei-yama-tani-maker` | `custom-domains.chatgpt.site` | DNSのみ（灰色の雲）、TTL自動 |
| TXT | `_openai-site-verification.jinsei-yama-tani-maker` | `openai-site-verification=VIUjgKGI5lCZXAtk1EkXMbLGGAWrT6_YeC2v6jgasgo` | TTL自動 |
| TXT | `_cf-custom-hostname.jinsei-yama-tani-maker` | `731275ac-152f-42cd-8aa1-da3fdb8492fc` | TTL自動 |

ルート（`@`）には、この公開のためのAレコードを追加する必要はありません。すでに同じサブドメイン名にA・AAAA・CNAMEがある場合は、用途を確認してから変更します。

3. Cloudflareに表示された完全名と値が上の表に一致することを確認します。
4. Sitesのカスタムドメイン画面で、対象サブドメインの状態を再確認します。DNSの反映後、ドメインとHTTPS証明書が有効になります。設定済みの確認レコードはそのまま残します。
5. プライベートブラウズで新URLを開き、証明書の警告なしで、ログインせず年表メーカーを使えることを確認します。

既存の下書きは、[従来URL](https://jinsei-yama-tani-maker.sprightlyferret32.chatgpt.site)で「編集データを保存」からJSONを書き出し、新URLの「データを読み込む」で移します。
