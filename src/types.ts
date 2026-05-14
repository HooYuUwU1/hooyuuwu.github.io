export type AppStatus = 'IDLE' | 'SCANNING' | 'TRANSLATING' | 'VALIDATING' | 'EXPORTING' | 'DONE';

export interface ProcessedFile {
  path: string;
  originalContent: string | Uint8Array;
  translatedContent?: string | Uint8Array;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'SKIPPED';
  isText: boolean;
  encoding?: string;
  error?: string;
}

export interface AppLog {
  id: string;
  timestamp: Date;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
}
