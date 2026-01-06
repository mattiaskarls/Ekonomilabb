export type GlossaryEntry = {
  term: string;
  short?: string;
  definition: string;
  seeAlso?: string[];
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  "nettolön": {
    term: "nettolön",
    short: "Lön efter skatt.",
    definition:
      "Nettolön är den lön du får utbetald efter att skatt och eventuella avdrag dragits från bruttolönen.",
  },
    "bruttolön": {
    term: "bruttolön",
    short: "Lön före skatt.",
    definition:
      "Bruttolön är den lön du får utbetald före att skatt och eventuella avdrag dragits från bruttolönen.",
  },
    "årlig real avkastning": {
    term: "årlig real avkastning",
    short: "Avkastning efter inflation.",
    definition:
      "Årlig real avkastning är avkastningen efter att inflationen har tagits med i beräkningen. Dvs att den visar den verkliga köpkraften av din avkastning över tid.",
  },  
  "allmän pension": {
    term: "allmän pension",
    short: "Statlig pension (inkomst- och premiepension).",
    definition:
      "Allmän pension är den del av pensionen som kommer från staten och tjänas in genom arbete och beskattade inkomster.",
  },
  "nominell avkastning": {
    term: "nominell avkastning",
    short: "Avkastning utan inflationsjustering.",
    definition:
      "Nominell avkastning är avkastning mätt i pengar utan att ta hänsyn till inflation.",
    seeAlso: ["real avkastning", "inflation"],
  },
};
