import express from 'express';
import cors from 'cors';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;
const GO_PARSER_URL = 'http://localhost:3001';

app.use(cors());
app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }
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

app.post('/api/parse', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
    }

    const response = await fetch(`${GO_PARSER_URL}/parse`, {
      method: 'POST',
      body: formData as any,
      headers: formData.getHeaders()
    });

    const data = await response.json() as ParseResponse;
    
    if (data.error) {
      res.status(500).json({ error: data.error });
      return;
    }

    storedEntries = data.entries || [];
    res.json({ 
      success: true, 
      totalEntries: storedEntries.length,
      filenames: files.map(f => f.originalname)
    });
  } catch (error) {
    console.error('Parse error:', error);
    storedEntries = [];
    res.status(500).json({ error: 'Failed to parse files. Is the Go parser service running?' });
  }
});

app.get('/api/entries', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10000;
  
  const totalEntries = storedEntries.length;
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalEntries);
  
  res.json({
    entries: storedEntries.slice(start, end),
    pagination: {
      page: safePage,
      pageSize,
      totalEntries,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1
    }
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const goHealth = await fetch(`${GO_PARSER_URL}/health`);
    const goStatus = await goHealth.json();
    res.json({ 
      server: 'ok', 
      parser: goStatus 
    });
  } catch (error) {
    res.json({ 
      server: 'ok', 
      parser: 'unavailable' 
    });
  }
});

app.use(express.static(path.join(__dirname, '../../client/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
