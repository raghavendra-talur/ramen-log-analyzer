# Ramen Log Analyzer

A log analysis tool for Ramen operator logs with a Node.js/TypeScript backend and React frontend.

## Architecture

- **Node.js/Express Server** (port 5000): Serves frontend, handles file uploads, parses logs, and provides API
- **React + TypeScript Frontend**: Modern SPA with virtual scrolling, filtering, pagination, and log visualization
- **TypeScript Log Parser**: Integrated parser module that handles log file parsing

## Project Structure

```
├── server/              # Node.js/Express backend
│   └── src/
│       ├── index.ts     # Express server with API endpoints
│       └── parser.ts    # Log parsing logic (ported from Go)
├── client/              # React frontend
│   ├── src/App.tsx      # Main React component with virtual scrolling
│   ├── src/index.css    # Styles
│   └── dist/            # Built frontend (served by Express)
```

## Running Locally

Single workflow runs the application:
- **Web Server**: `cd server && npm run dev` (port 5000)

## Key Features

- Multi-file upload (up to 1GB per file)
- **Clean UI** - File upload section only shown on initial load; compact "Load New Files" button in results view
- **Server-side filtering** - Filter queries processed on server for better performance
- **Virtual scrolling** (react-window) - Only renders visible rows for smooth performance with large datasets
- **Wrap Text toggle** - Switch between truncated (fast) and wrapped (full content) display modes
- **Resizable columns** - Drag column edges to resize, widths are preserved during session
- **Right-click context menu** - Right-click on column headers to toggle column visibility and wrap text
- **Column filter icons** - Click the filter icon (⧩) on any column header to set a filter; icon turns blue when filter is active
- **Help icon** - Click the ? icon in the top right for usage tips
- **Group by JSON key** - Group log entries by a key in the Details JSON (e.g., "rid" for request ID)
  - **Fuzzy search dropdown** - Shows all available keys from Details JSON, supports nested keys with dot notation (e.g., drpc.name, placementRef.kind)
  - Collapsible groups showing first and last entries by default
  - Click to expand and see all entries in a group
  - Color-coded entries: green=first, red=last, yellow=middle
- **Visualizations** (Chart.js) - When grouping is enabled, click "Show Charts" to display:
  - Duration Distribution Histogram: Shows count of requests by duration buckets (0-100ms, 100-500ms, etc.)
  - Request Durations Chart: Horizontal bar chart showing top 20 request durations, color-coded by error status
- **Export Results** - Download filtered results as a text file
- Field-specific filtering (Timestamp, Level, Logger, File Position, Message, Details, Source File)
- Column show/hide toggles for all 7 columns
- Log level statistics with clickable badges
- **Improved pagination controls** - Page size selector (50/100/250/500/1000), page navigation, jump-to-page
- Color-coded log levels (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)
- Show/hide invalid entries

## API Endpoints

- `POST /api/parse` - Upload and parse log files
- `GET /api/entries` - Get parsed entries with server-side filtering and pagination
  - Query params: page, pageSize, timestamp, level, logger, filePosition, message, details, filename, showInvalid
- `GET /api/grouped` - Get entries grouped by a JSON key from Details
  - Query params: groupBy (required), plus all filter params from /api/entries
- `GET /api/keys` - Get all available JSON keys from Details fields (supports nested keys with dot notation)
- `GET /api/health` - Health check

## Deployment

Build command: `cd client && npm install && npm run build && cd ../server && npm install && npm run build`

Run command: `node server/dist/index.js`
