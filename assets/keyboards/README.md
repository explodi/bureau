# Controller text entry

`readings.json` is derived from Unicode 17.0.0's
[Unihan database](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip),
under the adjacent Unicode License V3. Rebuild it with
`python3 tools/unihan.py [downloaded-Unihan.zip]`.
The generator verifies the pinned archive's SHA-256.
Python 3 and Deno are required; Deno formats the generated JSON for the repository.

Simplified Chinese candidates cover the 8,105 characters in the 2013 Table of General
Standard Chinese Characters (`kTGH`). The readings combine `kMandarin`,
`kHanyuPinyin`, `kXHC1983` and `kHanyuPinlu`; frequency and then table order
rank candidates. Pinyin ignores tones and spells ü as `v`.

Traditional Chinese has a separate `zh-TW` map with Big5's 5,401 common
characters (`kBigFive`, A440–C67E), all covered by the bundled TC font.
It uses the same reading sources, including both regional `kMandarin` readings
where present; frequency and then Big5 order rank its candidates.
Rare characters outside this compact inventory require a system keyboard.
The [Taiwan CNS11643 reference](https://www.cns11643.gov.tw/pageView.jsp?ID=9&SN=&la=1&lang=tw)
documents the common-character block.

Japanese candidates cover the Jōyō and Jinmeiyō kanji, using `kJapanese`
kana readings. Jōyō characters precede name-only characters. Enter one
character's reading and choose its candidate, or insert the kana unchanged.
This is character conversion, not predictive word or sentence conversion.
Hiragana, katakana, modern Hangul composition and each shipped Latin
language's letters are supplied by the keyboard itself.

Property definitions and source attribution:
[Unicode Standard Annex #38](https://www.unicode.org/reports/tr38/tr38-39.html).
Steam and iPad system keyboards provide their platform's full input methods.
