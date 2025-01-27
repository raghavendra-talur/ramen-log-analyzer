package handlers

import (
	"bufio"
	"embed"
	"html/template"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"

	"github.com/raghavendra-talur/ramen-log-analyzer/models"
	"github.com/raghavendra-talur/ramen-log-analyzer/parser"
)

// Configuration constants
const (
	MAX_FILE_SIZE     = 1 << 30        // 1 GB in bytes
	TEMP_FILE_PATTERN = "upload-*.txt" // Pattern for temporary files
)

type Handler struct {
	tmpl   *template.Template
	parser *parser.LogParser
}

func New(content embed.FS) (*Handler, error) {
	tmpl, err := template.New("index.html").ParseFS(content, "templates/index.html")
	if err != nil {
		return nil, err
	}

	return &Handler{
		tmpl:   tmpl,
		parser: parser.New(),
	}, nil
}

func (h *Handler) HandleIndex(w http.ResponseWriter, r *http.Request) {
	data := models.PageData{
		Files: []models.FileData{},
	}
	h.tmpl.Execute(w, data)
}

func (h *Handler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse the multipart form data
	err := r.ParseMultipartForm(MAX_FILE_SIZE)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Get all uploaded files
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		http.Error(w, "No files uploaded", http.StatusBadRequest)
		return
	}

	filesData := make([]models.FileData, 1)

	// Process each uploaded file
	for _, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer file.Close()

		// Create a temporary file
		tempFile, err := os.CreateTemp("", TEMP_FILE_PATTERN)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer os.Remove(tempFile.Name())
		defer tempFile.Close()

		// Copy the uploaded file to the temporary file
		_, err = io.Copy(tempFile, file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Read and parse the file
		tempFile.Seek(0, 0)
		scanner := bufio.NewScanner(tempFile)
		logEntries := h.parser.ParseReader(scanner)

		if err := scanner.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		filesData[0].Name = filesData[0].Name + "," + filepath.Base(fileHeader.Filename)
		filesData[0].LogEntries = append(filesData[0].LogEntries, logEntries...)
	}

	// Sort log entries by timestamp
	sort.Slice(filesData[0].LogEntries, func(i, j int) bool {
		iEntry := filesData[0].LogEntries[i]
		jEntry := filesData[0].LogEntries[j]

		if !iEntry.IsValid && !jEntry.IsValid {
			return i < j
		}

		if !iEntry.IsValid {
			return false
		}

		if !jEntry.IsValid {
			return true
		}

		return iEntry.Time.Before(jEntry.Time)
	})

	// Render the template with all files' contents
	data := models.PageData{
		Files: filesData,
	}

	h.tmpl.Execute(w, data)
}
