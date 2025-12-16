# Ramen Log Analyzer

A log analysis tool for Ramen operator logs with a hybrid architecture: TypeScript/React frontend and Node.js backend, with Go for log parsing.

## Architecture

- **Go Parser Service** (port 8080): Handles log file parsing via HTTP API
- **Node.js/Express Server** (port 5000): Serves frontend, handles file uploads, proxies to Go parser with server-side filtering
- **React + TypeScript Frontend**: Modern SPA with virtual scrolling, filtering, pagination, and log visualization

## Project Structure

```
├── main.go              # Go parser HTTP service
├── parser/              # Go log parsing logic
├── models/              # Go data models
├── server/              # Node.js/Express backend
│   └── src/index.ts     # Express server with server-side filtering
├── client/              # React frontend
│   ├── src/App.tsx      # Main React component with virtual scrolling
│   ├── src/index.css    # Styles
│   └── dist/            # Built frontend (served by Express)
```

## Running Locally

Two workflows run simultaneously:
1. **Go Parser Service**: `go run .` (port 8080)
2. **Web Server**: `cd server && npm run dev` (port 5000)

## Key Features

- Multi-file upload (up to 1GB per file)
- **Clean UI** - File upload section only shown on initial load; compact "Load New Files" button in results view
- **Server-side filtering** - Filter queries processed on server for better performance
- **Virtual scrolling** (react-window) - Only renders visible rows for smooth performance with large datasets
- **Wrap Text toggle** - Switch between truncated (fast) and wrapped (full content) display modes
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
- `GET /api/health` - Health check for both services

## Deployment

Build command: `go mod tidy && go build -o main . && cd client && npm install && npm run build && cd ../server && npm install && npm run build`

Run command: `./main & sleep 2 && node server/dist/index.js`
