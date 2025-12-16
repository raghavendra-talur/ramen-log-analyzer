# Ramen Log Analyzer

A simple tool for analyzing and visualizing Ramen operator logs. This tool helps in debugging and understanding the behavior of Ramen controllers by providing an intuitive interface for log analysis with advanced filtering and visualization capabilities.

## Features

- **Web Interface**
  - Multiple file upload support (up to 1GB per file)
  - Real-time log processing and display
  - Responsive design for various screen sizes

- **Log Parsing**
  - Parses tab-separated log files
  - Extracts timestamp, log level, logger name, file position, message, and JSON details
  - Handles stack traces for error entries
  - Validates log entry formats
  - Sorts entries by timestamp across log files

- **Visualization**
  - Color-coded log levels for better readability
  - Monospace formatting for technical content
  - Collapsible column views
  - Stack trace display for error logs

- **Advanced Filtering**
  - Filter by any log field (timestamp, level, logger, etc.)
  - Multiple concurrent filters
  - Valid/Invalid entry filtering
  - Real-time filter updates

## Installation

1. Ensure you have Go installed
2. Clone the repository:
   ```bash
   git clone https://github.com/raghavendra-talur/ramen-log-analyzer.git
   cd ramen-log-analyzer
   ```
3. Build the project:
   ```bash
   go build
   ```

## Usage

1. Start the server:

   ```bash
   ./main
   ```

2. Open your web browser and navigate to `http://localhost:8080`
3. Upload your Ramen operator log files through the web interface
4. Use the interface to:
   - Toggle column visibility
   - Add filters for specific log fields
   - Show/hide valid or invalid entries
   - View stack traces for error logs
   - Sort and analyze log entries

## Log Format

The analyzer expects log files in a tab-separated format with the following fields:

- Timestamp (RFC3339 format)
- Log Level (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)
- Logger Name (optional)
- File Position (filename:line)
- Message
- Details (optional JSON)

## Project Structure

- `main.go`: Server initialization and main application logic
- `handlers/`: HTTP request handlers for file upload and processing
- `models/`: Data structures for log entries and page data
- `parser/`: Log file parsing and validation logic
- `templates/`: HTML template with embedded CSS and JavaScript

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the terms of the LICENSE file included in the repository.
