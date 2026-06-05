"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main/services/learningGraph.ts
var learningGraph_exports = {};
__export(learningGraph_exports, {
  buildLearningGraph: () => buildLearningGraph
});
module.exports = __toCommonJS(learningGraph_exports);

// src/main/services/llm.ts
var API_KEY = process.env.DEEPSEEK_API_KEY || "";
var BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1/chat/completions";
var MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
var PRO_MODEL = process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro";

// src/main/services/memoryArchive.ts
var import_path = require("path");
var DATA_DIR = (0, import_path.join)(process.env.HOME || "/tmp", ".xuemate");
var ARCHIVE_DIR = (0, import_path.join)(DATA_DIR, "archives");
var ARCHIVE_FILES = {
  topics: (0, import_path.join)(ARCHIVE_DIR, "topics.md"),
  weak: (0, import_path.join)(ARCHIVE_DIR, "weak.md"),
  strong: (0, import_path.join)(ARCHIVE_DIR, "strong.md")
};

// src/main/services/memoryProfile.ts
var import_crypto = require("crypto");

// src/main/domain/memory.ts
var DEFAULT_MEMORY = {
  version: 2,
  profile: { name: "", school: "", grade: "", major: "", learningGoals: [] },
  preferences: { subjects: [], difficulty: "medium", language: "zh" },
  history: { topics: [], weakPoints: [], strongPoints: [] },
  atoms: [],
  learningProfile: { recentTopics: [], weakSkills: [], strongSkills: [], goals: [], reviewQueue: [] },
  metrics: {
    atomCount: 0,
    activeAtomCount: 0,
    avgConfidence: 0,
    weakPointCount: 0,
    strongPointCount: 0,
    reviewQueueCount: 0
  },
  lastUpdated: 0
};
var MEMORY_VERSION = 2;
var ACTIVE_CONFIDENCE_THRESHOLD = 0.38;
var MAX_ATOMS = 180;
var MAX_EVIDENCE_PER_ATOM = 3;

