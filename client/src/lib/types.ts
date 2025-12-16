export interface LogEntry {
  id: string;
  Raw: string;
  Timestamp: string;
  Level: string;
  Logger: string;
  FilePosition: string;
  Message: string;
  DetailsJSON: string;
  IsValid: boolean;
  ParseError: string;
  StackTrace: string[];
  Time: number | null;
  Filename: string;
  chunkIndex: number;
}

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  filenames: string[];
  totalBytes: number;
  totalEntries: number;
  status: 'parsing' | 'ready' | 'error';
  fileHashes: string[];
  levelStats: Record<string, number>;
}

export interface ParsedChunk {
  id: string;
  sessionId: string;
  filename: string;
  chunkIndex: number;
  byteStart: number;
  byteEnd: number;
  entries: LogEntry[];
  parsedAt: number;
}

export interface SavedView {
  id: string;
  sessionId: string;
  name: string;
  filters: FieldFilters;
  groupByKey: string;
  createdAt: number;
}

export interface FieldFilters {
  timestamp: string;
  level: string;
  logger: string;
  filePosition: string;
  message: string;
  details: string;
  filename: string;
  showInvalid: boolean;
}

export interface AvailableKeys {
  sessionId: string;
  keys: string[];
  updatedAt: number;
}

export type WorkerMessageType = 
  | 'INIT'
  | 'PARSE_FILE'
  | 'PARSE_PROGRESS'
  | 'PARSE_CHUNK_RESULT'
  | 'PARSE_COMPLETE'
  | 'PARSE_ERROR'
  | 'CANCEL'
  | 'QUERY'
  | 'QUERY_RESULT'
  | 'QUERY_ERROR'
  | 'EXTRACT_KEYS'
  | 'KEYS_RESULT';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
  requestId?: string;
}

export interface ParseProgressPayload {
  bytesProcessed: number;
  totalBytes: number;
  entriesParsed: number;
  currentFile: string;
  percent: number;
}

export interface QueryPayload {
  filters: FieldFilters;
  page: number;
  pageSize: number;
  groupByKey?: string;
}

export interface QueryResultPayload {
  entries: LogEntry[];
  totalEntries: number;
  totalPages: number;
  page: number;
  levelStats: Record<string, number>;
  groups?: GroupedResult[];
}

export interface GroupedResult {
  groupKey: string;
  keyValue: string;
  count: number;
  firstEntry: LogEntry;
  lastEntry: LogEntry;
  allEntries: LogEntry[];
  hasErrors: boolean;
  durationMs?: number;
}
