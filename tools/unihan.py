#!/usr/bin/env python3
"""Build character-reading candidates from the pinned Unicode Han database."""

import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import urllib.request
import zipfile

SOURCE = "https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip"
SHA256 = "f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e"
ROOT = Path(__file__).resolve().parents[1]


def pinyin(reading):
    reading = unicodedata.normalize("NFD", reading.lower()).replace("u\u0308", "v")
    return "".join(
        c for c in reading
        if "a" <= c <= "z"
    )


def hiragana(reading):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in unicodedata.normalize("NFC", reading))


def chinese_readings(fields):
    readings = fields.get("kMandarin", "").split()
    for field in ("kHanyuPinyin", "kXHC1983"):
        for entry in fields.get(field, "").split():
            readings.extend(entry.split(":")[-1].split(","))
    frequencies = re.findall(r"([a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)\((\d+)\)", fields.get("kHanyuPinlu", ""))
    frequency = {}
    for reading, count in frequencies:
        key = pinyin(reading)
        frequency[key] = max(frequency.get(key, 0), int(count))
    readings.extend(reading for reading, _ in frequencies)
    return set(pinyin(value) for value in readings) - {""}, frequency


def main():
    data = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(SOURCE).read()
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError("Unihan archive differs from the pinned Unicode 17 release")
    properties = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name in ("Unihan_Readings.txt", "Unihan_OtherMappings.txt"):
            for line in archive.read(name).decode("utf-8").splitlines():
                if not line or line.startswith("#"):
                    continue
                code, field, value = line.split("\t")
                properties.setdefault(chr(int(code[2:], 16)), {})[field] = value

    chinese = {}
    traditional_chinese = {}
    japanese = {}
    for character, fields in properties.items():
        big_five = fields.get("kBigFive", "")
        # The common Big5 block fits the bundled TC face; the extended set does not.
        traditional_common = len(big_five) == 4 and "A440" <= big_five <= "C67E"
        if "kTGH" in fields or traditional_common:
            readings, frequency = chinese_readings(fields)
            if "kTGH" in fields:
                rank = int(fields["kTGH"].split(":")[-1])
                for reading in readings:
                    chinese.setdefault(reading, []).append((-frequency.get(reading, 0), rank, character))
            if traditional_common:
                rank = int(big_five, 16)
                for reading in readings:
                    traditional_chinese.setdefault(reading, []).append((-frequency.get(reading, 0), rank, character))
        common = "kJoyoKanji" in fields
        if common or "kJinmeiyoKanji" in fields:
            for reading in set(hiragana(value) for value in fields.get("kJapanese", "").split()):
                japanese.setdefault(reading, []).append((not common, character))

    result = {
        "zh": {key: "".join(item[-1] for item in sorted(value)) for key, value in sorted(chinese.items())},
        "zh-TW": {key: "".join(item[-1] for item in sorted(value)) for key, value in sorted(traditional_chinese.items())},
        "ja": {key: "".join(item[-1] for item in sorted(value)) for key, value in sorted(japanese.items())},
    }
    output = ROOT / "assets/keyboards/readings.json"
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    subprocess.run(["deno", "fmt", str(output)], check=True)
    print(f"{output.relative_to(ROOT)}: {len(chinese)} SC pinyin readings, {len(traditional_chinese)} TC pinyin readings, {len(japanese)} kana readings, {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
