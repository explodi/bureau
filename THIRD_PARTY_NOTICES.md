# Third-party notices

Bureau's own code is MIT (`LICENSE`). What it stands on keeps its own terms.

## Fetched at build time

Pinned in `third_party/dependencies.cmake` and `third_party/hermes.pin.json`,
never committed here.

| Project                 | Licence               | Used for                 |
| ----------------------- | --------------------- | ------------------------ |
| Yoga                    | MIT                   | layout                   |
| FreeType                | FreeType License      | glyphs                   |
| HarfBuzz                | MIT-style ("Old MIT") | shaping                  |
| libunibreak             | zlib                  | line and word breaks     |
| stb_image               | MIT or public domain  | decoding pictures        |
| nanosvg                 | zlib                  | parsing SVG              |
| Vulkan-Headers          | Apache-2.0 or MIT     | the Vulkan backend       |
| Hermes                  | MIT                   | the JavaScript engine    |
| ICU (Linux, Android)    | Unicode License V3    | Hermes's Unicode support |
| React, react-reconciler | MIT                   | the UI                   |

## In this folder

| Path                   | Licence                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `third_party/doctest`  | MIT (`LICENSE.txt`)                                                                           |
| `third_party/nlohmann` | MIT (in `json.hpp`)                                                                           |
| `assets/keyboards`     | Unicode License V3 (`LICENSE.txt`), for the readings the on-screen keyboard draws from Unihan |

## Fonts, in `assets/fonts`

Fonts are not MIT. A game that ships one ships its licence with it.

SIL Open Font License 1.1 (`assets/fonts/SofiaSans-OFL.txt` holds its text):

| Font                             | Copyright                                      |
| -------------------------------- | ---------------------------------------------- |
| Jersey 25                        | 2023 The Soft Type Project Authors             |
| Sofia Sans                       | 2019 The Sofia Sans Project Authors            |
| Diffusion                        | 2015-2017 Belleve Invis                        |
| IBM Plex Sans, Serif and Sans KR | 2018-2020 IBM Corp.                            |
| Manufacturing Consent            | 2019 The Manufacturing Consent Project Authors |
| Noto Sans Symbols                | 2022 The Noto Project Authors                  |
| WDXL Lubrifont SC, TC, JPN       | 2025 The WDXL Lubrifont Project Authors        |

[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/):

| Font        | Copyright       |
| ----------- | --------------- |
| Bold Pixels | 2024 YukiPixels |

## Pictures, in `assets/icons`

Ninety of the controller glyphs are cropped from
[1-bit Pixel Icons](https://nikoichu.itch.io/pixel-icons) by Nikoichu, CC0 1.0.
The author asks for attribution and does not require it; thanks to them. The
other thirteen, the Steam Deck and Steam Controller trackpads and a few others,
were drawn for Bureau.
