import { useState, useCallback, useEffect, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';

interface LogEntry {
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
  Time: string;
  Filename: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface FieldFilters {
  timestamp: string;
  level: string;
  logger: string;
  filePosition: string;
  message: string;
  details: string;
  filename: string;
  showInvalid: boolean;
}

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
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [totalUnfiltered, setTotalUnfiltered] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasData, setHasData] = useState(false);
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
  const [pageSize, setPageSize] = useState(100);
  const [jumpToPage, setJumpToPage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(500);
  const [wrapText, setWrapText] = useState(false);

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

  const handleUpload = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const files = formData.getAll('files');
    
    if (files.length === 0 || (files[0] as File).size === 0) {
      setStatus({ type: 'error', message: 'Please select at least one file' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Upload failed');
      }

      setStatus({ 
        type: 'success', 
        message: `Parsed ${data.totalEntries} entries from ${data.filenames.join(', ')}` 
      });
      setHasData(true);
      
      await fetchEntries(1, pageSize, filters);
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [pageSize, filters]);

  const fetchEntries = useCallback(async (page: number, size: number, currentFilters: FieldFilters) => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: size.toString(),
        timestamp: currentFilters.timestamp,
        level: currentFilters.level,
        logger: currentFilters.logger,
        filePosition: currentFilters.filePosition,
        message: currentFilters.message,
        details: currentFilters.details,
        filename: currentFilters.filename,
        showInvalid: currentFilters.showInvalid.toString()
      });
      
      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
      setPagination(data.pagination);
      setTotalUnfiltered(data.totalUnfiltered || 0);
    } catch (error) {
      console.error('Failed to fetch entries:', error);
    }
  }, []);

  useEffect(() => {
    if (!hasData) return;
    
    const debounceTimer = setTimeout(() => {
      fetchEntries(1, pageSize, filters);
    }, 300);
    
    return () => clearTimeout(debounceTimer);
  }, [filters, pageSize, hasData, fetchEntries]);

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

  const handlePageChange = (newPage: number) => {
    if (pagination && newPage >= 1 && newPage <= pagination.totalPages) {
      fetchEntries(newPage, pageSize, filters);
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
  };

  const hasActiveFilters = filters.timestamp || filters.level || filters.logger || 
    filters.filePosition || filters.message || filters.details || filters.filename;

  const visibleColumnCount = Object.values(columns).filter(Boolean).length;
  const totalColumnCount = 7;

  const levelStats = entries.reduce((acc, e) => {
    if (e.Level) {
      acc[e.Level] = (acc[e.Level] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const entry = entries[index];
    if (!entry) return null;

    return (
      <div 
        style={style} 
        className={`virtual-row ${!entry.IsValid ? 'invalid-entry' : ''} ${entry.Level ? `level-${entry.Level}` : ''}`}
      >
        {columns.timestamp && <div className="virtual-cell cell-timestamp">{entry.Timestamp || '-'}</div>}
        {columns.level && <div className="virtual-cell cell-level"><strong>{entry.Level || '-'}</strong></div>}
        {columns.logger && <div className="virtual-cell cell-logger">{entry.Logger || '-'}</div>}
        {columns.filePosition && <div className="virtual-cell cell-filepos">{entry.FilePosition || '-'}</div>}
        {columns.message && (
          <div className="virtual-cell cell-message">
            {entry.IsValid ? entry.Message : entry.Raw || entry.ParseError}
          </div>
        )}
        {columns.details && <div className="virtual-cell cell-details">{entry.DetailsJSON || '-'}</div>}
        {columns.filename && <div className="virtual-cell cell-filename">{entry.Filename || '-'}</div>}
      </div>
    );
  };

  return (
    <div className="container">
      <div className="card upload-section">
        <h2>Select log files to analyze:</h2>
        <form onSubmit={handleUpload}>
          <input 
            type="file" 
            name="files" 
            multiple 
            className="file-input"
            accept=".log,.txt"
          />
          <button type="submit" className="upload-btn" disabled={loading}>
            {loading ? 'Processing...' : 'Upload & Analyze'}
          </button>
        </form>
        {status && (
          <div className={`status ${status.type}`}>{status.message}</div>
        )}
      </div>

      <div className="card">
        {!hasData ? (
          <div className="empty-state">
            No log files to display. Please choose one or more files.
          </div>
        ) : (
          <>
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
                Filtered: {pagination?.totalEntries || 0}
              </span>
            </div>

            <div className="columns-section">
              <div className="columns-header">
                <h3>Columns</h3>
                {visibleColumnCount < totalColumnCount && (
                  <button className="clear-btn" onClick={showAllColumns}>
                    Show All
                  </button>
                )}
              </div>
              <div className="columns-toggles">
                <label className="column-toggle">
                  <input
                    type="checkbox"
                    checked={columns.timestamp}
                    onChange={() => toggleColumn('timestamp')}
                  />
                  Timestamp
                </label>
                <label className="column-toggle">
                  <input
                    type="checkbox"
                    checked={columns.level}
                    onChange={() => toggleColumn('level')}
                  />
                  Level
                </label>
                <label className="column-toggle">
                  <input
                    type="checkbox"
                    checked={columns.logger}
                    onChange={() => toggleColumn('logger')}
                  />
                  Logger
                </label>
                <label className="column-toggle">
                  <input
                    type="checkbox"
                    checked={columns.filePosition}
                    onChange={() => toggleColumn('filePosition')}
                  />
                  File
                </label>
                <label className="column-toggle">
                  <input
                    type="checkbox"
                    checked={columns.message}
                    onChange={() => toggleColumn('message')}
                  />
                  Message
                </label>
                <label className="column-toggle">
                  <input
                    type="checkbox"
                    checked={columns.details}
                    onChange={() => toggleColumn('details')}
                  />
                  Details
                </label>
                <label className="column-toggle">
                  <input
                    type="checkbox"
                    checked={columns.filename}
                    onChange={() => toggleColumn('filename')}
                  />
                  Source File
                </label>
                <label className="column-toggle wrap-toggle">
                  <input
                    type="checkbox"
                    checked={wrapText}
                    onChange={() => setWrapText(!wrapText)}
                  />
                  Wrap Text
                </label>
              </div>
            </div>

            <div className="filters-section">
              <div className="filters-header">
                <h3>Filters</h3>
                {hasActiveFilters && (
                  <button className="clear-btn" onClick={clearFilters}>
                    Clear All Filters
                  </button>
                )}
              </div>
              
              <div className="filters-grid">
                <div className="filter-group">
                  <label>Timestamp</label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Filter by timestamp..."
                    value={filters.timestamp}
                    onChange={e => setFilters(f => ({ ...f, timestamp: e.target.value }))}
                  />
                </div>
                
                <div className="filter-group">
                  <label>Level</label>
                  <select 
                    className="filter-select"
                    value={filters.level}
                    onChange={e => setFilters(f => ({ ...f, level: e.target.value }))}
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
                
                <div className="filter-group">
                  <label>Logger</label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Filter by logger..."
                    value={filters.logger}
                    onChange={e => setFilters(f => ({ ...f, logger: e.target.value }))}
                  />
                </div>
                
                <div className="filter-group">
                  <label>File Position</label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Filter by file:line..."
                    value={filters.filePosition}
                    onChange={e => setFilters(f => ({ ...f, filePosition: e.target.value }))}
                  />
                </div>
                
                <div className="filter-group">
                  <label>Message</label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Filter by message..."
                    value={filters.message}
                    onChange={e => setFilters(f => ({ ...f, message: e.target.value }))}
                  />
                </div>
                
                <div className="filter-group">
                  <label>Details (JSON)</label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Filter by JSON details..."
                    value={filters.details}
                    onChange={e => setFilters(f => ({ ...f, details: e.target.value }))}
                  />
                </div>
                
                <div className="filter-group">
                  <label>Source File</label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Filter by source file..."
                    value={filters.filename}
                    onChange={e => setFilters(f => ({ ...f, filename: e.target.value }))}
                  />
                </div>
                
                <div className="filter-group">
                  <label>&nbsp;</label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.showInvalid}
                      onChange={e => setFilters(f => ({ ...f, showInvalid: e.target.checked }))}
                    />
                    Show Invalid Entries
                  </label>
                </div>
              </div>
            </div>

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

              {pagination && (
                <div className="pagination-info">
                  Showing {((pagination.page - 1) * pagination.pageSize) + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.totalEntries)} of {pagination.totalEntries}
                </div>
              )}

              {pagination && pagination.totalPages > 1 && (
                <div className="pagination-nav">
                  <button 
                    disabled={!pagination.hasPrev}
                    onClick={() => handlePageChange(1)}
                    title="First page"
                  >
                    ««
                  </button>
                  <button 
                    disabled={!pagination.hasPrev}
                    onClick={() => handlePageChange(pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <span className="page-indicator">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button 
                    disabled={!pagination.hasNext}
                    onClick={() => handlePageChange(pagination.page + 1)}
                  >
                    Next
                  </button>
                  <button 
                    disabled={!pagination.hasNext}
                    onClick={() => handlePageChange(pagination.totalPages)}
                    title="Last page"
                  >
                    »»
                  </button>
                  <form onSubmit={handleJumpToPage} className="jump-to-page">
                    <input
                      type="number"
                      min={1}
                      max={pagination.totalPages}
                      value={jumpToPage}
                      onChange={e => setJumpToPage(e.target.value)}
                      placeholder="Go to..."
                    />
                    <button type="submit">Go</button>
                  </form>
                </div>
              )}
            </div>

            <div className="virtual-table" ref={containerRef}>
              <div className="virtual-header">
                {columns.timestamp && <div className="virtual-cell cell-timestamp">Timestamp</div>}
                {columns.level && <div className="virtual-cell cell-level">Level</div>}
                {columns.logger && <div className="virtual-cell cell-logger">Logger</div>}
                {columns.filePosition && <div className="virtual-cell cell-filepos">File</div>}
                {columns.message && <div className="virtual-cell cell-message">Message</div>}
                {columns.details && <div className="virtual-cell cell-details">Details</div>}
                {columns.filename && <div className="virtual-cell cell-filename">Source File</div>}
              </div>
              
              {entries.length > 0 ? (
                wrapText ? (
                  <div className="wrapped-table-body" style={{ maxHeight: containerHeight, overflowY: 'auto' }}>
                    {entries.map((entry, idx) => (
                      <div 
                        key={idx} 
                        className={`virtual-row wrapped ${!entry.IsValid ? 'invalid-entry' : ''} ${entry.Level ? `level-${entry.Level}` : ''}`}
                      >
                        {columns.timestamp && <div className="virtual-cell cell-timestamp">{entry.Timestamp || '-'}</div>}
                        {columns.level && <div className="virtual-cell cell-level"><strong>{entry.Level || '-'}</strong></div>}
                        {columns.logger && <div className="virtual-cell cell-logger">{entry.Logger || '-'}</div>}
                        {columns.filePosition && <div className="virtual-cell cell-filepos">{entry.FilePosition || '-'}</div>}
                        {columns.message && (
                          <div className="virtual-cell cell-message">
                            {entry.IsValid ? entry.Message : entry.Raw || entry.ParseError}
                          </div>
                        )}
                        {columns.details && <div className="virtual-cell cell-details">{entry.DetailsJSON || '-'}</div>}
                        {columns.filename && <div className="virtual-cell cell-filename">{entry.Filename || '-'}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <List
                    height={containerHeight}
                    itemCount={entries.length}
                    itemSize={40}
                    width="100%"
                  >
                    {Row}
                  </List>
                )
              ) : (
                <div className="no-results">No entries match your filters</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
