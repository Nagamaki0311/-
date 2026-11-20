# Mediabunny 1.66.2

`mediabunny.js` は Mediabunny の動画出力に必要な API をまとめた ESM バンドルです。アプリと同じ配信元から、WebCodecs を使用して動画を書き出す際に読み込みます。

- [MPL 2.0 ライセンス](mediabunny.LICENSE)
- [対応するソースコード（配布された npm パッケージ）](https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.2.tgz)
- npm tarball integrity `sha512-NTzRrBhAyRVi8qpJ9AH6XPyxiDVkfugxYY+gu3Z5zi+Nw2R/7nTAnXJEt2Ucy8wTIve1/UYGnCFf50x2LpvMDQ==`

バンドルを作り直す場合は、アプリの作業フォルダーとは別の空の作業フォルダーで以下を実行し、生成した `mediabunny.js` をこのフォルダーに置きます。通常の起動や配信では実行不要です。

```sh
npm install --no-save --ignore-scripts mediabunny@1.66.2 esbuild@0.27.0
printf "export { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, WebMOutputFormat, canEncodeVideo } from 'mediabunny';\n" > mux-entry.js
./node_modules/.bin/esbuild mux-entry.js --bundle --format=esm --platform=browser --target=es2022 --minify \
  --banner:js='/* Mediabunny 1.66.2 (MPL-2.0). Corresponding Source: https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.2.tgz */' \
  --outfile=mediabunny.js
```
