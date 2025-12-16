import { LogEntry, FieldFilters, WorkerMessage, QueryResultPayload, GroupedResult } from '../lib/types';
import { extractKeyFromDetails, extractAllKeysFromEntries } from '../lib/parser';

let cachedEntries: LogEntry[] = [];

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, requestId } = event.data;

  switch (type) {
    case 'INIT':
      cachedEntries = payload.entries || [];
      break;

    case 'QUERY':
      handleQuery(payload, requestId || '');
      break;

    case 'EXTRACT_KEYS':
      const keys = extractAllKeysFromEntries(cachedEntries);
      self.postMessage({
        type: 'KEYS_RESULT',
        payload: { keys },
        requestId,
      });
      break;
  }
};

function handleQuery(payload: { filters: FieldFilters; page: number; pageSize: number; groupByKey?: string }, requestId: string) {
  const { filters, page, pageSize, groupByKey } = payload;

  try {
    let filteredEntries = cachedEntries.filter(entry => {
      if (!filters.showInvalid && !entry.IsValid) return false;

      if (filters.timestamp && !entry.Timestamp?.toLowerCase().includes(filters.timestamp.toLowerCase())) {
        return false;
      }
      if (filters.level && entry.Level !== filters.level) {
        return false;
      }
      if (filters.logger && !entry.Logger?.toLowerCase().includes(filters.logger.toLowerCase())) {
        return false;
      }
      if (filters.filePosition && !entry.FilePosition?.toLowerCase().includes(filters.filePosition.toLowerCase())) {
        return false;
      }
      if (filters.message && !entry.Message?.toLowerCase().includes(filters.message.toLowerCase())) {
        return false;
      }
      if (filters.details && !entry.DetailsJSON?.toLowerCase().includes(filters.details.toLowerCase())) {
        return false;
      }
      if (filters.filename && !entry.Filename?.toLowerCase().includes(filters.filename.toLowerCase())) {
        return false;
      }

      return true;
    });

    const levelStats: Record<string, number> = {};
    for (const entry of cachedEntries) {
      if (entry.Level) {
        levelStats[entry.Level] = (levelStats[entry.Level] || 0) + 1;
      }
    }

    if (groupByKey) {
      const groups = new Map<string, LogEntry[]>();
      const ungrouped: LogEntry[] = [];

      for (const entry of filteredEntries) {
        const keyValue = extractKeyFromDetails(entry.DetailsJSON, groupByKey);
        if (keyValue) {
          if (!groups.has(keyValue)) {
            groups.set(keyValue, []);
          }
          groups.get(keyValue)!.push(entry);
        } else {
          ungrouped.push(entry);
        }
      }

      const groupedResults: GroupedResult[] = [];

      for (const [keyValue, entries] of groups) {
        if (entries.length > 0) {
          const hasErrors = entries.some(e => e.Level === 'ERROR' || e.Level === 'FATAL');
          
          let durationMs: number | undefined;
          const firstTime = entries[0].Time;
          const lastTime = entries[entries.length - 1].Time;
          if (firstTime && lastTime) {
            durationMs = lastTime - firstTime;
          }

          groupedResults.push({
            groupKey: groupByKey,
            keyValue,
            count: entries.length,
            firstEntry: entries[0],
            lastEntry: entries[entries.length - 1],
            allEntries: entries,
            hasErrors,
            durationMs,
          });
        }
      }

      groupedResults.sort((a, b) => {
        const aTime = a.firstEntry.Timestamp || '';
        const bTime = b.firstEntry.Timestamp || '';
        return aTime.localeCompare(bTime);
      });

      const result: QueryResultPayload = {
        entries: filteredEntries,
        totalEntries: filteredEntries.length,
        totalPages: 1,
        page: 1,
        levelStats,
        groups: groupedResults,
      };

      self.postMessage({
        type: 'QUERY_RESULT',
        payload: result,
        requestId,
      });
    } else {
      const totalEntries = filteredEntries.length;
      const totalPages = Math.ceil(totalEntries / pageSize) || 1;
      const safePage = Math.min(Math.max(1, page), totalPages);
      const start = (safePage - 1) * pageSize;
      const end = Math.min(start + pageSize, totalEntries);

      const result: QueryResultPayload = {
        entries: filteredEntries.slice(start, end),
        totalEntries,
        totalPages,
        page: safePage,
        levelStats,
      };

      self.postMessage({
        type: 'QUERY_RESULT',
        payload: result,
        requestId,
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'QUERY_ERROR',
      payload: { error: error instanceof Error ? error.message : 'Unknown error' },
      requestId,
    });
  }
}

export {};
