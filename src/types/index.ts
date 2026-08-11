export interface BatchFile {
  name: string;
  file: File;
  relativePath: string;
  status: "pending" | "processing" | "success" | "error";
  errorMsg?: string;
  selected?: boolean;
  newName?: string;
  originalName?: string;
}

export interface ScaleOption {
  scale: number;
  label: string;
  suffix: string;
}

export interface ConversionLog {
  timestamp: string;
  text: string;
  type: "info" | "success" | "error" | "warning";
}

export type ActiveTabType = "svg" | "audio" | "rename" | "resource";

export interface BrokenLinkItem {
  id: string;
  sourcePath: string;
  lineNumber: number;
  snippet: string;
  targetPath: string;
  tagType: string;
  selected?: boolean;
}

export interface UnusedFileItem {
  id: string;
  relativePath: string;
  sizeBytes: number;
  extension: string;
  file: File;
  selected: boolean;
}

export interface CleanScanResult {
  brokenLinks: BrokenLinkItem[];
  unusedFiles: UnusedFileItem[];
  totalUnusedBytes: number;
  scannedFileCount: number;
}

export type CodeCleanMode = "none" | "comment" | "remove";

export interface ResourceCleanOptions {
  codeCleanMode: CodeCleanMode;
  deleteUnusedFiles: boolean;
}
