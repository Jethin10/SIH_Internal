# Third-party notices

The visual OCR feature bundles Tesseract.js runtime files, Tesseract Core WebAssembly, English trained data, and regenerator-runtime components. Their original notices are retained beside the distributed files:

- `vendor/tesseract/*.LICENSE.txt`
- `vendor/tesseract-core/LICENSE.txt`

Tesseract Core is distributed under Apache License 2.0. The bundled regenerator-runtime notice identifies the MIT license. Review upstream Tesseract.js and trained-data licensing before commercial redistribution.

The independent PII evaluation fixture in `tests/pii-independent.json` contains transformed excerpts from Gretel's `synthetic_pii_finance_multilingual` dataset, revision `7b844d16738527a04264f50214cb426a4cea0897`. Gretel publishes that dataset under Apache License 2.0. The fixture records each source row, keeps only selected English test-split labels, normalizes whitespace, and truncates context. The Apache License 2.0 text is included at `vendor/tesseract-core/LICENSE.txt`.
