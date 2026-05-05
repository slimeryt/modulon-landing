import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * @param {string} filePath
 * @returns {import('better-sqlite3').Database}
 */
function resolveJournalMode() {
  const raw = (process.env.SQLITE_JOURNAL_MODE || '').trim().toUpperCase();
  if (raw === 'DELETE' || raw === 'TRUNCATE' || raw === 'PERSIST' || raw === 'WAL') {
    return raw;
  }
  // WAL creates -wal/-shm siblings; some cloud volume mounts misbehave with them.
  if (process.env.RAILWAY_ENVIRONMENT) return 'DELETE';
  return 'WAL';
}

export function openChatDatabase(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma(`journal_mode = ${resolveJournalMode()}`);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      body TEXT NOT NULL,
      prototype INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  `);
  return db;
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createChatStore(db) {
  const insertConversation = db.prepare(
    `INSERT INTO conversations (title) VALUES ('New chat')`,
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (conversation_id, role, body, prototype) VALUES (?, ?, ?, ?)`,
  );
  const touchConversation = db.prepare(
    `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
  );
  const updateTitle = db.prepare(`UPDATE conversations SET title = ? WHERE id = ?`);

  return {
    createConversation() {
      const r = insertConversation.run();
      return Number(r.lastInsertRowid);
    },

    conversationExists(id) {
      const row = db.prepare(`SELECT 1 AS ok FROM conversations WHERE id = ?`).get(id);
      return !!row;
    },

    listConversations(limit = 100) {
      return db
        .prepare(
          `
        SELECT c.id, c.title, c.created_at, c.updated_at,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
        FROM conversations c
        ORDER BY datetime(c.updated_at) DESC
        LIMIT ?
      `,
        )
        .all(Math.min(500, Math.max(1, limit)));
    },

    getMessages(conversationId) {
      return db
        .prepare(
          `
        SELECT id, role, body, prototype, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id ASC
      `,
        )
        .all(conversationId);
    },

    appendMessage(conversationId, role, body, prototype = false) {
      insertMessage.run(conversationId, role, body, prototype ? 1 : 0);
      touchConversation.run(conversationId);
    },

    maybeSetTitleFromFirstUser(conversationId, userText) {
      const row = db
        .prepare(`SELECT title FROM conversations WHERE id = ?`)
        .get(conversationId);
      if (!row || row.title !== 'New chat') return;
      const t = userText.trim().replace(/\s+/g, ' ').slice(0, 56);
      if (t) updateTitle.run(t, conversationId);
    },

    deleteConversation(conversationId) {
      db.prepare(`DELETE FROM conversations WHERE id = ?`).run(conversationId);
    },

    renameConversation(conversationId, title) {
      const t = String(title ?? '').trim().slice(0, 120);
      if (!t) return false;
      updateTitle.run(t, conversationId);
      touchConversation.run(conversationId);
      return true;
    },
  };
}
