# Ramen Log Analyzer

A log analysis tool for Ramen operator logs with a hybrid architecture: TypeScript/React frontend and backend, with Go for log parsing.

## Architecture

- **Go Parser Service** (port 3001): Handles log file parsing via HTTP API
- **Node.js/Express Server** (port 5000): Serves frontend, handles file uploads, proxies to Go parser
- **React + TypeScript Frontend**: Modern SPA with filtering, pagination, and log visualization

## Project Structure

```
├── main.go              # Go parser HTTP service
├── parser/              # Go log parsing logic
├── models/              # Go data models
├── server/              # Node.js/Express backend
│   └── src/index.ts     # Express server
├── client/              # React frontend
│   ├── src/App.tsx      # Main React component
│   └── dist/            # Built frontend (served by Express)
```

## Running Locally

Two workflows run simultaneously:
1. **Go Parser Service**: `go run .` (port 3001)
2. **Web Server**: `cd server && npm run dev` (port 5000)

## Key Features

- Multi-file upload (up to 1GB per file)
- Log level filtering (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)
- Text search across logs
- Pagination for large files
- Color-coded log levels
- Stack trace display
- Show/hide invalid entries

## API Endpoints

- `POST /api/parse` - Upload and parse log files
- `GET /api/entries` - Get parsed entries with pagination
- `GET /api/health` - Health check for both services
