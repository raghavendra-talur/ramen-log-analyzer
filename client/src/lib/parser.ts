import { LogEntry } from './types';

const dateTimeRegex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}(?:Z|[-+]\d{4})$/;
const logLevelRegex = /^(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)$/;
const loggerRegex = /^[a-zA-Z0-9_\.\-]+$/;
const filePositionRegex = /^.*:\d+$/;
const messageRegex = /^[A-Za-z0-9\s\-\/:()]+$/;
const detailsJSONRegex = /^\{.*\}$/;

type FieldType = 'timestamp' | 'level' | 'logger' | 'file_position' | 'message' | 'details_json' | '';

function determineField(field: string): FieldType {
  if (dateTimeRegex.test(field)) return 'timestamp';
  if (logLevelRegex.test(field)) return 'level';
  if (loggerRegex.test(field)) return 'logger';
  if (filePositionRegex.test(field)) return 'file_position';
  if (detailsJSONRegex.test(field)) return 'details_json';
  if (messageRegex.test(field)) return 'message';
  return '';
}

function expectedFieldType(partID: number): FieldType {
  switch (partID) {
    case 0: return 'timestamp';
    case 1: return 'level';
    case 2: return 'logger';
    case 3: return 'file_position';
    case 4: return 'message';
    case 5: return 'details_json';
    default: return '';
  }
}

let entryCounter = 0;

export function parseLine(line: string, fileName: string, chunkIndex: number): LogEntry {
  const entry: LogEntry = {
    id: `${fileName}-${chunkIndex}-${entryCounter++}`,
    Raw: '',
    Timestamp: '',
    Level: '',
    Logger: '',
    FilePosition: '',
    Message: '',
    DetailsJSON: '',
    IsValid: true,
    ParseError: '',
    StackTrace: [],
    Time: null,
    Filename: fileName,
    chunkIndex,
  };

  const parts = line.split('\t');
  if (parts.length < 4) {
    entry.IsValid = false;
    entry.Raw = line;
    entry.ParseError = `Invalid number of fields in line, lenparts: ${parts.length}`;
    return entry;
  }

  const finalParts: string[] = [];
  let fieldPosAdjustment = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const fieldType = determineField(part);
    const expected = expectedFieldType(i + fieldPosAdjustment);

    if (expected === 'message' || expected === 'details_json') {
      finalParts.push(part);
      continue;
    }

    if (fieldType !== expected) {
      if (expected === 'logger' && fieldType === 'file_position') {
        finalParts.push('unknown logger');
        finalParts.push(part);
        fieldPosAdjustment++;
        continue;
      }
      entry.IsValid = false;
      entry.Raw = line;
      entry.ParseError += `Field type mismatch at position ${i}. `;
      continue;
    }

    finalParts.push(part);
  }

  if (entry.IsValid && finalParts.length >= 5) {
    entry.Timestamp = finalParts[0];
    entry.Level = finalParts[1];
    entry.Logger = finalParts[2];
    entry.FilePosition = finalParts[3];
    entry.Message = finalParts[4];
    if (finalParts.length >= 6) {
      entry.DetailsJSON = finalParts[5];
    }
    try {
      entry.Time = new Date(entry.Timestamp).getTime();
    } catch {
      entry.Time = null;
    }
  }

  return entry;
}

export function parseChunk(text: string, fileName: string, chunkIndex: number): { entries: LogEntry[]; lastErrorHit: boolean } {
  const lines = text.split('\n');
  const entries: LogEntry[] = [];
  let errorHit = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const entry = parseLine(line, fileName, chunkIndex);

    if (!entry.IsValid) {
      if (errorHit && entries.length > 0) {
        entries[entries.length - 1].StackTrace.push(line);
      } else {
        entries.push(entry);
      }
    } else {
      errorHit = entry.Level === 'ERROR';
      entries.push(entry);
    }
  }

  return { entries, lastErrorHit: errorHit };
}

export function flattenKeys(obj: any, prefix: string = ''): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

export function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function extractKeyFromDetails(detailsJSON: string, key: string): string | null {
  if (!detailsJSON) return null;
  try {
    const parsed = JSON.parse(detailsJSON);
    const value = key.includes('.') ? getNestedValue(parsed, key) : parsed[key];
    return value !== undefined ? String(value) : null;
  } catch {
    return null;
  }
}

export function extractAllKeysFromEntries(entries: LogEntry[]): string[] {
  const allKeys = new Set<string>();
  
  for (const entry of entries) {
    if (!entry.DetailsJSON) continue;
    try {
      const parsed = JSON.parse(entry.DetailsJSON);
      const keys = flattenKeys(parsed);
      keys.forEach(key => allKeys.add(key));
    } catch {
    }
  }
  
  return Array.from(allKeys).sort();
}
