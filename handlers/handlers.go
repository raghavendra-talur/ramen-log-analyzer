package handlers

import (
	"embed"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/raghavendra-talur/ramen-log-analyzer/models"
	"github.com/raghavendra-talur/ramen-log-analyzer/parser"
)

// Configuration constants
const (
	MAX_FILE_SIZE = 1 << 30 // 1 GB in bytes
)

var globalPageData models.PageData

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
	log.Printf("request method: %v\n", r.Method)

	if r.Method == http.MethodPost {
		pageData := models.PageData{}
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

		// Process each uploaded file
		for _, fileHeader := range files {
			file, err := fileHeader.Open()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer file.Close()

			// copy to temp file
			tempFile, err := os.CreateTemp("", "temp-*.log")
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer os.Remove(tempFile.Name())
			defer tempFile.Close()

			_, err = io.Copy(tempFile, file)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			logEntries, err := h.parser.ParseFile(tempFile, fileHeader.Filename)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if pageData.Name == "" {
				pageData.Name = filepath.Base(fileHeader.Filename)
			} else {
				pageData.Name += "," + filepath.Base(fileHeader.Filename)
			}

			pageData.LogEntries = append(pageData.LogEntries, logEntries...)
			log.Printf("processed file: %v and added %v entries\n", fileHeader.Filename, len(logEntries))
		}

		log.Printf("total entries: %v\n", len(pageData.LogEntries))
		// Sort log entries by timestamp
		sort.Slice(pageData.LogEntries, func(i, j int) bool {
			iEntry := pageData.LogEntries[i]
			jEntry := pageData.LogEntries[j]

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
		log.Printf("total entries after sorting: %v\n", len(pageData.LogEntries))

		globalPageData = pageData

		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	var pageData models.PageData
	if globalPageData.Name != "" {
		pageStr := r.URL.Query().Get("page")
		pageSizeStr := r.URL.Query().Get("pageSize")
		page, _ := strconv.Atoi(pageStr)
		if page < 1 {
			page = 1
		}
		pageSize, _ := strconv.Atoi(pageSizeStr)
		if pageSize < 1 {
			pageSize = 10000
		}

		totalPages := len(globalPageData.LogEntries) / pageSize
		if len(globalPageData.LogEntries)%pageSize != 0 {
			totalPages++
		}

		if page > totalPages {
			page = totalPages
		}

		hasPrevious := page > 1
		hasNext := page < totalPages

		start := (page - 1) * pageSize
		end := start + pageSize
		if start > len(globalPageData.LogEntries) {
			start = len(globalPageData.LogEntries)
		}
		if end > len(globalPageData.LogEntries) {
			end = len(globalPageData.LogEntries)
		}

		pageData = models.PageData{
			Name:       globalPageData.Name,
			LogEntries: globalPageData.LogEntries[start:end],
			HasPrev:    hasPrevious,
			HasNext:    hasNext,
			Page:       page,
			NextPage:   page + 1,
			PrevPage:   page - 1,
			PageSize:   pageSize,
			TotalPages: totalPages,
		}

	} else {
		pageData = models.PageData{}
	}
	err := h.tmpl.Execute(w, pageData)
	if err != nil {
		log.Printf("error executing template in handle upload: %v\n", err)
		return
	}
}
