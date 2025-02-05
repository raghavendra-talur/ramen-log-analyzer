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
	Filename     string
}

// PageData represents the data passed to the HTML template
type PageData struct {
	Name       string
	LogEntries []LogEntry
	HasPrev    bool
	HasNext    bool
	Page       int
	NextPage   int
	PrevPage   int
	PageSize   int
	TotalPages int
}
