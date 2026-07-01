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
