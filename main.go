package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"sort"

	"github.com/raghavendra-talur/ramen-log-analyzer/models"
	"github.com/raghavendra-talur/ramen-log-analyzer/parser"
)

const PORT = "0.0.0.0:8080"

type ParseResponse struct {
	Entries []models.LogEntry `json:"entries"`
	Error   string            `json:"error,omitempty"`
}

func main() {
	http.HandleFunc("/parse", handleParse)
	http.HandleFunc("/health", handleHealth)

	log.Printf("Go Parser Service starting on %s...\n", PORT)
	log.Fatal(http.ListenAndServe(PORT, nil))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleParse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	err := r.ParseMultipartForm(1 << 30)
	if err != nil {
		json.NewEncoder(w).Encode(ParseResponse{Error: err.Error()})
		return
	}

	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		json.NewEncoder(w).Encode(ParseResponse{Error: "No files uploaded"})
		return
	}

	p := parser.New()
	var allEntries []models.LogEntry

	for _, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			json.NewEncoder(w).Encode(ParseResponse{Error: err.Error()})
			return
		}
		defer file.Close()

		tempFile, err := os.CreateTemp("", "temp-*.log")
		if err != nil {
			json.NewEncoder(w).Encode(ParseResponse{Error: err.Error()})
			return
		}
		defer os.Remove(tempFile.Name())
		defer tempFile.Close()

		_, err = io.Copy(tempFile, file)
		if err != nil {
			json.NewEncoder(w).Encode(ParseResponse{Error: err.Error()})
			return
		}

		logEntries, err := p.ParseFile(tempFile, fileHeader.Filename)
		if err != nil {
			json.NewEncoder(w).Encode(ParseResponse{Error: err.Error()})
			return
		}

		allEntries = append(allEntries, logEntries...)
		log.Printf("Parsed file: %v with %v entries\n", fileHeader.Filename, len(logEntries))
	}

	sort.Slice(allEntries, func(i, j int) bool {
		iEntry := allEntries[i]
		jEntry := allEntries[j]

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

	log.Printf("Total entries after sorting: %v\n", len(allEntries))
	json.NewEncoder(w).Encode(ParseResponse{Entries: allEntries})
}
