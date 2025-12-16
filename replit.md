# Ramen Log Analyzer

A fully client-side log analysis tool for Ramen operator logs. All file processing happens locally in the browser - files never leave your device.

## Architecture

This is a **static web application** with no backend services:

- **React + TypeScript Frontend**: Modern SPA with virtual scrolling, filtering, pagination, and log visualization
- **Web Workers**: Heavy parsing and filtering run in separate threads to keep UI responsive
- **IndexedDB**: Persistent storage for sessions, parsed chunks, and saved filters
- **Streaming Parser**: Processes large files (up to 1GB) in chunks without loading entirely into memory

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── App.tsx           # Main React component
│   │   ├── index.css         # Styles
│   │   ├── lib/
│   │   │   ├── types.ts      # TypeScript interfaces
│   │   │   ├── db.ts         # IndexedDB operations
│   │   │   └── parser.ts     # Log parsing logic
│   │   └── workers/
│   │       ├── parseWorker.ts  # Web Worker for file parsing
│   │       └── queryWorker.ts  # Web Worker for filtering/grouping
│   └── dist/                 # Built static files
```

## Running Locally

Single workflow runs the Vite dev server:
- **Web Server**: `cd client && npm run dev` (port 5000)

## Key Features

### Privacy & Performance
- **100% client-side** - Files never leave your device
- **Streaming/chunked parsing** - Handles files up to 1GB without memory issues
- **Web Workers** - Heavy processing doesn't block the UI
- **Session persistence** - Resume previous sessions without re-uploading files
- **Progress reporting & cancellation** - Track parsing progress and cancel if needed

### Analysis Features
- Multi-file upload
- **Virtual scrolling** (react-window) - Smooth performance with large datasets
- **Wrap Text toggle** - Switch between truncated and wrapped display
- **Resizable columns** - Drag column edges to resize
- **Right-click context menu** - Toggle column visibility
- **Column filter icons** - Click filter icon on any column header
- **Help icon** - Usage tips in top right corner
- **Group by JSON key** - Group entries by any key in the Details JSON
  - **Fuzzy search dropdown** - Find keys with dot notation support
  - Collapsible groups with first/last entry preview
  - Color-coded entries: green=first, red=last, yellow=middle
- **Visualizations** (Chart.js) - Duration distribution and request duration charts
- **Export Results** - Download filtered results as text
- **Previous Sessions** - View and restore previous analysis sessions
- Field-specific filtering
- Log level statistics with clickable badges
- Pagination controls (50/100/250/500/1000 rows per page)
- Color-coded log levels (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)

## IndexedDB Schema

- `sessions` - Session metadata (id, filenames, timestamps, stats)
- `chunks` - Parsed log entry chunks (entries stored as arrays)
- `keys` - Available JSON keys extracted from Details fields
- `views` - Saved filter configurations (future feature)

## Deployment

This is a static site deployment:
- Build command: `cd client && npm install && npm run build`
- Public directory: `client/dist`
