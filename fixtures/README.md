# fixtures

- `sd2-sample.json`: vymyšlený export ze Speed Dial 2 (formát Preferences, System, Export settings) s veřejnými weby.
  5 skupin, 22 odkazů. Slouží pro testy a pro `?seed=fixture` ve vývoji. Pokrývá okrajové případy importu:
  - `id` skupin neodpovídá pořadí (řadí se podle `position`),
  - pozice 999 (nezařazeno, jde nakonec),
  - shodné pozice (skupina Hry, pak rozhoduje `ts_created`),
  - `title == url` a strojové titulky (`Seznam.cz`, `Youtube`, `Windy ?49.800,15.500,5`),
  - lidské titulky (skupina Videa),
  - náhledy živé (github, wikimedia), mrtvé (logo.clearbit.com) i prázdné.
