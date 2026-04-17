export interface ItemDocument {
  source: string;
  text: string;
}

export interface ItemDocumentSet {
  id: string;
  type: string;
  documents: ItemDocument[];
}

export const itemDocuments: Record<string, ItemDocumentSet> = {
  inception: {
    id: "inception",
    type: "movie",
    documents: [
      {
        source: "plot",
        text:
          "Inception follows Dom Cobb, a thief who enters dreams to steal ideas. He is offered a chance to clear his criminal status by performing inception, the act of planting an idea in someone else's mind."
      },
      {
        source: "ending",
        text:
          "The ending features Cobb returning home and seeing his children. The spinning top keeps wobbling before the film cuts to black, leaving reality intentionally ambiguous."
      },
      {
        source: "themes",
        text:
          "The key themes include guilt, reality versus illusion, grief, and emotional closure. Cobb's journey moves from obsession with certainty toward acceptance and release."
      }
    ]
  },
  interstellar: {
    id: "interstellar",
    type: "movie",
    documents: [
      {
        source: "plot",
        text:
          "Interstellar follows Cooper, a former pilot, as he travels through a wormhole to find habitable worlds while Earth faces ecological collapse. The mission balances human survival against family sacrifice."
      },
      {
        source: "bookshelf",
        text:
          "The bookshelf sequence reveals a non-linear tesseract where Cooper can influence Murph's room through gravity. He transmits crucial data through the watch hand, completing a causal loop."
      },
      {
        source: "themes",
        text:
          "Themes include survival, sacrifice, parental love, and time dilation. The story frames emotional bonds as motivations that coexist with scientific problem solving."
      }
    ]
  }
};
