# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XueMate is an Electron + Vue 3 desktop application — a learning assistant for elementary school students. It provides document Q&A, homework tutoring, animated explanations, long-term learning profiles, review queues, and web resource assistance. The demo scenario focuses on bubble-sort programming education.

Built for the **China University Computer Competition — Network Technology Challenge (Creative Track)**.

## Tech Stack

- **Electron 39** (main + renderer + preload process split)
- **Vue 3** with Composition API (no `<script setup>` — uses `defineComponent`)
- **TypeScript** in main/preload; **plain JS** in renderer
- **Vite 7** via `electron-vite` for dev/build
- **Better SQLite3** for local persistence (conversations, RAG chunks, memory atoms, tasks, search history)
- **Rust sidecars**: `mcp-gateway-rs/` (MCP gateway) and `peer-edge-rs/` (P2P edge learning network)

## Commands

```bash
npm install                  # install deps (runs electron-builder install-app-deps)
npm run dev                  # start Electron app in dev mode (electron-vite dev)
npm run dev:renderer         # start renderer-only Vite dev server on port 5174

npm run build                # compile TypeScript + bundle renderer
npm run build:win            # build + package for Windows
npm run build:mac            # build + package for macOS
npm run build:linux          # build + package for Linux

npm run lint                 # ESLint with cache
npm run format               # Prettier write

npm run bench:rag            # RAG retrieval benchmark
npm run bench:memory         # memory system benchmark
npm run bench:mcp            # MCP layer benchmark
npm run bench:agent-mcp      # internal agent MCP benchmark

npm run mcp:build            # cargo build --release for mcp-gateway-rs
npm run peeredge:build       # cargo build --release for peer-edge-rs
npm run peeredge:dev         # cargo run for peer-edge-rs (dev mode)
```

## Architecture

### Three-Process Electron Model

```
src/main/index.ts          → Electron main process (Node.js, SQLite, LLM calls, IPC handlers)
src/preload/index.ts       → contextBridge exposing typed API namespaces to renderer
src/renderer/src/main.js   → Vue 3 app entry (loaded via Vite dev server or file://)
```

The preload script exposes these `window` namespaces via `contextBridge`: `chat`, `rag`, `llm`, `file`, `agent`, `task`, `webAssistant`, `quickSearch`, `learningSignals`. All renderer→main communication goes through these IPC channels.

### Main Process Layered Structure

```
src/main/
├── domain/        → pure type definitions (chat, memory, rag, task, quickSearch, learningGraph)
├── dao/           → SQLite data access (one file per domain)
├── mappers/       → row→domain object mapping
├── services/      → business logic
│   ├── ai/          → LLM integration (DeepSeek chat, Google Vertex vision)
│   ├── agent/       → desktop agent with vision + sandbox tools
│   ├── browser/     → embedded WebView for web browsing
│   ├── chat/        → conversation storage + streaming
│   ├── document/    → PDF/text file parsing
│   ├── infrastructure/ → SQLite connection (db.ts)
│   ├── mcp/         → internal MCP client for agent tools
│   ├── memory/      → Memory Atom system (extract, compress, archive, profile, prompt)
│   ├── peerEdge/    → P2P edge network integration
│   ├── quickSearch/ → local web search
│   ├── rag/         → Hybrid RAG (semantic + keyword + structural + MMR)
│   ├── bridge/      → renderer bridge (cache + SSE)
│   └── task/        → task/todo storage
└── modules/       → self-contained feature modules with own IPC + domain + store
    ├── learningSignals/  → auto-extracted learning insights from conversations
    └── webAssistant/     → computer-use web automation agent
```

### Renderer Structure

```
src/renderer/src/
├── App.vue              → root component (tab navigation)
├── views/               → page-level components (ChatView, TutorView, KnowledgeView, etc.)
├── components/          → reusable UI components
│   ├── agent/             → QuickSearchPanel, WebAssistantPanel, ComputerAgentPanel
│   └── animation/         → SortAnimator, FormulaAnimator, StepAnimator, AnimationRenderer
├── composables/         → Vue 3 composition functions (useChatMessages, useTutor, etc.)
├── services/            → ragClient.js (renderer-side RAG helper)
└── devMock.js           → mock data for standalone renderer development
```

### Key Subsystems

- **Hybrid RAG** (`services/rag/`): Combines semantic vector search, keyword matching, structural signals (section titles, emphasis markers), and MMR diversity re-ranking. Vector math is pure TypeScript (no external vector DB).
- **Memory Atom** (`services/memory/`): Layered memory with confidence/importance/time-decay. Types include profile, preference, weak_point, misconception, etc. Auto-extracts from conversations, compresses duplicates, generates learning profiles and review queues.
- **Learning Graph** (`services/rag/learningGraph.ts` + `dao/learningGraphDao.ts`): Graphology-based knowledge graph rendered with Sigma.js in the renderer. Nodes = documents, chunks, concepts, memory atoms.
- **PeerEdge** (`services/peerEdge/` + `peer-edge-rs/`): Rust sidecar for classroom P2P edge collaboration. Chat auto-decides whether to query peers based on local RAG strength.
- **Web Assistant** (`modules/webAssistant/`): Computer-use agent that opens a browser, takes screenshots, and uses multimodal vision (Gemini) to decide click/input actions.

## Environment Variables

Copy `.env.example` to `.env`. Required keys:

- `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` — chat LLM
- `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` — text embeddings for RAG
- `VISION_PROVIDER` (default `google-vertex`) + corresponding Vertex or OpenAI-compatible config — multimodal vision for web assistant

PeerEdge settings are all optional with sensible defaults (`XUEMATE_PEEREDGE=auto`).

## Path Aliases

TypeScript `@main/*` → `src/main/*`, `@renderer/*` → `src/renderer/*`. Vite resolves `@renderer` in renderer config.

## Conventions

- Main process is TypeScript strict mode; renderer uses plain JS with Vue 3 Composition API.
- IPC handlers in `src/main/index.ts` follow the pattern: `ipcMain.handle('namespace:method', ...)` returning `{ success, data }` or `{ success: false, error }`.
- Domain types are defined in `src/main/domain/`, not inline.
- Rust sidecars are built via `cargo build --release` using the `--manifest-path` flag; binaries are expected alongside the Electron app at runtime.
- Renderer views map 1:1 to top-level tabs: ChatView, TutorView, KnowledgeView, TaskView, ReviewView, AgentView, TodayView, ToolView.
