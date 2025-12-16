import { LogEntry, ParsedChunk, WorkerMessage, ParseProgressPayload } from '../lib/types';
import { parseChunk, extractAllKeysFromEntries } from '../lib/parser';

const CHUNK_SIZE = 4 * 1024 * 1024;

let abortController: AbortController | null = null;
let sessionId: string = '';
let allParsedEntries: LogEntry[] = [];

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, requestId } = event.data;

  switch (type) {
    case 'INIT':
      sessionId = payload.sessionId;
      allParsedEntries = [];
      break;

    case 'PARSE_FILE':
      await handleParseFile(payload, requestId || '');
      break;

    case 'CANCEL':
      if (abortController) {
        abortController.abort();
      }
      break;

    case 'EXTRACT_KEYS':
      const keys = extractAllKeysFromEntries(allParsedEntries);
      self.postMessage({
        type: 'KEYS_RESULT',
        payload: { keys },
        requestId,
      });
      break;
  }
};

async function handleParseFile(payload: { file: File; fileIndex: number; totalFiles: number }, requestId: string) {
  const { file, fileIndex, totalFiles } = payload;
  abortController = new AbortController();
  
  const totalBytes = file.size;
  let bytesProcessed = 0;
  let chunkIndex = 0;
  let partialLine = '';
  let totalEntriesParsed = 0;
  
  const decoder = new TextDecoder('utf-8', { fatal: false });
  
  try {
    let offset = 0;
    
    while (offset < totalBytes) {
      if (abortController.signal.aborted) {
        self.postMessage({
          type: 'PARSE_ERROR',
          payload: { error: 'Parsing cancelled' },
          requestId,
        });
        return;
      }
      
      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const blob = file.slice(offset, end);
      const buffer = await blob.arrayBuffer();
      
      const isLastChunk = end >= totalBytes;
      const text = decoder.decode(buffer, { stream: !isLastChunk });
      const fullText = partialLine + text;
      
      const lastNewlineIndex = fullText.lastIndexOf('\n');
      
      let textToParse: string;
      if (lastNewlineIndex === -1) {
        if (isLastChunk) {
          textToParse = fullText;
          partialLine = '';
        } else {
          partialLine = fullText;
          offset = end;
          bytesProcessed = end;
          continue;
        }
      } else {
        textToParse = fullText.substring(0, lastNewlineIndex);
        partialLine = fullText.substring(lastNewlineIndex + 1);
      }
      
      const { entries } = parseChunk(textToParse, file.name, chunkIndex);
      totalEntriesParsed += entries.length;
      allParsedEntries.push(...entries);
      
      const chunk: ParsedChunk = {
        id: `${sessionId}-${file.name}-${chunkIndex}`,
        sessionId,
        filename: file.name,
        chunkIndex,
        byteStart: offset,
        byteEnd: end,
        entries,
        parsedAt: Date.now(),
      };
      
      self.postMessage({
        type: 'PARSE_CHUNK_RESULT',
        payload: { chunk },
        requestId,
      });
      
      bytesProcessed = end;
      const overallProgress = ((fileIndex / totalFiles) + (bytesProcessed / totalBytes / totalFiles)) * 100;
      
      const progress: ParseProgressPayload = {
        bytesProcessed,
        totalBytes,
        entriesParsed: totalEntriesParsed,
        currentFile: file.name,
        percent: overallProgress,
      };
      
      self.postMessage({
        type: 'PARSE_PROGRESS',
        payload: progress,
        requestId,
      });
      
      chunkIndex++;
      offset = end;
    }
    
    if (partialLine.trim()) {
      const { entries } = parseChunk(partialLine, file.name, chunkIndex);
      totalEntriesParsed += entries.length;
      allParsedEntries.push(...entries);
      
      const chunk: ParsedChunk = {
        id: `${sessionId}-${file.name}-${chunkIndex}`,
        sessionId,
        filename: file.name,
        chunkIndex,
        byteStart: totalBytes - partialLine.length,
        byteEnd: totalBytes,
        entries,
        parsedAt: Date.now(),
      };
      
      self.postMessage({
        type: 'PARSE_CHUNK_RESULT',
        payload: { chunk },
        requestId,
      });
    }
    
    self.postMessage({
      type: 'PARSE_COMPLETE',
      payload: {
        filename: file.name,
        totalEntries: totalEntriesParsed,
        fileIndex,
        totalFiles,
      },
      requestId,
    });
    
  } catch (error) {
    self.postMessage({
      type: 'PARSE_ERROR',
      payload: { error: error instanceof Error ? error.message : 'Unknown error' },
      requestId,
    });
  }
}

export {};
