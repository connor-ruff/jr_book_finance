export type DailySaleRow = {
  bookSid: string;
  bookVersionSid: string;
  bookTitle: string;
  saleSource: string;
  versionType: string;
  versionLanguage: string;
  marketplace: string;
  royaltyDate: string;
  royaltyUsd: number;
  netUnitsSold: number;
  pageReads: number;
};

export type DailySalesResponse = {
  data: DailySaleRow[];
};
