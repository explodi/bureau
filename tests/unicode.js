print(JSON.stringify([
  "ä".toUpperCase(),
  "é".normalize("NFD").length,
  "ﬁ".normalize("NFKC"),
]));
