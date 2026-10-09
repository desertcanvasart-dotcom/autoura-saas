# Fonts for server-rendered PDFs

`NotoSansJP-Regular.ttf` and `NotoSansJP-Bold.ttf` (SIL Open Font License,
see `OFL.txt`) are registered by `lib/pdf/quote-fonts.ts` for the quote PDFs
(`components/pdf/*`). Helvetica, the built-in face, is Latin-1 only: a
Japanese or Russian client name, trip name or note came out garbled.

Noto Sans JP covers Latin, Cyrillic, Greek and Japanese. It has no Hangul
and only part of simplified Chinese, and the PDF library does not shape
right-to-left scripts correctly, so Arabic is not supported.

`next.config.js` includes this folder in the traced output of the PDF
routes (`outputFileTracingIncludes`), so serverless builds ship the files.