// src/main/services/memoryProfile.ts
function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}
function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
function normalizeAtoms(atoms) {
  const now2 = Date.now();
  const normalized = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of atoms || []) {
    const category = raw.category || "topic";
    const key = normalizeKey(raw.key || raw.value);
    const value = String(raw.value || raw.key || "").trim();
    if (!key || !value) continue;
    const uniqueKey = `${category}:${key}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    normalized.push({
      id: raw.id || `${category}-${Math.abs(hashString(uniqueKey))}`,
      category,
      key,
      value: value.slice(0, 160),
      confidence: clamp01(Number(raw.confidence ?? 0.55)),
      importance: clamp01(Number(raw.importance ?? 0.5)),
      evidence: uniqueStrings(raw.evidence || []).slice(0, MAX_EVIDENCE_PER_ATOM),
      source: raw.source || "chat",
      firstSeen: Number(raw.firstSeen || now2),
      lastSeen: Number(raw.lastSeen || raw.firstSeen || now2),
      hits: Math.max(1, Number(raw.hits || 1))
    });
  }
  return normalized.sort((a, b) => memoryPriority(b) - memoryPriority(a)).slice(0, MAX_ATOMS);
}
function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(31, hash) + value.charCodeAt(i) | 0;
  }
  return hash;
}
function categoryHalfLifeDays(category) {
  switch (category) {
    case "profile":
    case "preference":
      return 365;
    case "goal":
      return 120;
    case "weak_point":
    case "misconception":
      return 45;
    case "strong_point":
      return 70;
    case "behavior":
      return 50;
    case "topic":
    default:
      return 30;
  }
}
function decayedConfidence(atom, now2 = Date.now()) {
  const ageDays = Math.max(0, (now2 - atom.lastSeen) / (24 * 60 * 60 * 1e3));
  const halfLife = categoryHalfLifeDays(atom.category) * (0.7 + atom.importance * 0.8);
  const decay = Math.pow(0.5, ageDays / Math.max(halfLife, 1));
  return clamp01(atom.confidence * decay);
}
function memoryPriority(atom) {
  return decayedConfidence(atom) * 0.55 + atom.importance * 0.3 + Math.min(atom.hits, 8) * 0.018;
}
function activeAtoms(memory) {
  return (memory.atoms || []).map((atom) => ({ ...atom, confidence: decayedConfidence(atom) })).filter((atom) => atom.confidence >= ACTIVE_CONFIDENCE_THRESHOLD).sort((a, b) => memoryPriority(b) - memoryPriority(a));
}
function upsertMemoryAtom(memory, atom) {
  const now2 = Date.now();
  const atoms = memory.atoms ||= [];
  const key = normalizeKey(atom.key || atom.value);
  const value = String(atom.value || atom.key || "").trim();
  if (!key || !value) return;
  const existing = atoms.find((item) => item.category === atom.category && item.key === key);
  if (existing) {
    existing.value = value.slice(0, 160);
    existing.confidence = clamp01(
      decayedConfidence(existing, now2) * 0.72 + clamp01(atom.confidence) * 0.35 + 0.04
    );
    existing.importance = clamp01(Math.max(existing.importance, atom.importance));
    existing.evidence = uniqueStrings([...atom.evidence || [], ...existing.evidence]).slice(
      0,
      MAX_EVIDENCE_PER_ATOM
    );
    existing.lastSeen = now2;
    existing.hits += 1;
    return;
  }
  atoms.push({
    id: atom.id || (0, import_crypto.randomUUID)(),
    category: atom.category,
    key,
    value: value.slice(0, 160),
    confidence: clamp01(atom.confidence),
    importance: clamp01(atom.importance),
    evidence: uniqueStrings(atom.evidence || []).slice(0, MAX_EVIDENCE_PER_ATOM),
    source: atom.source || "chat",
    firstSeen: atom.firstSeen || now2,
    lastSeen: atom.lastSeen || now2,
    hits: Math.max(1, atom.hits || 1)
  });
}
function inferSubject(text) {
  if (/数学|分数|方程|几何|小数|计算|公式/.test(text)) return "\u6570\u5B66";
  if (/英语|单词|语法|拼读|作文|阅读/.test(text)) return "\u82F1\u8BED";
  if (/科学|实验|植物|磁铁|过滤|物理|化学/.test(text)) return "\u79D1\u5B66";
  if (/语文|作文|阅读|古诗|拼音/.test(text)) return "\u8BED\u6587";
  if (/python|代码|编程|算法|列表|循环/i.test(text)) return "\u7F16\u7A0B";
  return "\u7EFC\u5408";
}
function refreshMemoryDerivedState(memory) {
  const atoms = normalizeAtoms(memory.atoms || []);
  memory.atoms = atoms;
  const now2 = Date.now();
  const active = activeAtoms(memory);
  const topicAtoms = active.filter((atom) => atom.category === "topic");
  const weakAtoms = active.filter(
    (atom) => atom.category === "weak_point" || atom.category === "misconception"
  );
  const strongAtoms = active.filter((atom) => atom.category === "strong_point");
  const goalAtoms = active.filter((atom) => atom.category === "goal");
  memory.learningProfile = {
    recentTopics: uniqueStrings(topicAtoms.map((atom) => atom.value)).slice(0, 12),
    weakSkills: weakAtoms.slice(0, 12).map((atom) => ({
      key: atom.value,
      subject: inferSubject(atom.value),
      mastery: clamp01(0.5 - decayedConfidence(atom) * 0.35),
      evidenceCount: atom.hits,
      lastPracticed: atom.lastSeen
    })),
    strongSkills: strongAtoms.slice(0, 10).map((atom) => ({
      key: atom.value,
      subject: inferSubject(atom.value),
      mastery: clamp01(0.62 + decayedConfidence(atom) * 0.28),
      evidenceCount: atom.hits,
      lastPracticed: atom.lastSeen
    })),
    goals: uniqueStrings([...memory.profile.learningGoals, ...goalAtoms.map((atom) => atom.value)]).slice(
      0,
      10
    ),
    reviewQueue: weakAtoms.slice(0, 8).map((atom) => ({
      key: atom.value,
      reason: atom.category === "misconception" ? "\u7591\u4F3C\u8BEF\u533A\uFF0C\u9700\u8981\u7EA0\u6B63" : "\u8584\u5F31\u70B9\u9700\u8981\u590D\u4E60",
      dueAt: now2 + Math.max(1, 7 - Math.round(atom.importance * 5)) * 24 * 60 * 60 * 1e3,
      priority: Math.round((atom.importance * 0.5 + decayedConfidence(atom) * 0.5) * 100)
    }))
  };
  memory.metrics = {
    atomCount: atoms.length,
    activeAtomCount: active.length,
    avgConfidence: active.length > 0 ? Number((active.reduce((sum, atom) => sum + atom.confidence, 0) / active.length).toFixed(3)) : 0,
    weakPointCount: weakAtoms.length,
    strongPointCount: strongAtoms.length,
    reviewQueueCount: memory.learningProfile.reviewQueue.length
  };
}

// src/main/services/memoryNormalizer.ts
function normalizeMemory(raw) {
  const memory = {
    ...DEFAULT_MEMORY,
    ...raw,
    profile: { ...DEFAULT_MEMORY.profile, ...raw?.profile || {} },
    preferences: { ...DEFAULT_MEMORY.preferences, ...raw?.preferences || {} },
    history: { ...DEFAULT_MEMORY.history, ...raw?.history || {} },
    atoms: Array.isArray(raw?.atoms) ? raw.atoms : [],
    learningProfile: {
      ...DEFAULT_MEMORY.learningProfile,
      ...raw?.learningProfile || {}
    },
    metrics: { ...DEFAULT_MEMORY.metrics, ...raw?.metrics || {} },
    version: MEMORY_VERSION
  };
  memory.preferences.subjects = uniqueStrings(memory.preferences.subjects || []).slice(0, 12);
  memory.preferences.language = normalizeLanguagePreference(memory.preferences.language);
  memory.profile.learningGoals = uniqueStrings(memory.profile.learningGoals || []).slice(0, 12);
  memory.history.topics = uniqueStrings(memory.history.topics || []).slice(-40);
  memory.history.weakPoints = uniqueStrings(memory.history.weakPoints || []).slice(-40);
  memory.history.strongPoints = uniqueStrings(memory.history.strongPoints || []).slice(-40);
  memory.atoms = normalizeAtoms(memory.atoms || []);
  if (memory.atoms.length === 0) {
    const now2 = memory.lastUpdated || Date.now();
    for (const item of memory.history.topics || []) {
      upsertMemoryAtom(memory, {
        category: "topic",
        key: item,
        value: item,
        confidence: 0.58,
        importance: 0.46,
        evidence: ["\u6765\u81EA\u65E7\u7248\u5B66\u4E60\u5386\u53F2"],
        source: "system",
        firstSeen: now2,
        lastSeen: now2,
        hits: 1
      });
    }
    for (const item of memory.history.weakPoints || []) {
      upsertMemoryAtom(memory, {
        category: "weak_point",
        key: item,
        value: item,
        confidence: 0.66,
        importance: 0.74,
        evidence: ["\u6765\u81EA\u65E7\u7248\u8584\u5F31\u70B9\u8BB0\u5F55"],
        source: "system",
        firstSeen: now2,
        lastSeen: now2,
        hits: 1
      });
    }
    for (const item of memory.history.strongPoints || []) {
      upsertMemoryAtom(memory, {
        category: "strong_point",
        key: item,
        value: item,
        confidence: 0.62,
        importance: 0.54,
        evidence: ["\u6765\u81EA\u65E7\u7248\u638C\u63E1\u70B9\u8BB0\u5F55"],
        source: "system",
        firstSeen: now2,
        lastSeen: now2,
        hits: 1
      });
    }
  }
  refreshMemoryDerivedState(memory);
  return memory;
}
function normalizeLanguagePreference(value) {
  const label = String(value || "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!label) return DEFAULT_MEMORY.preferences.language;
  if (/^(zh|cn|中文|汉语|普通话)$/i.test(label)) return "zh";
  if (/^(en|eng|english|英文|英语)$/i.test(label)) return "en";
  return label;
}

// src/main/services/db.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_path2 = require("path");
var import_fs = require("fs");
var DATA_DIR2 = (0, import_path2.join)(process.env.HOME || "/tmp", ".xuemate");
var DB_PATH = (0, import_path2.join)(DATA_DIR2, "xuemate.db");
var DEFAULT_COLLECTION_ID = "default";
if (!(0, import_fs.existsSync)(DATA_DIR2)) {
  (0, import_fs.mkdirSync)(DATA_DIR2, { recursive: true });
}
var db = new import_better_sqlite3.default(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '\u65B0\u5BF9\u8BDD',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);

  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL DEFAULT 'default' REFERENCES collections(id) ON DELETE RESTRICT,
    file_name TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL DEFAULT 'default' REFERENCES collections(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    start_pos INTEGER NOT NULL,
    end_pos INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    deadline TEXT NOT NULL DEFAULT '',
    deadline_ts INTEGER NOT NULL DEFAULT 0,
    format TEXT NOT NULL DEFAULT '\u4E0D\u9650',
    naming TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
    source_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    reminded_24h INTEGER NOT NULL DEFAULT 0,
    reminded_1h INTEGER NOT NULL DEFAULT 0
  );
`);
function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}
function addColumnIfMissing(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}
var now = Date.now();
db.prepare(
  `INSERT OR IGNORE INTO collections (id, name, description, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?)`
).run(DEFAULT_COLLECTION_ID, "\u9ED8\u8BA4\u8D44\u6599\u5E93", "\u81EA\u52A8\u521B\u5EFA\u7684\u9ED8\u8BA4\u8D44\u6599\u5E93", now, now);
addColumnIfMissing(
  "documents",
  "collection_id",
  `collection_id TEXT NOT NULL DEFAULT '${DEFAULT_COLLECTION_ID}'`
);
addColumnIfMissing(
  "chunks",
  "collection_id",
  `collection_id TEXT NOT NULL DEFAULT '${DEFAULT_COLLECTION_ID}'`
);
db.exec(`
  UPDATE documents SET collection_id = '${DEFAULT_COLLECTION_ID}'
  WHERE collection_id IS NULL OR collection_id = '';

  UPDATE chunks SET collection_id = '${DEFAULT_COLLECTION_ID}'
  WHERE collection_id IS NULL OR collection_id = '';

  CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection_id);
`);
var db_default = db;

