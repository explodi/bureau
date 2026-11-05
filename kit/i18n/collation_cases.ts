/**
 * Z5.3's literal lists, one per language: each `sorted` is what
 * `Intl.Collator(locale)` gives for `input`. The unit test holds `compareText`
 * to them in Deno, and the unicode bundle (`bureau_js_tests`) in Hermes.
 */
export const COLLATION_CASES: {
  locale: string;
  input: string[];
  sorted: string[];
}[] = [
  {
    locale: "nl",
    input: ["ijs", "IJssel", "ijzer", "yoga", "één", "een", "eend"],
    sorted: ["een", "één", "eend", "ijs", "IJssel", "ijzer", "yoga"],
  },
  {
    locale: "ru",
    input: ["яма", "Юг", "ель", "ёлка", "еж", "и", "й", "иена", "A", "Я"],
    sorted: ["еж", "ёлка", "ель", "и", "иена", "й", "Юг", "Я", "яма", "A"],
  },
  {
    locale: "uk",
    input: [
      "ґанок",
      "гора",
      "єнот",
      "ель",
      "їжа",
      "ікра",
      "йод",
      "инший",
      "А",
      "A",
    ],
    sorted: [
      "А",
      "гора",
      "ґанок",
      "ель",
      "єнот",
      "инший",
      "ікра",
      "їжа",
      "йод",
      "A",
    ],
  },
  {
    locale: "zh-TW",
    input: [
      "最低工資",
      "車輛登記",
      "罪惡稅",
      "公車票價",
      "月度GDP",
      "月度摘要",
    ],
    sorted: [
      "公車票價",
      "月度摘要",
      "月度GDP",
      "車輛登記",
      "最低工資",
      "罪惡稅",
    ],
  },
  {
    locale: "fi",
    input: ["Öljy", "Ääni", "Åland", "Zoo", "Vaasa", "Wien", "Aalto", "Yö"],
    sorted: ["Aalto", "Vaasa", "Wien", "Yö", "Zoo", "Åland", "Ääni", "Öljy"],
  },
  {
    locale: "de",
    input: ["Zucker", "Äpfel", "Apfel", "Öl", "Ofen", "Straße", "Strasse"],
    sorted: ["Apfel", "Äpfel", "Ofen", "Öl", "Strasse", "Straße", "Zucker"],
  },
  {
    locale: "en",
    input: ["banana", "Apple", "apple", "cherry-pie", "cherry pie", "2 roads"],
    sorted: ["2 roads", "apple", "Apple", "banana", "cherry pie", "cherry-pie"],
  },
  {
    locale: "es",
    input: ["ñu", "nube", "oso", "Ñandú", "nada", "¡Hola!", "Hola"],
    sorted: ["¡Hola!", "Hola", "nada", "nube", "Ñandú", "ñu", "oso"],
  },
  {
    locale: "fr",
    input: ["côte", "cote", "coté", "côté", "Sécurité", "Seguridad"],
    sorted: ["cote", "coté", "côte", "côté", "Sécurité", "Seguridad"],
  },
  {
    locale: "it",
    input: ["Zucchero", "àncora", "ancora", "Tassa ($)", "Tassa (%)"],
    sorted: ["ancora", "àncora", "Tassa (%)", "Tassa ($)", "Zucchero"],
  },
  {
    locale: "ja",
    input: [
      "路上駐車料金",
      "家賃統制",
      "最低賃金",
      "罪悪税",
      "ディーゼル",
      "ティア",
    ],
    sorted: [
      "ティア",
      "ディーゼル",
      "家賃統制",
      "最低賃金",
      "罪悪税",
      "路上駐車料金",
    ],
  },
  {
    locale: "ko",
    input: ["최저 임금", "공공 연금", "월간 GDP", "월간 요약", "관광세"],
    sorted: ["공공 연금", "관광세", "월간 요약", "월간 GDP", "최저 임금"],
  },
  {
    locale: "pl",
    input: ["łódź", "lody", "źle", "żaba", "zebra", "ćma", "cma"],
    sorted: ["cma", "ćma", "lody", "łódź", "zebra", "źle", "żaba"],
  },
  {
    locale: "pt",
    input: ["Água", "agua", "ação", "acaso", "Bem, acho", "Bem-vindo"],
    sorted: ["ação", "acaso", "agua", "Água", "Bem-vindo", "Bem, acho"],
  },
  {
    locale: "tr",
    input: [
      "ılık",
      "ilik",
      "Irmak",
      "İstanbul",
      "çay",
      "cay",
      "şeker",
      "sakız",
    ],
    sorted: [
      "cay",
      "çay",
      "ılık",
      "Irmak",
      "ilik",
      "İstanbul",
      "sakız",
      "şeker",
    ],
  },
  {
    locale: "zh",
    input: [
      "最低工资",
      "车辆登记",
      "罪恶税",
      "公交票价",
      "月度GDP",
      "月度摘要",
    ],
    sorted: [
      "车辆登记",
      "公交票价",
      "月度摘要",
      "月度GDP",
      "最低工资",
      "罪恶税",
    ],
  },
];
