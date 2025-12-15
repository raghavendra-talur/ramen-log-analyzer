package main

import (
        "embed"
        "log"
        "net/http"

        "github.com/raghavendra-talur/ramen-log-analyzer/handlers"
)

const PORT = "0.0.0.0:5000" // Server port number

//go:embed templates/index.html
var content embed.FS

func main() {
        // Create new handler
        handler, err := handlers.New(content)
        if err != nil {
                log.Fatal(err)
        }

        // Set up routes
        http.HandleFunc("/", handler.HandleIndex)

        // Start server
        log.Printf("Server starting on %s...\n", PORT)
        log.Printf("Maximum file size: %d bytes\n", handlers.MAX_FILE_SIZE)
        log.Fatal(http.ListenAndServe(PORT, nil))
}
