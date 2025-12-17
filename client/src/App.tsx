import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

declare const __COMMIT_HASH__: string;
declare const __COMMIT_DATE__: string;
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { 
  LogEntry, 
  FieldFilters, 
  Session, 
  ParseProgressPayload,
  QueryResultPayload,
  GroupedResult,
  WorkerMessage
} from './lib/types';
import {
  initDB,
  getAllSessions,
  saveSession,
  deleteSession,
  saveChunk,
  getAllEntriesForSession,
  saveAvailableKeys,
  getAvailableKeys,
  computeFileHash,
} from './lib/db';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface ColumnVisibility {
  timestamp: boolean;
  level: boolean;
  logger: boolean;
  filePosition: boolean;
  message: boolean;
  details: boolean;
  filename: boolean;
}

function App() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [allEntries, setAllEntries] = useState<LogEntry[]>([]);
  const [totalUnfiltered, setTotalUnfiltered] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [hasData, setHasData] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [parseProgress, setParseProgress] = useState<ParseProgressPayload | null>(null);
  const [filters, setFilters] = useState<FieldFilters>({
    timestamp: '',
    level: '',
    logger: '',
    filePosition: '',
    message: '',
    details: '',
    filename: '',
    showInvalid: true
  });
  const [columns, setColumns] = useState<ColumnVisibility>({
    timestamp: true,
    level: true,
    logger: true,
    filePosition: true,
    message: true,
    details: true,
    filename: true
  });
  const [columnWidths, setColumnWidths] = useState({
    timestamp: 180,
    level: 70,
    logger: 200,
    filePosition: 200,
    message: 300,
    details: 200,
    filename: 150
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeFilterColumn, setActiveFilterColumn] = useState<keyof FieldFilters | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpToPage, setJumpToPage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(500);
  const [wrapText, setWrapText] = useState(true);
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  const [groupByKey, setGroupByKey] = useState('');
  const [groups, setGroups] = useState<GroupedResult[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showVisualizations, setShowVisualizations] = useState(false);
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [keySearchFilter, setKeySearchFilter] = useState('');
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);
  const keyDropdownRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<{ column: keyof typeof columnWidths; startX: number; startWidth: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const parseWorkerRef = useRef<Worker | null>(null);
  const queryWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    initDB().then(() => {
      loadSessions();
    });

    parseWorkerRef.current = new Worker(
      new URL('./workers/parseWorker.ts', import.meta.url),
      { type: 'module' }
    );
    queryWorkerRef.current = new Worker(
      new URL('./workers/queryWorker.ts', import.meta.url),
      { type: 'module' }
    );

    parseWorkerRef.current.onmessage = handleParseWorkerMessage;
    queryWorkerRef.current.onmessage = handleQueryWorkerMessage;

    return () => {
      parseWorkerRef.current?.terminate();
      queryWorkerRef.current?.terminate();
    };
  }, []);

  const loadSessions = async () => {
    const allSessions = await getAllSessions();
    setSessions(allSessions);
  };

  const chunkQueueRef = useRef<Promise<void>>(Promise.resolve());
  const parsedEntriesCountRef = useRef(0);
  const currentSessionRef = useRef<Session | null>(null);

  const handleParseWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
    const { type, payload } = event.data;

    switch (type) {
      case 'PARSE_PROGRESS':
        setParseProgress(payload);
        break;

      case 'PARSE_CHUNK_RESULT':
        chunkQueueRef.current = chunkQueueRef.current.then(async () => {
          await saveChunk(payload.chunk);
          parsedEntriesCountRef.current += payload.chunk.entries.length;
        });
        break;

      case 'PARSE_COMPLETE':
        if (payload.fileIndex === payload.totalFiles - 1) {
          chunkQueueRef.current.then(() => finalizeParsing());
        }
        break;

      case 'PARSE_ERROR':
        setStatus({ type: 'error', message: payload.error });
        setLoading(false);
        setParseProgress(null);
        break;

      case 'KEYS_RESULT':
        setAvailableKeys(payload.keys);
        const session = currentSessionRef.current;
        if (session) {
          saveAvailableKeys({
            sessionId: session.id,
            keys: payload.keys,
            updatedAt: Date.now(),
          });
        }
        break;
    }
  };

  const handleQueryWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
    const { type, payload } = event.data;

    switch (type) {
      case 'QUERY_RESULT':
        const result = payload as QueryResultPayload;
        setEntries(result.entries);
        if (result.groups) {
          setGroups(result.groups);
        }
        break;

      case 'KEYS_RESULT':
        setAvailableKeys(payload.keys);
        break;

      case 'QUERY_ERROR':
        console.error('Query error:', payload.error);
        break;
    }
  };

  const finalizeParsing = async () => {
    const session = currentSessionRef.current;
    if (!session) return;

    const entries = await getAllEntriesForSession(session.id);
    setAllEntries(entries);
    setTotalUnfiltered(entries.length);

    const levelStats: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.Level) {
        levelStats[entry.Level] = (levelStats[entry.Level] || 0) + 1;
      }
    }

    const updatedSession: Session = {
      ...session,
      status: 'ready',
      totalEntries: entries.length,
      levelStats,
      updatedAt: Date.now(),
    };
    await saveSession(updatedSession);
    setCurrentSession(updatedSession);
    currentSessionRef.current = updatedSession;

    queryWorkerRef.current?.postMessage({
      type: 'INIT',
      payload: { entries },
    });

    parseWorkerRef.current?.postMessage({ type: 'EXTRACT_KEYS' });

    runQuery(entries, filters, currentPage, pageSize, groupingEnabled ? groupByKey : undefined);

    setLoading(false);
    setParseProgress(null);
    setHasData(true);
    setStatus({
      type: 'success',
      message: `Parsed ${entries.length} entries from ${session.filenames.join(', ')}`,
    });

    loadSessions();
    parsedEntriesCountRef.current = 0;
  };

  const runQuery = (
    sourceEntries: LogEntry[],
    currentFilters: FieldFilters,
    page: number,
    size: number,
    groupKey?: string
  ) => {
    let filtered = sourceEntries.filter(entry => {
      if (!currentFilters.showInvalid && !entry.IsValid) return false;
      if (currentFilters.timestamp && !entry.Timestamp?.toLowerCase().includes(currentFilters.timestamp.toLowerCase())) return false;
      if (currentFilters.level && entry.Level !== currentFilters.level) return false;
      if (currentFilters.logger && !entry.Logger?.toLowerCase().includes(currentFilters.logger.toLowerCase())) return false;
      if (currentFilters.filePosition && !entry.FilePosition?.toLowerCase().includes(currentFilters.filePosition.toLowerCase())) return false;
      if (currentFilters.message && !entry.Message?.toLowerCase().includes(currentFilters.message.toLowerCase())) return false;
      if (currentFilters.details && !entry.DetailsJSON?.toLowerCase().includes(currentFilters.details.toLowerCase())) return false;
      if (currentFilters.filename && !entry.Filename?.toLowerCase().includes(currentFilters.filename.toLowerCase())) return false;
      return true;
    });

    if (groupKey) {
      const groupMap = new Map<string, LogEntry[]>();
      for (const entry of filtered) {
        const keyValue = extractKeyFromDetails(entry.DetailsJSON, groupKey);
        if (keyValue) {
          if (!groupMap.has(keyValue)) groupMap.set(keyValue, []);
          groupMap.get(keyValue)!.push(entry);
        }
      }

      const groupedResults: GroupedResult[] = [];
      for (const [keyValue, entries] of groupMap) {
        if (entries.length > 0) {
          const hasErrors = entries.some(e => e.Level === 'ERROR' || e.Level === 'FATAL');
          let durationMs: number | undefined;
          if (entries[0].Time && entries[entries.length - 1].Time) {
            durationMs = entries[entries.length - 1].Time! - entries[0].Time!;
          }
          groupedResults.push({
            groupKey,
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
      groupedResults.sort((a, b) => (a.firstEntry.Timestamp || '').localeCompare(b.firstEntry.Timestamp || ''));
      setGroups(groupedResults);
      setEntries(filtered);
    } else {
      const start = (page - 1) * size;
      const end = Math.min(start + size, filtered.length);
      setEntries(filtered.slice(start, end));
      setGroups([]);
    }
  };

  const extractKeyFromDetails = (detailsJSON: string, key: string): string | null => {
    if (!detailsJSON) return null;
    try {
      const parsed = JSON.parse(detailsJSON);
      const parts = key.split('.');
      let current = parsed;
      for (const part of parts) {
        if (current === null || current === undefined) return null;
        current = current[part];
      }
      return current !== undefined ? String(current) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (allEntries.length > 0) {
      const debounceTimer = setTimeout(() => {
        runQuery(allEntries, filters, currentPage, pageSize, groupingEnabled ? groupByKey : undefined);
      }, 150);
      return () => clearTimeout(debounceTimer);
    }
  }, [filters, currentPage, pageSize, groupingEnabled, groupByKey, allEntries]);

  const groupStats = useMemo(() => {
    if (!groupingEnabled || groups.length === 0) return null;

    const durations: { keyValue: string; duration: number; hasError: boolean; firstTime: number; lastTime: number }[] = [];
    
    for (const group of groups) {
      const firstTime = group.firstEntry.Time;
      const lastTime = group.lastEntry.Time;
      if (firstTime && lastTime) {
        const duration = lastTime - firstTime;
        durations.push({ keyValue: group.keyValue, duration, hasError: group.hasErrors, firstTime, lastTime });
      }
    }

    durations.sort((a, b) => a.firstTime - b.firstTime);
    
    const durationBuckets = { '0-100ms': 0, '100-500ms': 0, '500ms-1s': 0, '1-5s': 0, '5s+': 0 };
    for (const d of durations) {
      if (d.duration <= 100) durationBuckets['0-100ms']++;
      else if (d.duration <= 500) durationBuckets['100-500ms']++;
      else if (d.duration <= 1000) durationBuckets['500ms-1s']++;
      else if (d.duration <= 5000) durationBuckets['1-5s']++;
      else durationBuckets['5s+']++;
    }

    return { durations, durationBuckets };
  }, [groups, groupingEnabled]);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const availableHeight = window.innerHeight - rect.top - 120;
        setContainerHeight(Math.max(300, availableHeight));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [entries.length]);

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || files[0].size === 0) {
      setStatus({ type: 'error', message: 'Please select at least one file' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: 'Processing files...' });
    setParseProgress(null);

    try {
      const fileHashes = await Promise.all(files.map(f => computeFileHash(f)));
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const session: Session = {
        id: sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        filenames: files.map(f => f.name),
        totalBytes,
        totalEntries: 0,
        status: 'parsing',
        fileHashes,
        levelStats: {},
      };

      await saveSession(session);
      setCurrentSession(session);
      currentSessionRef.current = session;

      parseWorkerRef.current?.postMessage({
        type: 'INIT',
        payload: { sessionId },
      });

      for (let i = 0; i < files.length; i++) {
        parseWorkerRef.current?.postMessage({
          type: 'PARSE_FILE',
          payload: { file: files[i], fileIndex: i, totalFiles: files.length },
        });
      }
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
      setLoading(false);
    }
  }, []);

  const handleUpload = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const files = formData.getAll('files') as File[];
    await processFiles(files);
  }, [processFiles]);

  const loadSession = async (session: Session) => {
    setLoading(true);
    setStatus({ type: 'info', message: 'Loading session...' });

    try {
      const entries = await getAllEntriesForSession(session.id);
      const keys = await getAvailableKeys(session.id);

      setAllEntries(entries);
      setTotalUnfiltered(entries.length);
      setCurrentSession(session);
      currentSessionRef.current = session;
      setAvailableKeys(keys);
      setHasData(true);

      queryWorkerRef.current?.postMessage({
        type: 'INIT',
        payload: { entries },
      });

      runQuery(entries, filters, 1, pageSize, groupingEnabled ? groupByKey : undefined);

      setStatus({
        type: 'success',
        message: `Loaded ${entries.length} entries from ${session.filenames.join(', ')}`,
      });
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    loadSessions();
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
      setHasData(false);
      setAllEntries([]);
      setEntries([]);
    }
  };

  const cancelParsing = () => {
    parseWorkerRef.current?.postMessage({ type: 'CANCEL' });
    setLoading(false);
    setParseProgress(null);
    setStatus({ type: 'info', message: 'Parsing cancelled' });
  };

  const filteredKeys = useMemo(() => {
    if (!keySearchFilter) return availableKeys;
    const search = keySearchFilter.toLowerCase();
    return availableKeys.filter(key => 
      key.toLowerCase().includes(search) ||
      key.split('.').some(part => part.toLowerCase().includes(search))
    );
  }, [availableKeys, keySearchFilter]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (keyDropdownRef.current && !keyDropdownRef.current.contains(event.target as Node)) {
        setShowKeyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleGroupExpansion = (keyValue: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(keyValue)) {
        next.delete(keyValue);
      } else {
        next.add(keyValue);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilters({
      timestamp: '',
      level: '',
      logger: '',
      filePosition: '',
      message: '',
      details: '',
      filename: '',
      showInvalid: true
    });
  };

  const toggleColumn = (column: keyof ColumnVisibility) => {
    setColumns(c => ({ ...c, [column]: !c[column] }));
  };

  const showAllColumns = () => {
    setColumns({
      timestamp: true,
      level: true,
      logger: true,
      filePosition: true,
      message: true,
      details: true,
      filename: true
    });
  };

  const handleHeaderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (activeFilterColumn) {
      const handleClickOutside = (e: MouseEvent) => {
        if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
          setActiveFilterColumn(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeFilterColumn]);

  const handleFilterIconClick = (e: React.MouseEvent, column: keyof FieldFilters) => {
    e.stopPropagation();
    setActiveFilterColumn(activeFilterColumn === column ? null : column);
  };

  const handleResizeStart = (e: React.MouseEvent, column: keyof typeof columnWidths) => {
    e.preventDefault();
    resizingRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column]
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(50, resizingRef.current.startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [resizingRef.current!.column]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const columnLabels: Record<keyof ColumnVisibility, string> = {
    timestamp: 'Timestamp',
    level: 'Level',
    logger: 'Logger',
    filePosition: 'File Position',
    message: 'Message',
    details: 'Details',
    filename: 'Source File'
  };

  const totalFilteredEntries = useMemo(() => {
    return allEntries.filter(entry => {
      if (!filters.showInvalid && !entry.IsValid) return false;
      if (filters.timestamp && !entry.Timestamp?.toLowerCase().includes(filters.timestamp.toLowerCase())) return false;
      if (filters.level && entry.Level !== filters.level) return false;
      if (filters.logger && !entry.Logger?.toLowerCase().includes(filters.logger.toLowerCase())) return false;
      if (filters.filePosition && !entry.FilePosition?.toLowerCase().includes(filters.filePosition.toLowerCase())) return false;
      if (filters.message && !entry.Message?.toLowerCase().includes(filters.message.toLowerCase())) return false;
      if (filters.details && !entry.DetailsJSON?.toLowerCase().includes(filters.details.toLowerCase())) return false;
      if (filters.filename && !entry.Filename?.toLowerCase().includes(filters.filename.toLowerCase())) return false;
      return true;
    }).length;
  }, [allEntries, filters]);

  const totalPages = Math.ceil(totalFilteredEntries / pageSize) || 1;

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(jumpToPage);
    if (!isNaN(page)) {
      handlePageChange(page);
      setJumpToPage('');
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const hasActiveFilters = filters.timestamp || filters.level || filters.logger || 
    filters.filePosition || filters.message || filters.details || filters.filename;

  const levelStats = useMemo(() => {
    return allEntries.reduce((acc, e) => {
      if (e.Level) {
        acc[e.Level] = (acc[e.Level] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  }, [allEntries]);

  const handleLoadNewFiles = () => {
    fileInputRef.current?.click();
  };

  const handleExport = () => {
    setExporting(true);
    try {
      const filtered = allEntries.filter(entry => {
        if (!filters.showInvalid && !entry.IsValid) return false;
        if (filters.timestamp && !entry.Timestamp?.toLowerCase().includes(filters.timestamp.toLowerCase())) return false;
        if (filters.level && entry.Level !== filters.level) return false;
        if (filters.logger && !entry.Logger?.toLowerCase().includes(filters.logger.toLowerCase())) return false;
        if (filters.filePosition && !entry.FilePosition?.toLowerCase().includes(filters.filePosition.toLowerCase())) return false;
        if (filters.message && !entry.Message?.toLowerCase().includes(filters.message.toLowerCase())) return false;
        if (filters.details && !entry.DetailsJSON?.toLowerCase().includes(filters.details.toLowerCase())) return false;
        if (filters.filename && !entry.Filename?.toLowerCase().includes(filters.filename.toLowerCase())) return false;
        return true;
      });
      
      const lines = filtered.map(entry => {
        if (!entry.IsValid) {
          return entry.Raw || entry.ParseError || '';
        }
        const parts: string[] = [];
        if (columns.timestamp && entry.Timestamp) parts.push(entry.Timestamp);
        if (columns.level && entry.Level) parts.push(`[${entry.Level}]`);
        if (columns.logger && entry.Logger) parts.push(entry.Logger);
        if (columns.filePosition && entry.FilePosition) parts.push(entry.FilePosition);
        if (columns.message && entry.Message) parts.push(entry.Message);
        if (columns.details && entry.DetailsJSON) parts.push(entry.DetailsJSON);
        if (columns.filename && entry.Filename) parts.push(`(${entry.Filename})`);
        return parts.join(' | ');
      });
      
      const content = lines.join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `log-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const entry = entries[index];
    if (!entry) return null;

    return (
      <div 
        style={style} 
        className={`virtual-row ${!entry.IsValid ? 'invalid-entry' : ''} ${entry.Level ? `level-${entry.Level}` : ''} ${wrapText ? 'wrapped' : ''}`}
      >
        {columns.timestamp && <div className="virtual-cell cell-timestamp" style={{ width: columnWidths.timestamp, minWidth: 50 }}>{entry.Timestamp || '-'}</div>}
        {columns.level && <div className="virtual-cell cell-level" style={{ width: columnWidths.level, minWidth: 50 }}><strong>{entry.Level || '-'}</strong></div>}
        {columns.logger && <div className="virtual-cell cell-logger" style={{ width: columnWidths.logger, minWidth: 50 }}>{entry.Logger || '-'}</div>}
        {columns.filePosition && <div className="virtual-cell cell-filepos" style={{ width: columnWidths.filePosition, minWidth: 50 }}>{entry.FilePosition || '-'}</div>}
        {columns.message && (
          <div className="virtual-cell cell-message" style={{ width: columnWidths.message, minWidth: 50, flex: 'none' }}>
            {entry.IsValid ? entry.Message : entry.Raw || entry.ParseError}
          </div>
        )}
        {columns.details && <div className="virtual-cell cell-details" style={{ width: columnWidths.details, minWidth: 50 }}>{entry.DetailsJSON || '-'}</div>}
        {columns.filename && <div className="virtual-cell cell-filename" style={{ width: columnWidths.filename, minWidth: 50 }}>{entry.Filename || '-'}</div>}
      </div>
    );
  };

  return (
    <div className="container">
      {!hasData ? (
        <div className="card upload-section upload-section-centered">
          <h2>Ramen Log Analyzer</h2>
          <p className="privacy-notice">Your files never leave your device. All processing happens locally in your browser.</p>
          
          <form onSubmit={handleUpload}>
            <input 
              type="file" 
              name="files" 
              multiple 
              className="file-input"
              accept=".log,.txt"
              ref={fileInputRef}
            />
            <button type="submit" className="upload-btn" disabled={loading}>
              {loading ? 'Processing...' : 'Upload & Analyze'}
            </button>
          </form>

          {parseProgress && (
            <div className="progress-section">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${parseProgress.percent}%` }}></div>
              </div>
              <div className="progress-text">
                {parseProgress.currentFile} - {parseProgress.percent.toFixed(1)}% 
                ({parseProgress.entriesParsed.toLocaleString()} entries)
              </div>
              <button type="button" className="cancel-btn" onClick={cancelParsing}>Cancel</button>
            </div>
          )}

          {status && (
            <div className={`status ${status.type}`}>{status.message}</div>
          )}

          {sessions.length > 0 && (
            <div className="sessions-section">
              <h3>Previous Sessions</h3>
              <div className="sessions-list">
                {sessions.slice(0, 5).map(session => (
                  <div key={session.id} className="session-item">
                    <div className="session-info" onClick={() => loadSession(session)}>
                      <span className="session-files">{session.filenames.join(', ')}</span>
                      <span className="session-meta">
                        {session.totalEntries.toLocaleString()} entries | 
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button 
                      className="session-delete" 
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                      title="Delete session"
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="version-info">
            Version: {__COMMIT_HASH__} ({__COMMIT_DATE__.split(' ')[0]})
          </div>
        </div>
      ) : (
        <div className="card results-card">
          <div className="results-header">
            <div className="stats">
              {Object.entries(levelStats).map(([level, count]) => (
                <span 
                  key={level} 
                  className={`stat-badge level-${level} ${filters.level === level ? 'active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFilters(f => ({ ...f, level: f.level === level ? '' : level }))}
                >
                  {level}: {count}
                </span>
              ))}
              <span className="stat-badge" style={{ backgroundColor: '#e9ecef' }}>
                Total: {totalUnfiltered}
              </span>
              <span className="stat-badge" style={{ backgroundColor: '#d4edda', color: '#155724' }}>
                Filtered: {totalFilteredEntries}
              </span>
              <span className="stat-badge" style={{ backgroundColor: '#ffe0e0', color: '#721c24' }}>
                Invalid: {allEntries.filter(e => !e.IsValid).length}
              </span>
            </div>
            <form onSubmit={handleUpload} className="load-new-form">
              <input 
                type="file" 
                name="files" 
                multiple 
                className="file-input-hidden"
                accept=".log,.txt"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    e.target.form?.requestSubmit();
                  }
                }}
              />
              <button type="button" className="load-new-btn" onClick={handleLoadNewFiles} disabled={loading}>
                {loading ? 'Processing...' : 'Load New Files'}
              </button>
            </form>
            <button 
              type="button" 
              className="export-btn" 
              onClick={handleExport} 
              disabled={exporting || entries.length === 0}
            >
              {exporting ? 'Exporting...' : 'Export Results'}
            </button>
          </div>

          <div className="options-bar">
            <div className="options-left">
              <label className="option-toggle">
                <input
                  type="checkbox"
                  checked={wrapText}
                  onChange={() => setWrapText(!wrapText)}
                />
                Wrap Text
              </label>
              <label className="option-toggle">
                <input
                  type="checkbox"
                  checked={filters.showInvalid}
                  onChange={e => setFilters(f => ({ ...f, showInvalid: e.target.checked }))}
                />
                Show Invalid Entries
              </label>
              {hasActiveFilters && (
                <button className="clear-filters-btn" onClick={clearFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
            <div className="options-right">
              <span 
                className="help-icon" 
                onClick={() => setShowHelp(!showHelp)}
                title="Help"
              >?</span>
              {showHelp && (
                <div className="help-popover">
                  <div className="help-header">
                    <strong>Help</strong>
                    <span className="help-close" onClick={() => setShowHelp(false)}>×</span>
                  </div>
                  <ul className="help-list">
                    <li><strong>Privacy:</strong> Files are processed locally and never leave your device</li>
                    <li><strong>Resize columns:</strong> Drag the right edge of column headers</li>
                    <li><strong>Toggle columns:</strong> Right-click on column headers</li>
                    <li><strong>Filter columns:</strong> Click the filter icon on column headers</li>
                    <li><strong>Filter by level:</strong> Click level badges in the stats bar</li>
                    <li><strong>Group entries:</strong> Enable "Group by JSON key" and select a key</li>
                    <li><strong>Session persistence:</strong> Sessions are saved and can be resumed</li>
                  </ul>
                  <div className="help-version">
                    Version: {__COMMIT_HASH__} ({__COMMIT_DATE__.split(' ')[0]})
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grouping-section">
            <div className="grouping-header">
              <label className="grouping-toggle">
                <input
                  type="checkbox"
                  checked={groupingEnabled}
                  onChange={() => setGroupingEnabled(!groupingEnabled)}
                />
                Group by JSON key
              </label>
              {groupingEnabled && (
                <div className="grouping-key-input" ref={keyDropdownRef}>
                  <input
                    type="text"
                    value={keySearchFilter}
                    onChange={e => {
                      setKeySearchFilter(e.target.value);
                      setShowKeyDropdown(true);
                      if (e.target.value === '') {
                        setGroupByKey('');
                      }
                    }}
                    onFocus={() => setShowKeyDropdown(true)}
                    placeholder="Search for key (e.g., rid, drpc.name)"
                    className="filter-input"
                  />
                  {showKeyDropdown && filteredKeys.length > 0 && (
                    <div className="key-dropdown">
                      {filteredKeys.slice(0, 50).map(key => (
                        <div
                          key={key}
                          className={`key-option ${key === groupByKey ? 'selected' : ''}`}
                          onClick={() => {
                            setGroupByKey(key);
                            setKeySearchFilter(key);
                            setShowKeyDropdown(false);
                          }}
                        >
                          {key}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {groupingEnabled && groups.length > 0 && (
                <button 
                  className="viz-toggle-btn"
                  onClick={() => setShowVisualizations(!showVisualizations)}
                >
                  {showVisualizations ? 'Hide Charts' : 'Show Charts'}
                </button>
              )}
            </div>

            {groupingEnabled && showVisualizations && groupStats && (
              <div className="visualizations">
                <div className="viz-grid">
                  <div className="viz-card">
                    <h4>Duration Distribution</h4>
                    <Bar
                      data={{
                        labels: Object.keys(groupStats.durationBuckets),
                        datasets: [{
                          label: 'Request Count',
                          data: Object.values(groupStats.durationBuckets),
                          backgroundColor: '#4a90d9',
                        }]
                      }}
                      options={{
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true } }
                      }}
                    />
                  </div>
                  <div className="viz-card">
                    <h4>Request Durations (Top 20)</h4>
                    <Bar
                      data={{
                        labels: groupStats.durations.slice(0, 20).map(d => d.keyValue.slice(0, 12)),
                        datasets: [{
                          label: 'Duration (ms)',
                          data: groupStats.durations.slice(0, 20).map(d => d.duration),
                          backgroundColor: groupStats.durations.slice(0, 20).map(d => 
                            d.hasError ? '#f44336' : '#2196f3'
                          ),
                        }]
                      }}
                      options={{
                        indexAxis: 'y',
                        responsive: true,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => {
                                const ms = ctx.raw as number;
                                if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
                                return `${ms}ms`;
                              }
                            }
                          }
                        },
                        scales: {
                          x: { beginAtZero: true, title: { display: true, text: 'Duration (ms)' } }
                        }
                      }}
                    />
                    <div className="viz-legend">
                      <span className="legend-item"><span className="legend-color" style={{ backgroundColor: '#2196f3' }}></span> Normal</span>
                      <span className="legend-item"><span className="legend-color" style={{ backgroundColor: '#f44336' }}></span> Has Errors</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {groupingEnabled && groups.length > 0 && (
              <div className="grouped-results">
                <div className="group-summary">
                  {groups.length} groups found ({groups.reduce((sum, g) => sum + g.count, 0)} entries)
                </div>
                {groups.map(group => (
                  <div key={group.keyValue} className="group-container">
                    <div 
                      className="group-header"
                      onClick={() => toggleGroupExpansion(group.keyValue)}
                    >
                      <span className="group-expand">{expandedGroups.has(group.keyValue) ? '▼' : '▶'}</span>
                      <span className="group-key">{group.keyValue}</span>
                      <span className="group-count">({group.count} entries)</span>
                      {group.hasErrors && <span className="group-error-badge">Has Errors</span>}
                      {group.durationMs !== undefined && (
                        <span className="group-duration">
                          {group.durationMs >= 1000 
                            ? `${(group.durationMs / 1000).toFixed(2)}s` 
                            : `${group.durationMs}ms`}
                        </span>
                      )}
                    </div>
                    
                    <div className={`group-entries ${expandedGroups.has(group.keyValue) ? 'expanded' : ''}`}>
                      {expandedGroups.has(group.keyValue) ? (
                        <div className="group-table">
                          <div 
                            className="virtual-header resizable-header"
                            onContextMenu={handleHeaderContextMenu}
                          >
                            {columns.timestamp && (
                              <div className="header-cell" style={{ width: columnWidths.timestamp, minWidth: 50 }}>
                                <div className="header-content">
                                  <span>Timestamp</span>
                                  <span 
                                    className={`filter-icon ${filters.timestamp ? 'active' : ''}`}
                                    onClick={(e) => handleFilterIconClick(e, 'timestamp')}
                                  >⧩</span>
                                </div>
                                <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'timestamp')}></div>
                                {activeFilterColumn === 'timestamp' && (
                                  <div className="filter-popover" ref={filterPopoverRef}>
                                    <input
                                      type="text"
                                      value={filters.timestamp}
                                      onChange={e => setFilters(f => ({ ...f, timestamp: e.target.value }))}
                                      placeholder="Filter timestamp..."
                                      className="filter-input"
                                      autoFocus
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {columns.level && (
                              <div className="header-cell" style={{ width: columnWidths.level, minWidth: 50 }}>
                                <div className="header-content">
                                  <span>Level</span>
                                  <span 
                                    className={`filter-icon ${filters.level ? 'active' : ''}`}
                                    onClick={(e) => handleFilterIconClick(e, 'level')}
                                  >⧩</span>
                                </div>
                                <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'level')}></div>
                                {activeFilterColumn === 'level' && (
                                  <div className="filter-popover" ref={filterPopoverRef}>
                                    <select
                                      value={filters.level}
                                      onChange={e => setFilters(f => ({ ...f, level: e.target.value }))}
                                      className="filter-select"
                                      autoFocus
                                    >
                                      <option value="">All Levels</option>
                                      <option value="TRACE">TRACE</option>
                                      <option value="DEBUG">DEBUG</option>
                                      <option value="INFO">INFO</option>
                                      <option value="WARN">WARN</option>
                                      <option value="ERROR">ERROR</option>
                                      <option value="FATAL">FATAL</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            )}
                            {columns.logger && (
                              <div className="header-cell" style={{ width: columnWidths.logger, minWidth: 50 }}>
                                <div className="header-content">
                                  <span>Logger</span>
                                  <span 
                                    className={`filter-icon ${filters.logger ? 'active' : ''}`}
                                    onClick={(e) => handleFilterIconClick(e, 'logger')}
                                  >⧩</span>
                                </div>
                                <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'logger')}></div>
                                {activeFilterColumn === 'logger' && (
                                  <div className="filter-popover" ref={filterPopoverRef}>
                                    <input
                                      type="text"
                                      value={filters.logger}
                                      onChange={e => setFilters(f => ({ ...f, logger: e.target.value }))}
                                      placeholder="Filter logger..."
                                      className="filter-input"
                                      autoFocus
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {columns.filePosition && (
                              <div className="header-cell" style={{ width: columnWidths.filePosition, minWidth: 50 }}>
                                <div className="header-content">
                                  <span>File Position</span>
                                  <span 
                                    className={`filter-icon ${filters.filePosition ? 'active' : ''}`}
                                    onClick={(e) => handleFilterIconClick(e, 'filePosition')}
                                  >⧩</span>
                                </div>
                                <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'filePosition')}></div>
                                {activeFilterColumn === 'filePosition' && (
                                  <div className="filter-popover" ref={filterPopoverRef}>
                                    <input
                                      type="text"
                                      value={filters.filePosition}
                                      onChange={e => setFilters(f => ({ ...f, filePosition: e.target.value }))}
                                      placeholder="Filter file:line..."
                                      className="filter-input"
                                      autoFocus
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {columns.message && (
                              <div className="header-cell cell-message" style={{ width: columnWidths.message, minWidth: 50 }}>
                                <div className="header-content">
                                  <span>Message</span>
                                  <span 
                                    className={`filter-icon ${filters.message ? 'active' : ''}`}
                                    onClick={(e) => handleFilterIconClick(e, 'message')}
                                  >⧩</span>
                                </div>
                                <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'message')}></div>
                                {activeFilterColumn === 'message' && (
                                  <div className="filter-popover" ref={filterPopoverRef}>
                                    <input
                                      type="text"
                                      value={filters.message}
                                      onChange={e => setFilters(f => ({ ...f, message: e.target.value }))}
                                      placeholder="Filter message..."
                                      className="filter-input"
                                      autoFocus
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {columns.details && (
                              <div className="header-cell" style={{ width: columnWidths.details, minWidth: 50 }}>
                                <div className="header-content">
                                  <span>Details</span>
                                  <span 
                                    className={`filter-icon ${filters.details ? 'active' : ''}`}
                                    onClick={(e) => handleFilterIconClick(e, 'details')}
                                  >⧩</span>
                                </div>
                                <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'details')}></div>
                                {activeFilterColumn === 'details' && (
                                  <div className="filter-popover" ref={filterPopoverRef}>
                                    <input
                                      type="text"
                                      value={filters.details}
                                      onChange={e => setFilters(f => ({ ...f, details: e.target.value }))}
                                      placeholder="Filter JSON details..."
                                      className="filter-input"
                                      autoFocus
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {columns.filename && (
                              <div className="header-cell" style={{ width: columnWidths.filename, minWidth: 50 }}>
                                <div className="header-content">
                                  <span>Source File</span>
                                  <span 
                                    className={`filter-icon ${filters.filename ? 'active' : ''}`}
                                    onClick={(e) => handleFilterIconClick(e, 'filename')}
                                  >⧩</span>
                                </div>
                                <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'filename')}></div>
                                {activeFilterColumn === 'filename' && (
                                  <div className="filter-popover" ref={filterPopoverRef}>
                                    <input
                                      type="text"
                                      value={filters.filename}
                                      onChange={e => setFilters(f => ({ ...f, filename: e.target.value }))}
                                      placeholder="Filter source file..."
                                      className="filter-input"
                                      autoFocus
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {group.allEntries.map((entry, idx) => (
                            <div 
                              key={entry.id}
                              className={`virtual-row ${!entry.IsValid ? 'invalid-entry' : ''} ${entry.Level ? `level-${entry.Level}` : ''} ${idx === 0 ? 'first-entry' : idx === group.allEntries.length - 1 ? 'last-entry' : 'middle-entry'} ${wrapText ? 'wrapped' : ''}`}
                            >
                              {columns.timestamp && <div className="virtual-cell cell-timestamp" style={{ width: columnWidths.timestamp, minWidth: 50 }}>{entry.Timestamp || '-'}</div>}
                              {columns.level && <div className="virtual-cell cell-level" style={{ width: columnWidths.level, minWidth: 50 }}><strong>{entry.Level || '-'}</strong></div>}
                              {columns.logger && <div className="virtual-cell cell-logger" style={{ width: columnWidths.logger, minWidth: 50 }}>{entry.Logger || '-'}</div>}
                              {columns.filePosition && <div className="virtual-cell cell-filepos" style={{ width: columnWidths.filePosition, minWidth: 50 }}>{entry.FilePosition || '-'}</div>}
                              {columns.message && <div className="virtual-cell cell-message" style={{ width: columnWidths.message, minWidth: 50, flex: 'none' }}>{entry.IsValid ? entry.Message : entry.Raw || entry.ParseError}</div>}
                              {columns.details && <div className="virtual-cell cell-details" style={{ width: columnWidths.details, minWidth: 50 }}>{entry.DetailsJSON || '-'}</div>}
                              {columns.filename && <div className="virtual-cell cell-filename" style={{ width: columnWidths.filename, minWidth: 50 }}>{entry.Filename || '-'}</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="group-preview">
                          <div className="group-entry first-entry">
                            <span className="entry-timestamp">{group.firstEntry.Timestamp}</span>
                            <span className={`entry-level level-${group.firstEntry.Level}`}>{group.firstEntry.Level}</span>
                            <span className="entry-message">{group.firstEntry.Message}</span>
                          </div>
                          {group.count > 2 && (
                            <div className="group-entry-ellipsis">... {group.count - 2} more entries ...</div>
                          )}
                          {group.count > 1 && (
                            <div className="group-entry last-entry">
                              <span className="entry-timestamp">{group.lastEntry.Timestamp}</span>
                              <span className={`entry-level level-${group.lastEntry.Level}`}>{group.lastEntry.Level}</span>
                              <span className="entry-message">{group.lastEntry.Message}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!groupingEnabled && (
            <div className="pagination-controls">
              <div className="page-size-selector">
                <label>Rows per page:</label>
                <select 
                  value={pageSize} 
                  onChange={e => handlePageSizeChange(parseInt(e.target.value))}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                </select>
              </div>

              <div className="pagination-info">
                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalFilteredEntries)} of {totalFilteredEntries}
              </div>

              {totalPages > 1 && (
                <div className="pagination-nav">
                  <button 
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(1)}
                    title="First page"
                  >
                    ««
                  </button>
                  <button 
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    «
                  </button>
                  <span className="page-indicator">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button 
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    »
                  </button>
                  <button 
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(totalPages)}
                    title="Last page"
                  >
                    »»
                  </button>
                  <form onSubmit={handleJumpToPage} className="jump-form">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpToPage}
                      onChange={e => setJumpToPage(e.target.value)}
                      placeholder="Go to..."
                      className="jump-input"
                    />
                    <button type="submit" className="jump-btn">Go</button>
                  </form>
                </div>
              )}
            </div>
          )}

          {!groupingEnabled && (
            <>
              <div 
                className={`table-header ${wrapText ? 'wrap-text' : ''}`}
                onContextMenu={handleHeaderContextMenu}
              >
                {columns.timestamp && (
                  <div className="header-cell" style={{ width: columnWidths.timestamp, minWidth: 50 }}>
                    <div className="header-content">
                      <span>Timestamp</span>
                      <span 
                        className={`filter-icon ${filters.timestamp ? 'active' : ''}`}
                        onClick={(e) => handleFilterIconClick(e, 'timestamp')}
                      >⧩</span>
                    </div>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'timestamp')}></div>
                    {activeFilterColumn === 'timestamp' && (
                      <div className="filter-popover" ref={filterPopoverRef}>
                        <input
                          type="text"
                          value={filters.timestamp}
                          onChange={e => setFilters(f => ({ ...f, timestamp: e.target.value }))}
                          placeholder="Filter timestamp..."
                          className="filter-input"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
                {columns.level && (
                  <div className="header-cell" style={{ width: columnWidths.level, minWidth: 50 }}>
                    <div className="header-content">
                      <span>Level</span>
                      <span 
                        className={`filter-icon ${filters.level ? 'active' : ''}`}
                        onClick={(e) => handleFilterIconClick(e, 'level')}
                      >⧩</span>
                    </div>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'level')}></div>
                    {activeFilterColumn === 'level' && (
                      <div className="filter-popover" ref={filterPopoverRef}>
                        <select
                          value={filters.level}
                          onChange={e => setFilters(f => ({ ...f, level: e.target.value }))}
                          className="filter-select"
                          autoFocus
                        >
                          <option value="">All Levels</option>
                          <option value="TRACE">TRACE</option>
                          <option value="DEBUG">DEBUG</option>
                          <option value="INFO">INFO</option>
                          <option value="WARN">WARN</option>
                          <option value="ERROR">ERROR</option>
                          <option value="FATAL">FATAL</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
                {columns.logger && (
                  <div className="header-cell" style={{ width: columnWidths.logger, minWidth: 50 }}>
                    <div className="header-content">
                      <span>Logger</span>
                      <span 
                        className={`filter-icon ${filters.logger ? 'active' : ''}`}
                        onClick={(e) => handleFilterIconClick(e, 'logger')}
                      >⧩</span>
                    </div>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'logger')}></div>
                    {activeFilterColumn === 'logger' && (
                      <div className="filter-popover" ref={filterPopoverRef}>
                        <input
                          type="text"
                          value={filters.logger}
                          onChange={e => setFilters(f => ({ ...f, logger: e.target.value }))}
                          placeholder="Filter logger..."
                          className="filter-input"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
                {columns.filePosition && (
                  <div className="header-cell" style={{ width: columnWidths.filePosition, minWidth: 50 }}>
                    <div className="header-content">
                      <span>File Position</span>
                      <span 
                        className={`filter-icon ${filters.filePosition ? 'active' : ''}`}
                        onClick={(e) => handleFilterIconClick(e, 'filePosition')}
                      >⧩</span>
                    </div>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'filePosition')}></div>
                    {activeFilterColumn === 'filePosition' && (
                      <div className="filter-popover" ref={filterPopoverRef}>
                        <input
                          type="text"
                          value={filters.filePosition}
                          onChange={e => setFilters(f => ({ ...f, filePosition: e.target.value }))}
                          placeholder="Filter file:line..."
                          className="filter-input"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
                {columns.message && (
                  <div className="header-cell cell-message" style={{ width: columnWidths.message, minWidth: 50, flex: 'none' }}>
                    <div className="header-content">
                      <span>Message</span>
                      <span 
                        className={`filter-icon ${filters.message ? 'active' : ''}`}
                        onClick={(e) => handleFilterIconClick(e, 'message')}
                      >⧩</span>
                    </div>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'message')}></div>
                    {activeFilterColumn === 'message' && (
                      <div className="filter-popover" ref={filterPopoverRef}>
                        <input
                          type="text"
                          value={filters.message}
                          onChange={e => setFilters(f => ({ ...f, message: e.target.value }))}
                          placeholder="Filter message..."
                          className="filter-input"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
                {columns.details && (
                  <div className="header-cell" style={{ width: columnWidths.details, minWidth: 50 }}>
                    <div className="header-content">
                      <span>Details</span>
                      <span 
                        className={`filter-icon ${filters.details ? 'active' : ''}`}
                        onClick={(e) => handleFilterIconClick(e, 'details')}
                      >⧩</span>
                    </div>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'details')}></div>
                    {activeFilterColumn === 'details' && (
                      <div className="filter-popover" ref={filterPopoverRef}>
                        <input
                          type="text"
                          value={filters.details}
                          onChange={e => setFilters(f => ({ ...f, details: e.target.value }))}
                          placeholder="Filter JSON details..."
                          className="filter-input"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
                {columns.filename && (
                  <div className="header-cell" style={{ width: columnWidths.filename, minWidth: 50 }}>
                    <div className="header-content">
                      <span>Source File</span>
                      <span 
                        className={`filter-icon ${filters.filename ? 'active' : ''}`}
                        onClick={(e) => handleFilterIconClick(e, 'filename')}
                      >⧩</span>
                    </div>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'filename')}></div>
                    {activeFilterColumn === 'filename' && (
                      <div className="filter-popover" ref={filterPopoverRef}>
                        <input
                          type="text"
                          value={filters.filename}
                          onChange={e => setFilters(f => ({ ...f, filename: e.target.value }))}
                          placeholder="Filter source file..."
                          className="filter-input"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div 
                className={`virtual-table ${wrapText ? 'wrap-text' : ''}`}
                ref={containerRef}
              >
                <List
                  height={containerHeight}
                  itemCount={entries.length}
                  itemSize={wrapText ? 80 : 32}
                  width="100%"
                >
                  {Row}
                </List>
              </div>
            </>
          )}

          {contextMenu && (
            <div 
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div className="context-menu-header">Toggle Columns</div>
              {Object.entries(columnLabels).map(([key, label]) => (
                <div 
                  key={key}
                  className="context-menu-item"
                  onClick={() => toggleColumn(key as keyof ColumnVisibility)}
                >
                  <span className="context-menu-check">{columns[key as keyof ColumnVisibility] ? '✓' : ''}</span>
                  {label}
                </div>
              ))}
              <div className="context-menu-divider"></div>
              <div className="context-menu-item" onClick={showAllColumns}>
                Show All Columns
              </div>
              <div className="context-menu-divider"></div>
              <div className="context-menu-item" onClick={() => setWrapText(!wrapText)}>
                <span className="context-menu-check">{wrapText ? '✓' : ''}</span>
                Wrap Text
              </div>
            </div>
          )}

          {status && (
            <div className={`status-floating ${status.type}`}>{status.message}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