// src/main/dao/memoryDao.ts
var stmtGet = db_default.prepare("SELECT data FROM memory WHERE id = 1");
var stmtSave = db_default.prepare("INSERT OR REPLACE INTO memory (id, data, updated_at) VALUES (1, ?, ?)");
function loadMemoryData() {
  const row = stmtGet.get();
  return row?.data ?? null;
}

// src/main/services/memory.ts
function getMemory() {
  try {
    const data = loadMemoryData();
    if (!data) return normalizeMemory({ ...DEFAULT_MEMORY });
    return normalizeMemory(JSON.parse(data));
  } catch {
    return normalizeMemory({ ...DEFAULT_MEMORY });
  }
}

// src/main/domain/rag.ts
var ALL_COLLECTIONS_ID = "all";
var RAG_OFF_ID = "off";

// src/main/dao/learningGraphDao.ts
var stmts = {
  getCollection: db_default.prepare("SELECT * FROM collections WHERE id = ?"),
  getCollections: db_default.prepare("SELECT * FROM collections ORDER BY updated_at DESC"),
  getDocsAll: db_default.prepare(`
    SELECT d.*, c.name AS collection_name
    FROM documents d
    LEFT JOIN collections c ON c.id = d.collection_id
    ORDER BY d.created_at DESC
    LIMIT ?
  `),
  getDocsByCollection: db_default.prepare(`
    SELECT d.*, c.name AS collection_name
    FROM documents d
    LEFT JOIN collections c ON c.id = d.collection_id
    WHERE d.collection_id = ?
    ORDER BY d.created_at DESC
    LIMIT ?
  `),
  getChunksAll: db_default.prepare(`
    SELECT *
    FROM chunks
    ORDER BY created_at DESC, start_pos ASC
    LIMIT ?
  `),
  getChunksByCollection: db_default.prepare(`
    SELECT *
    FROM chunks
    WHERE collection_id = ?
    ORDER BY created_at DESC, start_pos ASC
    LIMIT ?
  `)
};
function findCollectionById(id) {
  return stmts.getCollection.get(id) ?? null;
}
function findCollections() {
  return stmts.getCollections.all();
}
function findDocuments(limit) {
  return stmts.getDocsAll.all(limit);
}
function findDocumentsByCollection(collectionId, limit) {
  return stmts.getDocsByCollection.all(collectionId, limit);
}
function findChunks(limit) {
  return stmts.getChunksAll.all(limit);
}
function findChunksByCollection(collectionId, limit) {
  return stmts.getChunksByCollection.all(collectionId, limit);
}

