package parser

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/raghavendra-talur/ramen-log-analyzer/models"
)

// Log field regular expressions
var (
	dateTimeRegex     = regexp.MustCompile(`^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}(?:Z|[-+]\d{4})$`)
	logLevelRegex     = regexp.MustCompile(`^(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)$`)
	loggerRegex       = regexp.MustCompile(`^[a-zA-Z0-9_\.-]+$`)
	filePositionRegex = regexp.MustCompile(`^.*:\d+$`)
	messageRegex      = regexp.MustCompile(`^[A-Za-z0-9\s\-\/:()]+$`)
	detailsJSONRegex  = regexp.MustCompile(`^{.*}$`)
)

// Field type constants
const (
	dateTimeField     = "timestamp"
	levelField        = "level"
	loggerField       = "logger"
	filePositionField = "file_position"
	messageField      = "message"
	detailsJSONField  = "details_json"
)

// LogParser handles parsing of log files
type LogParser struct {
	errorHit bool
}

// New creates a new LogParser instance
func New() *LogParser {
	return &LogParser{}
}

func determineField(field string) string {
	if dateTimeRegex.MatchString(field) {
		return dateTimeField
	}
	if logLevelRegex.MatchString(field) {
		return levelField
	}
	if loggerRegex.MatchString(field) {
		return loggerField
	}
	if filePositionRegex.MatchString(field) {
		return filePositionField
	}
	if detailsJSONRegex.MatchString(field) {
		return detailsJSONField
	}
	if messageRegex.MatchString(field) {
		return messageField
	}
	return ""
}

func expectedFieldType(partID int) string {
	switch partID {
	case 0:
		return dateTimeField
	case 1:
		return levelField
	case 2:
		return loggerField
	case 3:
		return filePositionField
	case 4:
		return messageField
	case 5:
		return detailsJSONField
	default:
		return ""
	}
}

// ParseLine parses a single line of log text
func (p *LogParser) ParseLine(line, fileName string) models.LogEntry {
	entry := models.LogEntry{
		Filename: fileName,
		IsValid:  true,
	}

	parts := strings.Split(line, "\t")
	if len(parts) < 4 {
		entry.IsValid = false
		entry.Raw = line
		entry.ParseError = fmt.Sprintf("Invalid number of fields in line %v, lenparts: %v, parts: %v", line, len(parts), parts)
		return entry
	}

	finalParts := make([]string, 0)

	var fieldPosAdjustment int
	// Validate each part
	for i, part := range parts {
		fieldType := determineField(part)
		expectedType := expectedFieldType(i + fieldPosAdjustment)
		if expectedType == messageField || expectedType == detailsJSONField {
			finalParts = append(finalParts, part)
			continue
		}
		if fieldType != expectedType {
			if expectedType == loggerField && fieldType == filePositionField {
				finalParts = append(finalParts, "unknown logger")
				finalParts = append(finalParts, part)
				fieldPosAdjustment++
				continue
			}
			entry.IsValid = false
			entry.Raw = line
			entry.ParseError = entry.ParseError + fmt.Sprintf("Field type mismatch at position %v, part: %v, expected type: %v, determined type: %v", string(rune('0'+i)), part, expectedType, fieldType)
			continue
		}

		finalParts = append(finalParts, part)
	}

	if entry.IsValid {
		entry.Timestamp = finalParts[0]
		entry.Level = finalParts[1]
		entry.Logger = finalParts[2]
		entry.FilePosition = finalParts[3]
		entry.Message = finalParts[4]
		if len(finalParts) == 6 {
			entry.DetailsJSON = finalParts[5]
		}
		entry.Time, _ = time.Parse(time.RFC3339, entry.Timestamp)
	}

	return entry
}

// ParseFile parses log entries from a file
func (p *LogParser) ParseFile(file *os.File, originalFileName string) ([]models.LogEntry, error) {
	file.Seek(0, 0)
	scanner := bufio.NewScanner(file)
	var logEntries []models.LogEntry

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) != "" {
			entry := p.ParseLine(line, originalFileName)

			if !entry.IsValid {
				if p.errorHit {
					// might be a stacktrace
					logEntries[len(logEntries)-1].StackTrace = append(logEntries[len(logEntries)-1].StackTrace, line)
				} else {
					// new entry
					logEntries = append(logEntries, entry)
				}
			} else {
				if entry.Level == "ERROR" {
					p.errorHit = true
				} else {
					p.errorHit = false
				}
				logEntries = append(logEntries, entry)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading file: %v error: %v", originalFileName, err)
	}

	return logEntries, nil
}
