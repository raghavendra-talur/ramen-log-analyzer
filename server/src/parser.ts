export interface LogEntry {
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
  Time: Date | null;
  Filename: string;
}

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

export function parseLine(line: string, fileName: string): LogEntry {
  const entry: LogEntry = {
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
  };

  const parts = line.split('\t');
  if (parts.length < 4) {
    entry.IsValid = false;
    entry.Raw = line;
    entry.ParseError = `Invalid number of fields in line, lenparts: ${parts.length}, parts: ${JSON.stringify(parts)}`;
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
      entry.ParseError += `Field type mismatch at position ${i}, part: ${part}, expected type: ${expected}, determined type: ${fieldType}. `;
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
      entry.Time = new Date(entry.Timestamp);
    } catch {
      entry.Time = null;
    }
  }

  return entry;
}

export function parseFileContent(content: string, fileName: string): LogEntry[] {
  const lines = content.split('\n');
  const logEntries: LogEntry[] = [];
  let errorHit = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const entry = parseLine(line, fileName);

    if (!entry.IsValid) {
      if (errorHit && logEntries.length > 0) {
        logEntries[logEntries.length - 1].StackTrace.push(line);
      } else {
        logEntries.push(entry);
      }
    } else {
      errorHit = entry.Level === 'ERROR';
      logEntries.push(entry);
    }
  }

  return logEntries;
}

export function parseMultipleFiles(files: Array<{ content: string; filename: string }>): LogEntry[] {
  let allEntries: LogEntry[] = [];

  for (const file of files) {
    const entries = parseFileContent(file.content, file.filename);
    console.log(`Parsed file: ${file.filename} with ${entries.length} entries`);
    allEntries = allEntries.concat(entries);
  }

  allEntries.sort((a, b) => {
    if (!a.IsValid && !b.IsValid) return 0;
    if (!a.IsValid) return 1;
    if (!b.IsValid) return -1;

    const aTime = a.Time?.getTime() || 0;
    const bTime = b.Time?.getTime() || 0;
    return aTime - bTime;
  });

  console.log(`Total entries after sorting: ${allEntries.length}`);
  return allEntries;
}
