package models

import "time"

// LogEntry represents a parsed log line
type LogEntry struct {
	Raw          string
	Timestamp    string
	Level        string
	Logger       string
	FilePosition string
	Message      string
	DetailsJSON  string
	IsValid      bool
	ParseError   string
	StackTrace   []string
	Time         time.Time
}

// FileData represents log entries from a single file
type FileData struct {
	Name       string
	LogEntries []LogEntry
}

// PageData represents the data passed to the HTML template
type PageData struct {
	Files []FileData
}
