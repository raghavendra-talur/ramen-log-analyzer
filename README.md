# Ramen Log Analyzer

A fully client-side log analysis tool for Ramen operator logs. Built with React and TypeScript, all file processing happens locally in your browser - files never leave your device.

## Features

### Privacy & Performance
- **100% Client-Side Processing** - Files never leave your device; all parsing and analysis happens in your browser
- **Web Workers** - Heavy processing runs in separate threads to keep the UI responsive
- **Streaming Parser** - Handles large files (up to 1GB) by processing in chunks without loading entirely into memory
- **IndexedDB Persistence** - Resume previous sessions without re-uploading files
- **Progress Tracking** - Real-time parsing progress with cancellation support

### Log Analysis
- **Multi-File Upload** - Analyze multiple log files together with unified timeline
- **Virtual Scrolling** - Smooth performance with datasets containing thousands of entries
- **Advanced Filtering** - Filter by any log field (timestamp, level, logger, file position, message, JSON details, source file)
- **Column Management**
  - Resizable columns via drag handles
  - Toggle column visibility with right-click context menu
  - Text wrapping toggle for better readability
- **Log Level Statistics** - Visual badges showing entry counts by level (clickable for quick filtering)
- **Invalid Entry Detection** - Automatically identifies and displays malformed log entries

### Advanced Features
- **Group by JSON Key** - Group log entries by any key in the Details JSON field
  - Fuzzy search dropdown with dot notation support (e.g., `drpc.name`, `rid`)
  - Expandable/collapsible groups showing first and last entries
  - Duration calculation between first and last entry in each group
  - Visual indicators for groups containing errors
- **Visualizations** (Chart.js)
  - Duration distribution histogram
  - Request duration bar charts with error highlighting
- **Export Results** - Download filtered results as formatted text
- **Pagination** - Configurable page size (50/100/250/500/1000 rows)
- **Session Management** - View and restore up to 5 previous analysis sessions

## Installation

### Prerequisites
- Node.js 18+ and npm

### Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/raghavendra-talur/ramen-log-analyzer.git
   cd ramen-log-analyzer
   ```

2. Install dependencies:
   ```bash
   cd client
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5000`

## Building for Production

To build the static files for deployment:

```bash
cd client
npm run build
```

The built files will be in `client/dist/` and can be served by any static file server.

## Usage

1. **Upload Files**
   - Click "Upload & Analyze" and select one or more log files
   - Or click "Load Sample Log" to try the analyzer with sample data
   - Files are processed locally and stored in your browser's IndexedDB

2. **Filter and Search**
   - Click the filter icon (⧩) on any column header to add filters
   - Click log level badges to filter by specific levels
   - Use "Show Invalid Entries" toggle to include/exclude malformed entries
   - Click "Clear All Filters" to reset

3. **Group and Analyze**
   - Enable "Group by JSON key" checkbox
   - Search for a JSON key from the Details field (supports dot notation)
   - View grouped entries with duration calculations and error indicators
   - Click "Show Charts" to visualize duration distributions

4. **Customize View**
   - Right-click column headers to show/hide columns
   - Drag column edges to resize
   - Toggle "Wrap Text" for better message readability
   - Adjust page size for pagination

5. **Export and Save**
   - Click "Export Results" to download filtered entries
   - Previous sessions are automatically saved and can be reloaded

## Log Format

The analyzer expects log files with tab-separated fields:

```
<Timestamp> <Level> <Logger> <FilePosition> <Message> <DetailsJSON>
```

**Fields:**
- **Timestamp** - RFC3339 format (e.g., `2024-12-16T10:23:45.123Z`)
- **Level** - One of: TRACE, DEBUG, INFO, WARN, ERROR, FATAL
- **Logger** - Logger name (e.g., `controller.vrg`)
- **FilePosition** - Source location (e.g., `controller.go:123`)
- **Message** - Log message text
- **DetailsJSON** - Optional JSON object with additional fields (e.g., `{"rid":"abc123","drpc":{"name":"test"}}`)

Invalid or malformed entries are flagged and can be filtered separately.

## Project Structure

```
ramen-log-analyzer/
├── client/                      # Frontend application
│   ├── src/
│   │   ├── App.tsx             # Main React component with UI logic
│   │   ├── main.tsx            # Application entry point
│   │   ├── index.css           # Styles and theming
│   │   ├── lib/
│   │   │   ├── types.ts        # TypeScript interfaces
│   │   │   ├── db.ts           # IndexedDB operations
│   │   │   └── parser.ts       # Log parsing logic
│   │   └── workers/
│   │       ├── parseWorker.ts  # Web Worker for file parsing
│   │       └── queryWorker.ts  # Web Worker for filtering/grouping
│   ├── index.html              # HTML template
│   ├── vite.config.ts          # Vite bundler configuration
│   └── package.json            # Dependencies
└── package.json                # Root package.json for build scripts
```

## Technology Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Libraries**: 
  - react-window (virtual scrolling)
  - Chart.js + react-chartjs-2 (visualizations)
  - date-fns (date handling)
- **Storage**: IndexedDB (browser-native persistence)
- **Processing**: Web Workers (parallel processing)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