// src/main/services/learningGraph.ts
var MAX_DOC_NODES = 32;
var MAX_CHUNK_SCAN = 420;
var MAX_CHUNK_NODES = 42;
var MAX_CONCEPT_NODES = 42;
var MAX_MEMORY_NODES = 28;
var MAX_REVIEW_NODES = 14;
var englishStopWords = /* @__PURE__ */ new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "your",
  "their",
  "about",
  "of",
  "using",
  "use",
  "can",
  "should",
  "will",
  "todo",
  "note",
  "notes",
  "version",
  "final",
  "demo",
  "page",
  "file",
  "data",
  "text",
  "true",
  "false",
  "null",
  "undefined",
  "xuemate"
]);
var chineseStopWords = /* @__PURE__ */ new Set([
  "\u6211\u4EEC",
  "\u4F60\u4EEC",
  "\u4ED6\u4EEC",
  "\u8FD9\u4E2A",
  "\u90A3\u4E2A",
  "\u8FD9\u4E9B",
  "\u90A3\u4E9B",
  "\u53EF\u4EE5",
  "\u9700\u8981",
  "\u8FDB\u884C",
  "\u901A\u8FC7",
  "\u5982\u679C",
  "\u7136\u540E",
  "\u56E0\u4E3A",
  "\u6240\u4EE5",
  "\u4EE5\u53CA",
  "\u5305\u62EC",
  "\u4E00\u4E2A",
  "\u4E00\u4E9B",
  "\u5185\u5BB9",
  "\u8D44\u6599",
  "\u6587\u6863",
  "\u6587\u4EF6",
  "\u5B66\u751F",
  "\u8001\u5E08",
  "\u5B66\u4E60",
  "\u8BFE\u7A0B",
  "\u8BFE\u5802",
  "\u4F5C\u4E1A",
  "\u95EE\u9898",
  "\u65B9\u6CD5",
  "\u6B65\u9AA4",
  "\u8BF4\u660E",
  "\u8981\u6C42",
  "\u7CFB\u7EDF",
  "\u5E73\u53F0",
  "\u529F\u80FD",
  "\u652F\u6301",
  "\u5C55\u793A",
  "\u6838\u5FC3",
  "\u6838\u5FC3\u5C55\u793A",
  "\u91CD\u5236\u7248",
  "\u89C6\u89C9",
  "\u589E\u5F3A\u7248",
  "\u89C6\u89C9\u589E\u5F3A\u7248",
  "\u76EE\u5F55",
  "\u65F6\u5019",
  "\u91CC\u9762",
  "\u8FD9\u91CC",
  "\u90A3\u91CC",
  "\u539F\u6765",
  "\u73B0\u5728",
  "\u597D\u5904",
  "\u542F\u52A8",
  "\u5B9A\u4F4D",
  "\u754C\u9762",
  "\u9875\u9762",
  "\u5165\u53E3",
  "\u6A21\u5757",
  "\u903B\u8F91",
  "\u72B6\u6001",
  "\u7ED3\u679C",
  "\u8F93\u5165",
  "\u8F93\u51FA",
  "\u5237\u65B0",
  "\u6253\u5F00",
  "\u5173\u95ED",
  "\u70B9\u51FB",
  "\u67E5\u770B",
  "\u751F\u6210",
  "\u6574\u7406",
  "\u5173\u8054",
  "\u81EA\u52A8",
  "\u9ED8\u8BA4",
  "\u5F53\u524D",
  "\u5168\u90E8"
]);
function normalizeCollectionId(collectionId) {
  if (!collectionId || collectionId === ALL_COLLECTIONS_ID) return null;
  if (collectionId === RAG_OFF_ID) return RAG_OFF_ID;
  return collectionId;
}
function safeText(value, max = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function stripExt(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}
function nodeId(type, raw) {
  return `${type}:${raw.replace(/[^a-z0-9\u4e00-\u9fff_-]+/gi, "-").slice(0, 96)}`;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function getCollectionName(collectionId) {
  const normalized = normalizeCollectionId(collectionId);
  if (!normalized) return "\u5168\u90E8\u8D44\u6599";
  if (normalized === RAG_OFF_ID) return "\u672A\u4F7F\u7528\u8D44\u6599";
  const row = findCollectionById(normalized);
  return row?.name || "\u5F53\u524D\u8D44\u6599\u5939";
}
function getCollectionsForGraph(collectionId) {
  const normalized = normalizeCollectionId(collectionId);
  if (normalized === RAG_OFF_ID) return [];
  if (normalized) {
    const row = findCollectionById(normalized);
    return row ? [row] : [];
  }
  return findCollections();
}
function getDocsForGraph(collectionId) {
  const normalized = normalizeCollectionId(collectionId);
  if (normalized === RAG_OFF_ID) return [];
  return normalized ? findDocumentsByCollection(normalized, MAX_DOC_NODES) : findDocuments(MAX_DOC_NODES);
}
function getChunksForGraph(collectionId) {
  const normalized = normalizeCollectionId(collectionId);
  if (normalized === RAG_OFF_ID) return [];
  return normalized ? findChunksByCollection(normalized, MAX_CHUNK_SCAN) : findChunks(MAX_CHUNK_SCAN);
}
function normalizeConceptLabel(value) {
  return safeText(value.replace(/[_-]+/g, " "), 36).replace(/^[\s:：,，.。/|]+|[\s:：,，.。/|]+$/g, "").trim();
}
function conceptKey(label) {
  return normalizeConceptLabel(label).toLowerCase().replace(/\s+/g, "-");
}
function isGoodEnglishTerm(term) {
  const normalized = term.toLowerCase();
  if (englishStopWords.has(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (normalized.length < 2 || normalized.length > 32) return false;
  if (/^[a-z]{2,3}$/.test(normalized) && term !== term.toUpperCase()) return false;
  return /[a-z]/i.test(normalized);
}
function isGoodChineseTerm(term) {
  const label = normalizeConceptLabel(term);
  if (label.length < 2 || label.length > 12) return false;
  if (chineseStopWords.has(label)) return false;
  if ([...chineseStopWords].some((stop) => label === stop || label.startsWith(stop + "\u7684"))) return false;
  if (/(目录|展示|视觉|增强版|重制版)/.test(label)) return false;
  if (/^(原|现|好|启|定|页|模|状|结|输|刷|打|关|点|查|生|整|关|自|默|当|全)/.test(label) && label.length <= 3) return false;
  return /[\u4e00-\u9fff]/.test(label);
}
function addCandidate(candidates, rawLabel, score, source) {
  const label = normalizeConceptLabel(rawLabel);
  if (!label) return;
  const hasChinese = /[\u4e00-\u9fff]/.test(label);
  const valid = hasChinese ? isGoodChineseTerm(label) : isGoodEnglishTerm(label);
  if (!valid) return;
  const key = conceptKey(label);
  const existing = candidates.get(key);
  if (existing) {
    existing.score += score;
    if (source === "title") existing.source = "title";
    return;
  }
  candidates.set(key, { label, score, source });
}
function addTitleTerms(candidates, text, score = 2.6) {
  const normalized = text.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/[()（）\[\]【】]/g, " ");
  for (const part of normalized.split(/[\s/|,，:：]+/)) {
    addCandidate(candidates, part, score, "title");
  }
  const cjk = normalized.match(/[\u4e00-\u9fff]{2,12}/g) || [];
  for (const term of cjk) addCandidate(candidates, term, score + 0.4, "title");
}
function addTechnicalTerms(candidates, text) {
  const matches = text.match(/[A-Za-z][A-Za-z0-9_+#.\-]{1,31}/g) || [];
  for (const raw of matches) {
    const parts = raw.includes("_") ? raw.split("_") : [raw];
    for (const part of parts) {
      const label = part.length <= 4 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
      addCandidate(candidates, label, /[A-Z]{2,}|\+|#|\d/.test(part) ? 2.2 : 1.3, "content");
    }
  }
}
function addHeadingTerms(candidates, text) {
  const lines = text.split(/\n+/).slice(0, 80);
  for (const line of lines) {
    const clean = line.replace(/^#{1,6}\s*/, "").trim();
    if (!clean || clean.length > 80) continue;
    if (/^[-*\d.\s]+$/.test(clean)) continue;
    const titleLike = /^#{1,6}\s*/.test(line) || /[:：]$/.test(clean) || clean.length <= 24;
    if (!titleLike) continue;
    for (const part of clean.split(/[，,、/|:：()（）\[\]【】]+/)) {
      addCandidate(candidates, part, 2, "title");
    }
  }
}
function addChineseNgrams(candidates, text) {
  const compact = text.replace(/\s+/g, "");
  const counts = /* @__PURE__ */ new Map();
  const sequences = compact.match(/[\u4e00-\u9fff]{2,40}/g) || [];
  for (const seq of sequences) {
    for (let n = 2; n <= 6; n++) {
      for (let i = 0; i <= seq.length - n; i++) {
        const gram = seq.slice(i, i + n);
        if (!isGoodChineseTerm(gram)) continue;
        counts.set(gram, (counts.get(gram) || 0) + 1);
      }
    }
  }
  for (const [term, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
    if (count < 2 && term.length <= 3) continue;
    addCandidate(candidates, term, Math.min(3.2, 0.7 + count * 0.45 + term.length * 0.08), "content");
  }
}
function subjectFromContext(options, label) {
  const collection = normalizeConceptLabel(options.collectionName || "");
  if (collection && !/^默认资料库|全部资料|当前资料夹$/.test(collection)) return collection;
  const title = normalizeConceptLabel(stripExt(options.fileName || ""));
  const titleParts = title.split(/[\s_\-/|]+/).filter(Boolean);
  const technical = titleParts.find((part) => /[A-Za-z][A-Za-z0-9+#.\-]*/.test(part));
  if (technical) return normalizeConceptLabel(technical).slice(0, 18);
  if (/[A-Za-z]/.test(label)) return "\u6280\u672F\u8BCD";
  return "\u81EA\u52A8\u62BD\u53D6";
}
function extractConcepts(text, options = {}) {
  const candidates = /* @__PURE__ */ new Map();
  const fullText = `${options.fileName || ""}
${text || ""}`.slice(0, 12e3);
  if (options.fileName) addTitleTerms(candidates, stripExt(options.fileName), 0.75);
  addHeadingTerms(candidates, fullText);
  addTechnicalTerms(candidates, fullText);
  addChineseNgrams(candidates, fullText);
  return [...candidates.values()].filter((item) => item.score >= 1.35 || /[A-Z]{2,}|\+|#|\d/.test(item.label)).sort((a, b) => b.score - a.score || a.label.length - b.label.length).slice(0, options.maxTerms || 6).map((item) => ({
    id: nodeId("concept", conceptKey(item.label)),
    label: item.label,
    subject: subjectFromContext(options, item.label),
    aliases: [],
    source: item.source,
    confidence: clamp(item.score / 6, 0.22, 0.92)
  }));
}
function dynamicConceptFromFile(fileName, collectionName) {
  const extracted = extractConcepts(fileName, { fileName, collectionName, maxTerms: 1 });
  if (extracted.length > 0) return { ...extracted[0], source: "fallback" };
  const label = safeText(stripExt(fileName), 18) || "\u8BFE\u7A0B\u8D44\u6599";
  return {
    id: nodeId("concept", conceptKey(label)),
    label,
    subject: subjectFromContext({ fileName, collectionName }, label),
    aliases: [],
    source: "fallback",
    confidence: 0.28
  };
}
function findBestConceptForMemory(atom, conceptById) {
  const text = `${atom.key} ${atom.value} ${(atom.evidence || []).join(" ")}`;
  const normalizedText = text.toLowerCase();
  for (const concept of conceptById.values()) {
    if (normalizedText.includes(concept.label.toLowerCase())) return concept;
    if ((concept.aliases || []).some((alias) => normalizedText.includes(alias.toLowerCase()))) {
      return concept;
    }
  }
  const extracted = extractConcepts(text, { maxTerms: 1 });
  if (extracted.length > 0) return { ...extracted[0], source: "memory" };
  const label = safeText(atom.value || atom.key, 16);
  return {
    id: nodeId("concept", conceptKey(label)),
    label,
    subject: subjectFromContext({}, label),
    aliases: [],
    source: "memory",
    confidence: 0.35
  };
}
function edgeId(source, target, type) {
  return `${type}:${source}->${target}`;
}
function buildLearningGraph(collectionId) {
  const normalized = normalizeCollectionId(collectionId);
  const effectiveCollectionId = normalized || ALL_COLLECTIONS_ID;
  const collectionName = getCollectionName(collectionId);
  const collections = getCollectionsForGraph(collectionId);
  const docs = getDocsForGraph(collectionId);
  const chunks = getChunksForGraph(collectionId);
  const memory = getMemory();
  const nodes = /* @__PURE__ */ new Map();
  const edges = /* @__PURE__ */ new Map();
  const conceptById = /* @__PURE__ */ new Map();
  const conceptScore = /* @__PURE__ */ new Map();
  const docConceptWeight = /* @__PURE__ */ new Map();
  const chunkConcepts = /* @__PURE__ */ new Map();
  const addNode = (node) => {
    const existing = nodes.get(node.id);
    if (!existing) {
      nodes.set(node.id, node);
      return;
    }
    existing.size = Math.max(existing.size, node.size);
    existing.score = Math.max(existing.score, node.score);
    existing.meta = { ...existing.meta || {}, ...node.meta || {} };
  };
  const addEdge = (source, target, type, label, weight = 1) => {
    if (!nodes.has(source) || !nodes.has(target) || source === target) return;
    const id = edgeId(source, target, type);
    const existing = edges.get(id);
    if (existing) {
      existing.weight = clamp(existing.weight + weight, 1, 12);
      return;
    }
    edges.set(id, { id, source, target, type, label, weight: clamp(weight, 1, 12) });
  };
  const rootId = nodeId("collection", effectiveCollectionId);
  addNode({
    id: rootId,
    label: collectionName,
    type: "collection",
    size: 18,
    score: 1,
    meta: {
      description: normalized ? "\u5F53\u524D\u8D44\u6599\u5939\u7684\u5B66\u4E60\u7F51\u7EDC" : "\u8DE8\u8D44\u6599\u5939\u7684\u6574\u4F53\u5B66\u4E60\u7F51\u7EDC",
      collectionId: effectiveCollectionId
    }
  });
  for (const collection of collections) {
    if (collection.id === effectiveCollectionId || normalized) continue;
    const id = nodeId("collection", collection.id);
    addNode({
      id,
      label: collection.name,
      type: "collection",
      size: 12,
      score: 0.7,
      meta: { description: collection.description || "\u8D44\u6599\u5939", collectionId: collection.id }
    });
    addEdge(rootId, id, "owns", "\u5305\u542B\u8D44\u6599\u5939", 1);
  }
  const docsById = /* @__PURE__ */ new Map();
  for (const doc of docs) {
    docsById.set(doc.id, doc);
    const id = nodeId("document", doc.id);
    const collectionNodeId = normalized ? rootId : nodeId("collection", doc.collection_id);
    addNode({
      id,
      label: safeText(stripExt(doc.file_name), 22),
      type: "document",
      size: clamp(7 + Math.sqrt(doc.chunk_count || 1), 8, 18),
      score: clamp((doc.chunk_count || 1) / 40, 0.2, 1),
      meta: {
        fileName: doc.file_name,
        chunkCount: doc.chunk_count,
        collectionId: doc.collection_id,
        collectionName: doc.collection_name,
        createdAt: doc.created_at
      }
    });
    addEdge(collectionNodeId, id, "owns", "\u6536\u5F55\u8D44\u6599", 1);
  }
  for (const chunk of chunks) {
    const doc = docsById.get(chunk.document_id);
    let concepts = extractConcepts(chunk.content, {
      fileName: chunk.file_name,
      collectionName: doc?.collection_name,
      maxTerms: 6
    });
    if (concepts.length === 0) {
      concepts = [dynamicConceptFromFile(chunk.file_name, doc?.collection_name)];
    }
    chunkConcepts.set(chunk.id, concepts);
    for (const concept of concepts) {
      conceptById.set(concept.id, concept);
      conceptScore.set(concept.id, (conceptScore.get(concept.id) || 0) + concept.confidence);
      const docMap = docConceptWeight.get(chunk.document_id) || /* @__PURE__ */ new Map();
      docMap.set(concept.id, (docMap.get(concept.id) || 0) + concept.confidence);
      docConceptWeight.set(chunk.document_id, docMap);
    }
  }
  const topConceptIds = [...conceptScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CONCEPT_NODES).map(([id]) => id);
  const topConceptSet = new Set(topConceptIds);
  for (const conceptId of topConceptIds) {
    const concept = conceptById.get(conceptId);
    if (!concept) continue;
    const score = conceptScore.get(conceptId) || 1;
    addNode({
      id: concept.id,
      label: concept.label,
      type: "concept",
      size: clamp(8 + Math.sqrt(score) * 2.6, 9, 24),
      score: clamp(score / 18, 0.25, 1),
      meta: {
        subject: concept.subject,
        mentions: Number(score.toFixed(2)),
        aliases: concept.aliases || [],
        source: concept.source,
        confidence: concept.confidence,
        dynamic: true
      }
    });
  }
  for (const [docId, weights] of docConceptWeight.entries()) {
    const docNodeId = nodeId("document", docId);
    for (const [conceptId, weight] of [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      if (!topConceptSet.has(conceptId)) continue;
      addEdge(docNodeId, conceptId, "mentions", "\u63D0\u5230\u77E5\u8BC6\u70B9", clamp(weight, 1, 8));
    }
  }
  const chunkCandidates = chunks.map((chunk) => ({
    chunk,
    concepts: (chunkConcepts.get(chunk.id) || []).filter((concept) => topConceptSet.has(concept.id))
  })).filter((item) => item.concepts.length > 0).sort((a, b) => b.concepts.length - a.concepts.length || a.chunk.start_pos - b.chunk.start_pos).slice(0, MAX_CHUNK_NODES);
  for (const { chunk, concepts } of chunkCandidates) {
    const id = nodeId("chunk", chunk.id);
    addNode({
      id,
      label: `\u7247\u6BB5 ${Math.floor(chunk.start_pos / 1e3) + 1}`,
      type: "chunk",
      size: clamp(5 + concepts.length * 1.4, 6, 12),
      score: clamp(concepts.length / 6, 0.2, 1),
      meta: {
        fileName: chunk.file_name,
        snippet: safeText(chunk.content, 180),
        position: `${chunk.start_pos}-${chunk.end_pos}`
      }
    });
    addEdge(nodeId("document", chunk.document_id), id, "contains", "\u5305\u542B\u7247\u6BB5", 1);
    for (const concept of concepts.slice(0, 5)) {
      addEdge(id, concept.id, "contains", "\u89E3\u91CA\u77E5\u8BC6\u70B9", 1);
    }
  }
  const atoms = (memory.atoms || []).filter(
    (atom) => ["topic", "weak_point", "strong_point", "goal", "misconception", "preference"].includes(
      atom.category
    )
  ).sort(
    (a, b) => b.importance * b.confidence + Math.min(b.hits, 8) * 0.03 - (a.importance * a.confidence + Math.min(a.hits, 8) * 0.03)
  ).slice(0, MAX_MEMORY_NODES);
  for (const atom of atoms) {
    const concept = findBestConceptForMemory(atom, conceptById);
    if (!nodes.has(concept.id)) {
      addNode({
        id: concept.id,
        label: concept.label,
        type: "concept",
        size: 9,
        score: 0.35,
        meta: { subject: concept.subject, mentions: 0, source: concept.source, confidence: concept.confidence, dynamic: true }
      });
    }
    const id = nodeId("memory", atom.id);
    addNode({
      id,
      label: atom.category === "weak_point" ? `\u8584\u5F31\uFF1A${safeText(atom.value, 12)}` : atom.category === "misconception" ? `\u8BEF\u533A\uFF1A${safeText(atom.value, 12)}` : atom.category === "strong_point" ? `\u638C\u63E1\uFF1A${safeText(atom.value, 12)}` : safeText(atom.value, 16),
      type: "memory",
      size: clamp(6 + atom.importance * 8 + atom.confidence * 5, 7, 18),
      score: clamp(atom.importance * 0.56 + atom.confidence * 0.44, 0.2, 1),
      meta: {
        category: atom.category,
        value: atom.value,
        confidence: atom.confidence,
        importance: atom.importance,
        hits: atom.hits,
        evidence: atom.evidence,
        lastSeen: atom.lastSeen
      }
    });
    if (atom.category === "weak_point" || atom.category === "misconception") {
      addEdge(id, concept.id, "weak_at", "\u8584\u5F31/\u8BEF\u533A", clamp(2 + atom.importance * 5, 2, 8));
    } else if (atom.category === "strong_point") {
      addEdge(id, concept.id, "strong_at", "\u638C\u63E1\u8F83\u597D", clamp(2 + atom.importance * 4, 2, 7));
    } else {
      addEdge(id, concept.id, "related_to", "\u5B66\u4E60\u76F8\u5173", 1);
    }
  }
  const reviewQueue = (memory.learningProfile?.reviewQueue || []).slice(0, MAX_REVIEW_NODES);
  for (const review of reviewQueue) {
    const fakeAtom = {
      key: review.key,
      value: review.key,
      evidence: [review.reason],
      category: "weak_point",
      confidence: 0.72,
      importance: review.priority / 100,
      hits: 1
    };
    const concept = findBestConceptForMemory(fakeAtom, conceptById);
    if (!nodes.has(concept.id)) {
      addNode({
        id: concept.id,
        label: concept.label,
        type: "concept",
        size: 9,
        score: 0.35,
        meta: { subject: concept.subject, source: concept.source, confidence: concept.confidence, dynamic: true }
      });
    }
    const id = nodeId("review", review.key);
    addNode({
      id,
      label: `\u590D\u4E60\uFF1A${safeText(review.key, 12)}`,
      type: "review",
      size: clamp(7 + review.priority / 10, 8, 18),
      score: clamp(review.priority / 100, 0.2, 1),
      meta: {
        reason: review.reason,
        dueAt: review.dueAt,
        priority: review.priority
      }
    });
    addEdge(id, concept.id, "reviews", "\u63A8\u8350\u590D\u4E60", clamp(2 + review.priority / 20, 2, 8));
  }
  const resultNodes = [...nodes.values()];
  const resultEdges = [...edges.values()];
  const possibleEdges = resultNodes.length > 1 ? resultNodes.length * (resultNodes.length - 1) / 2 : 1;
  const weakPointCount = resultNodes.filter(
    (node) => node.type === "memory" && (node.meta?.category === "weak_point" || node.meta?.category === "misconception")
  ).length;
  return {
    collectionId: effectiveCollectionId,
    collectionName,
    generatedAt: Date.now(),
    nodes: resultNodes,
    edges: resultEdges,
    stats: {
      nodeCount: resultNodes.length,
      edgeCount: resultEdges.length,
      collectionCount: resultNodes.filter((node) => node.type === "collection").length,
      documentCount: resultNodes.filter((node) => node.type === "document").length,
      chunkCount: resultNodes.filter((node) => node.type === "chunk").length,
      conceptCount: resultNodes.filter((node) => node.type === "concept").length,
      memoryAtomCount: resultNodes.filter((node) => node.type === "memory").length,
      reviewTaskCount: resultNodes.filter((node) => node.type === "review").length,
      weakPointCount,
      density: Number((resultEdges.length / possibleEdges).toFixed(4))
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildLearningGraph
});
