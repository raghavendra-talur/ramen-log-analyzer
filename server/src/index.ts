import express from "express";
import cors from "cors";
import multer from "multer";
import FormData from "form-data";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;
const GO_PARSER_URL = "http://127.0.0.1:3001";

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

interface LogEntry {
  Raw: string;
  Timestamp: string;
  Level: string;
  Logger: string;
  FilePosition: string;
  Message: string;
  DetailsJSON: string;
  IsValid: boolean;
  ParseError: string;
  StackTrace: string[];
  Time: string;
  Filename: string;
}

interface ParseResponse {
  entries: LogEntry[];
  error?: string;
}

let storedEntries: LogEntry[] = [];

app.post("/api/parse", upload.array("files"), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
    }

    const response = await fetch(`${GO_PARSER_URL}/parse`, {
      method: "POST",
      body: formData as any,
      headers: formData.getHeaders(),
    });

    const data = (await response.json()) as ParseResponse;

    if (data.error) {
      res.status(500).json({ error: data.error });
      return;
    }

    storedEntries = data.entries || [];
    res.json({
      success: true,
      totalEntries: storedEntries.length,
      filenames: files.map((f) => f.originalname),
    });
  } catch (error) {
    console.error("Parse error:", error);
    storedEntries = [];
    res
      .status(500)
      .json({
        error: "Failed to parse files. Is the Go parser service running?",
      });
  }
});

app.get("/api/entries", (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 100;

  // Server-side filtering
  const filters = {
    timestamp: ((req.query.timestamp as string) || "").toLowerCase(),
    level: (req.query.level as string) || "",
    logger: ((req.query.logger as string) || "").toLowerCase(),
    filePosition: ((req.query.filePosition as string) || "").toLowerCase(),
    message: ((req.query.message as string) || "").toLowerCase(),
    details: ((req.query.details as string) || "").toLowerCase(),
    filename: ((req.query.filename as string) || "").toLowerCase(),
    showInvalid: req.query.showInvalid !== "false",
  };

  let filteredEntries = storedEntries.filter((entry) => {
    if (!filters.showInvalid && !entry.IsValid) return false;

    if (
      filters.timestamp &&
      !entry.Timestamp?.toLowerCase().includes(filters.timestamp)
    ) {
      return false;
    }
    if (filters.level && entry.Level !== filters.level) {
      return false;
    }
    if (
      filters.logger &&
      !entry.Logger?.toLowerCase().includes(filters.logger)
    ) {
      return false;
    }
    if (
      filters.filePosition &&
      !entry.FilePosition?.toLowerCase().includes(filters.filePosition)
    ) {
      return false;
    }
    if (
      filters.message &&
      !entry.Message?.toLowerCase().includes(filters.message)
    ) {
      return false;
    }
    if (
      filters.details &&
      !entry.DetailsJSON?.toLowerCase().includes(filters.details)
    ) {
      return false;
    }
    if (
      filters.filename &&
      !entry.Filename?.toLowerCase().includes(filters.filename)
    ) {
      return false;
    }

    return true;
  });

  const totalEntries = filteredEntries.length;
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;
  const safePage = Math.min(Math.max(1, page), totalPages);

  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalEntries);

  res.json({
    entries: filteredEntries.slice(start, end),
    pagination: {
      page: safePage,
      pageSize,
      totalEntries,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
    totalUnfiltered: storedEntries.length,
  });
});

// Helper to extract a key from JSON details
function extractKeyFromDetails(
  detailsJSON: string,
  key: string,
): string | null {
  if (!detailsJSON) return null;
  try {
    const parsed = JSON.parse(detailsJSON);
    return parsed[key] !== undefined ? String(parsed[key]) : null;
  } catch {
    return null;
  }
}

// Grouped entries endpoint
app.get("/api/grouped", (req, res) => {
  const groupByKey = req.query.groupBy as string;

  if (!groupByKey) {
    res.status(400).json({ error: "groupBy parameter is required" });
    return;
  }

  // Apply same filters as /api/entries
  const filters = {
    timestamp: ((req.query.timestamp as string) || "").toLowerCase(),
    level: (req.query.level as string) || "",
    logger: ((req.query.logger as string) || "").toLowerCase(),
    filePosition: ((req.query.filePosition as string) || "").toLowerCase(),
    message: ((req.query.message as string) || "").toLowerCase(),
    details: ((req.query.details as string) || "").toLowerCase(),
    filename: ((req.query.filename as string) || "").toLowerCase(),
    showInvalid: req.query.showInvalid !== "false",
  };

  let filteredEntries = storedEntries.filter((entry) => {
    if (!filters.showInvalid && !entry.IsValid) return false;
    if (
      filters.timestamp &&
      !entry.Timestamp?.toLowerCase().includes(filters.timestamp)
    )
      return false;
    if (filters.level && entry.Level !== filters.level) return false;
    if (filters.logger && !entry.Logger?.toLowerCase().includes(filters.logger))
      return false;
    if (
      filters.filePosition &&
      !entry.FilePosition?.toLowerCase().includes(filters.filePosition)
    )
      return false;
    if (
      filters.message &&
      !entry.Message?.toLowerCase().includes(filters.message)
    )
      return false;
    if (
      filters.details &&
      !entry.DetailsJSON?.toLowerCase().includes(filters.details)
    )
      return false;
    if (
      filters.filename &&
      !entry.Filename?.toLowerCase().includes(filters.filename)
    )
      return false;
    return true;
  });

  // Group entries by the specified key
  const groups = new Map<string, LogEntry[]>();
  const ungroupedEntries: LogEntry[] = [];

  for (const entry of filteredEntries) {
    const keyValue = extractKeyFromDetails(entry.DetailsJSON, groupByKey);
    if (keyValue) {
      if (!groups.has(keyValue)) {
        groups.set(keyValue, []);
      }
      groups.get(keyValue)!.push(entry);
    } else {
      ungroupedEntries.push(entry);
    }
  }

  // Convert to array format with summaries
  const groupedResults: Array<{
    groupKey: string;
    keyValue: string;
    count: number;
    firstEntry: LogEntry;
    lastEntry: LogEntry;
    allEntries: LogEntry[];
  }> = [];

  for (const [keyValue, entries] of groups) {
    if (entries.length > 0) {
      groupedResults.push({
        groupKey: groupByKey,
        keyValue,
        count: entries.length,
        firstEntry: entries[0],
        lastEntry: entries[entries.length - 1],
        allEntries: entries,
      });
    }
  }

  // Sort groups by first entry timestamp
  groupedResults.sort((a, b) => {
    const aTime = a.firstEntry.Timestamp || "";
    const bTime = b.firstEntry.Timestamp || "";
    return aTime.localeCompare(bTime);
  });

  res.json({
    groups: groupedResults,
    ungroupedEntries,
    totalGroups: groupedResults.length,
    totalGroupedEntries: filteredEntries.length - ungroupedEntries.length,
    totalUngrouped: ungroupedEntries.length,
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const goHealth = await fetch(`${GO_PARSER_URL}/health`);
    const goStatus = await goHealth.json();
    res.json({
      server: "ok",
      parser: goStatus,
    });
  } catch (error) {
    res.json({
      server: "ok",
      parser: "unavailable",
    });
  }
});

app.use(express.static(path.join(__dirname, "../../client/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
