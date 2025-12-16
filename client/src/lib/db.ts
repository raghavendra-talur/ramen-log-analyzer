import { Session, ParsedChunk, SavedView, AvailableKeys, LogEntry } from './types';

const DB_NAME = 'ramen-log-analyzer';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('sessions')) {
        const sessionsStore = database.createObjectStore('sessions', { keyPath: 'id' });
        sessionsStore.createIndex('createdAt', 'createdAt');
      }

      if (!database.objectStoreNames.contains('chunks')) {
        const chunksStore = database.createObjectStore('chunks', { keyPath: 'id' });
        chunksStore.createIndex('sessionId', 'sessionId');
        chunksStore.createIndex('sessionFile', ['sessionId', 'filename']);
      }

      if (!database.objectStoreNames.contains('views')) {
        const viewsStore = database.createObjectStore('views', { keyPath: 'id' });
        viewsStore.createIndex('sessionId', 'sessionId');
      }

      if (!database.objectStoreNames.contains('keys')) {
        database.createObjectStore('keys', { keyPath: 'sessionId' });
      }
    };
  });
}

export async function getDB(): Promise<IDBDatabase> {
  if (!db) {
    return initDB();
  }
  return db;
}

export async function saveSession(session: Session): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSession(id: string): Promise<Session | undefined> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('sessions', 'readonly');
    const request = tx.objectStore('sessions').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSessions(): Promise<Session[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('sessions', 'readonly');
    const request = tx.objectStore('sessions').index('createdAt').getAll();
    request.onsuccess = () => resolve(request.result.reverse());
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['sessions', 'chunks', 'views', 'keys'], 'readwrite');
    
    tx.objectStore('sessions').delete(id);
    
    const chunksStore = tx.objectStore('chunks');
    const chunksIndex = chunksStore.index('sessionId');
    const chunksRequest = chunksIndex.openCursor(IDBKeyRange.only(id));
    chunksRequest.onsuccess = () => {
      const cursor = chunksRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    const viewsStore = tx.objectStore('views');
    const viewsIndex = viewsStore.index('sessionId');
    const viewsRequest = viewsIndex.openCursor(IDBKeyRange.only(id));
    viewsRequest.onsuccess = () => {
      const cursor = viewsRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.objectStore('keys').delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveChunk(chunk: ParsedChunk): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('chunks', 'readwrite');
    tx.objectStore('chunks').put(chunk);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChunksForSession(sessionId: string): Promise<ParsedChunk[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('chunks', 'readonly');
    const index = tx.objectStore('chunks').index('sessionId');
    const request = index.getAll(IDBKeyRange.only(sessionId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllEntriesForSession(sessionId: string): Promise<LogEntry[]> {
  const chunks = await getChunksForSession(sessionId);
  chunks.sort((a, b) => {
    if (a.filename !== b.filename) return a.filename.localeCompare(b.filename);
    return a.chunkIndex - b.chunkIndex;
  });
  
  const allEntries: LogEntry[] = [];
  for (const chunk of chunks) {
    allEntries.push(...chunk.entries);
  }
  
  allEntries.sort((a, b) => {
    if (!a.IsValid && !b.IsValid) return 0;
    if (!a.IsValid) return 1;
    if (!b.IsValid) return -1;
    return (a.Time || 0) - (b.Time || 0);
  });
  
  return allEntries;
}

export async function saveAvailableKeys(keys: AvailableKeys): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(keys);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAvailableKeys(sessionId: string): Promise<string[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('keys', 'readonly');
    const request = tx.objectStore('keys').get(sessionId);
    request.onsuccess = () => resolve(request.result?.keys || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveView(view: SavedView): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('views', 'readwrite');
    tx.objectStore('views').put(view);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getViewsForSession(sessionId: string): Promise<SavedView[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('views', 'readonly');
    const index = tx.objectStore('views').index('sessionId');
    const request = index.getAll(IDBKeyRange.only(sessionId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllData(): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['sessions', 'chunks', 'views', 'keys'], 'readwrite');
    tx.objectStore('sessions').clear();
    tx.objectStore('chunks').clear();
    tx.objectStore('views').clear();
    tx.objectStore('keys').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.slice(0, 1024 * 1024).arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('') + '-' + file.size;
}
