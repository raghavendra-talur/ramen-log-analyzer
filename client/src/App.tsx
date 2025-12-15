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

function App() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [filters, setFilters] = useState({
    level: '',
    search: '',
    showInvalid: true
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
      if (filters.level && entry.Level !== filters.level) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return (
          entry.Message?.toLowerCase().includes(searchLower) ||
          entry.Logger?.toLowerCase().includes(searchLower) ||
          entry.FilePosition?.toLowerCase().includes(searchLower) ||
          entry.DetailsJSON?.toLowerCase().includes(searchLower)
        );
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
            </div>

            <div className="filters">
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
              <input
                type="text"
                className="filter-input"
                placeholder="Search logs..."
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                  type="checkbox"
                  checked={filters.showInvalid}
                  onChange={e => setFilters(f => ({ ...f, showInvalid: e.target.checked }))}
                />
                Show Invalid Entries
              </label>
            </div>

            <div className="table-wrapper">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Level</th>
                    <th>Logger</th>
                    <th>File</th>
                    <th>Message</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => (
                    <tr 
                      key={idx} 
                      className={`${!entry.IsValid ? 'invalid-entry' : ''} ${entry.Level ? `level-${entry.Level}` : ''}`}
                    >
                      <td>{entry.Timestamp || '-'}</td>
                      <td><strong>{entry.Level || '-'}</strong></td>
                      <td>{entry.Logger || '-'}</td>
                      <td>{entry.FilePosition || '-'}</td>
                      <td>
                        {entry.IsValid ? entry.Message : entry.Raw || entry.ParseError}
                        {entry.StackTrace && entry.StackTrace.length > 0 && (
                          <div className="stack-trace">
                            {entry.StackTrace.join('\n')}
                          </div>
                        )}
                      </td>
                      <td className="details-json">{entry.DetailsJSON || '-'}</td>
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
