import { useState, useCallback, useMemo } from 'react';

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
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
      
      await fetchEntries(1);
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntries = useCallback(async (page: number, pageSize = 10000) => {
    try {
      const response = await fetch(`/api/entries?page=${page}&pageSize=${pageSize}`);
      const data = await response.json();
      setEntries(data.entries || []);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch entries:', error);
    }
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
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
  }, [entries, filters]);

  const levelStats = useMemo(() => {
    const stats: Record<string, number> = {};
    entries.forEach(e => {
      if (e.Level) {
        stats[e.Level] = (stats[e.Level] || 0) + 1;
      }
    });
    return stats;
  }, [entries]);

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

  const hasActiveFilters = filters.timestamp || filters.level || filters.logger || 
    filters.filePosition || filters.message || filters.details || filters.filename;

  const visibleColumnCount = Object.values(columns).filter(Boolean).length;
  const totalColumnCount = 7;

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
        {entries.length === 0 ? (
          <div className="empty-state">
            No log files to display. Please choose one or more files.
          </div>
        ) : (
          <>
            <div className="stats">
              {Object.entries(levelStats).map(([level, count]) => (
                <span 
                  key={level} 
                  className={`stat-badge level-${level}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFilters(f => ({ ...f, level: f.level === level ? '' : level }))}
                >
                  {level}: {count}
                </span>
              ))}
              <span className="stat-badge" style={{ backgroundColor: '#e9ecef' }}>
                Total: {entries.length}
              </span>
              <span className="stat-badge" style={{ backgroundColor: '#d4edda', color: '#155724' }}>
                Showing: {filteredEntries.length}
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

            <div className="table-wrapper">
              <table className="log-table">
                <thead>
                  <tr>
                    {columns.timestamp && <th>Timestamp</th>}
                    {columns.level && <th>Level</th>}
                    {columns.logger && <th>Logger</th>}
                    {columns.filePosition && <th>File</th>}
                    {columns.message && <th>Message</th>}
                    {columns.details && <th>Details</th>}
                    {columns.filename && <th>Source File</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => (
                    <tr 
                      key={idx} 
                      className={`${!entry.IsValid ? 'invalid-entry' : ''} ${entry.Level ? `level-${entry.Level}` : ''}`}
                    >
                      {columns.timestamp && <td>{entry.Timestamp || '-'}</td>}
                      {columns.level && <td><strong>{entry.Level || '-'}</strong></td>}
                      {columns.logger && <td>{entry.Logger || '-'}</td>}
                      {columns.filePosition && <td>{entry.FilePosition || '-'}</td>}
                      {columns.message && (
                        <td>
                          {entry.IsValid ? entry.Message : entry.Raw || entry.ParseError}
                          {entry.StackTrace && entry.StackTrace.length > 0 && (
                            <div className="stack-trace">
                              {entry.StackTrace.join('\n')}
                            </div>
                          )}
                        </td>
                      )}
                      {columns.details && <td className="details-json">{entry.DetailsJSON || '-'}</td>}
                      {columns.filename && <td>{entry.Filename || '-'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="pagination">
                <button 
                  disabled={!pagination.hasPrev}
                  onClick={() => fetchEntries(pagination.page - 1)}
                >
                  Previous
                </button>
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <button 
                  disabled={!pagination.hasNext}
                  onClick={() => fetchEntries(pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
