export type ConfigBook = {
  bookSid: number;
  title: string;
  series: string | null;
  seriesNo: number | null;
  isSet: boolean;
};

export type ConfigBookVersion = {
  bookVersionSid: number;
  bookSid: number;
  bookTitle: string;
  bookVersionUniqueId: string;
  bookVersionUniqueIdType: string;
  versionTitle: string;
  versionType: string;
  versionLanguage: string;
};

export type ConfigMarketplace = {
  amazonName: string;
  country: string;
  currency: string;
};

export type ConfigKenpRate = {
  monthBeginDate: string;
  country: string;
  kenpRate: number | null;
  isFinal: boolean;
};

export type ConfigForexRate = {
  monthBeginDate: string;
  sourceCurrency: string;
  targetCurrency: string;
  exchangeRate: number;
  isFinal: boolean;
};

export type ConfigCrosswalk = {
  rawTableName: string;
  rawColumnNumber: number;
  rawColumnName: string;
  targetTableName: string;
  targetColumnName: string;
  targetDataType: string;
};

export type ConfigSourceTableInfo = {
  rawTableName: string;
  targetTableName: string;
  s3StageName: string;
  fileFormatName: string;
  copyToS3ProcCall: string;
  mergeToTargetProcCall: string;
};

export type ConfigAuditDpRun = {
  dpRunId: string;
  startDt: string;
  endDt: string | null;
  status: string;
};

export type ConfigSummary = {
  books: ConfigBook[];
  bookVersions: ConfigBookVersion[];
  marketplaces: ConfigMarketplace[];
  kenpRates: ConfigKenpRate[];
  forexRates: ConfigForexRate[];
};
