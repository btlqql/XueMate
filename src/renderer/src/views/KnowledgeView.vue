<script setup>
import { nextTick, ref } from 'vue'
import KnowledgeGraph from '../components/KnowledgeGraph.vue'
import { formatKnowledgeDate as formatDate, useKnowledgeBase } from '../composables/useKnowledgeBase'

const {
  collections,
  activeCollectionId,
  activeCollection,
  activeGraphId,
  activeGraphScope,
  graphScopes,
  documents,
  stats,
  graphData,
  graphLoading,
  graphError,
  importing,
  creating,
  error,
  newCollectionName,
  loadGraph,
  setActiveCollection,
  setActiveGraph,
  createCollection,
  selectAndImport,
  deleteDoc
} = useKnowledgeBase()

const docsCardRef = ref(null)
const docRefs = ref({})
const locatedDocId = ref('')
const locatedArticle = ref(null)

function setDocRef(id, el) {
  if (!id) return
  if (el) docRefs.value[id] = el
  else delete docRefs.value[id]
}

function resolveDocumentId(source) {
  if (source?.documentId) return source.documentId
  if (!source?.fileName) return ''
  return documents.value.find((doc) => doc.fileName === source.fileName)?.id || ''
}

async function locateDocument(source) {
  if (!source) return

  if (
    source.collectionId &&
    source.collectionId !== 'all' &&
    source.collectionId !== activeCollectionId.value
  ) {
    await setActiveCollection(source.collectionId)
  }

  await nextTick()
  const documentId = resolveDocumentId(source)
  locatedDocId.value = documentId
  locatedArticle.value = {
    ...source,
    documentId,
    fileName: source.fileName || documents.value.find((doc) => doc.id === documentId)?.fileName || '关联资料'
  }

  await nextTick()
  const target = docRefs.value[documentId] || docsCardRef.value
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">我的资料</h1>
      <p class="page-desc">把课件、笔记、作业放进来，学伴回答时会先看这些资料</p>
    </div>

    <!-- 资料夹 -->
    <div class="card collection-card">
      <div class="collection-head">
        <div>
          <h2 class="section-title">资料夹</h2>
          <p class="collection-desc">按科目分开放，比如语文、数学、英语，这样回答不会串科。</p>
        </div>
        <form class="create-form" @submit.prevent="createCollection">
          <input
            v-model="newCollectionName"
            class="collection-input"
            placeholder="新建资料夹，如 数学 / 英语"
            :disabled="creating"
          />
          <button
            class="btn btn-secondary"
            type="submit"
            :disabled="creating || !newCollectionName.trim()"
          >
            {{ creating ? '创建中...' : '新建' }}
          </button>
        </form>
      </div>

      <div class="collection-list">
        <button
          v-for="collection in collections"
          :key="collection.id"
          class="collection-item"
          :class="{ active: collection.id === activeCollectionId }"
          @click="setActiveCollection(collection.id)"
        >
          <span class="collection-name">{{ collection.name }}</span>
          <span class="collection-meta">
            {{ collection.docCount }} 份资料 · {{ collection.chunkCount }} 小段
          </span>
        </button>
      </div>
    </div>

    <!-- 统计 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-num">{{ stats.docCount }}</span>
        <span class="stat-label">资料数</span>
      </div>
      <div class="stat-item">
        <span class="stat-num">{{ stats.chunkCount }}</span>
        <span class="stat-label">小段文字</span>
      </div>
    </div>

    <KnowledgeGraph
      :graph-data="graphData"
      :loading="graphLoading"
      :error="graphError"
      :scopes="graphScopes"
      :active-scope-id="activeGraphId"
      :scope-name="activeGraphScope?.name || '全部图谱'"
      @refresh="loadGraph"
      @scope-change="setActiveGraph"
      @locate-document="locateDocument"
    />

    <!-- 导入按钮 -->
    <div class="card">
      <div class="import-section">
        <div class="import-info">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="#aaa">
            <path
              d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"
            />
          </svg>
          <div>
            <p class="import-title">
              放到：{{ activeCollection ? activeCollection.name : '当前资料夹' }}
            </p>
            <p class="import-hint">支持 PDF、TXT、MD，可以一次选多个文件</p>
          </div>
        </div>
        <button class="btn btn-primary" :disabled="importing" @click="selectAndImport">
          {{ importing ? '导入中...' : '选择资料' }}
        </button>
      </div>
      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>

    <!-- 文档列表 -->
    <div v-if="documents.length > 0" ref="docsCardRef" class="card">
      <h2 class="section-title">已经放好的资料</h2>
      <div v-if="locatedArticle" class="located-source">
        <div>
          <strong>已定位到文章</strong>
          <p>{{ locatedArticle.fileName }}</p>
          <span v-if="locatedArticle.startPos !== undefined">
            片段位置：{{ locatedArticle.startPos }} - {{ locatedArticle.endPos }}
          </span>
        </div>
        <em v-if="locatedArticle.sourceNodeLabel">来自：{{ locatedArticle.sourceNodeLabel }}</em>
      </div>
      <div class="doc-list">
        <div
          v-for="doc in documents"
          :key="doc.id"
          :ref="(el) => setDocRef(doc.id, el)"
          class="doc-item"
          :class="{ located: locatedDocId === doc.id }"
          :data-doc-id="doc.id"
        >
          <div class="doc-icon">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="#777"
                d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"
              />
            </svg>
          </div>
          <div class="doc-info">
            <div class="doc-name">{{ doc.fileName }}</div>
            <div class="doc-meta">
              <span class="tag tag-blue">{{ doc.chunkCount }} 小段</span>
              <span class="tag">{{ formatDate(doc.createdAt) }}</span>
            </div>
            <div v-if="locatedDocId === doc.id && locatedArticle?.snippet" class="chunk-preview">
              <strong>图谱定位片段</strong>
              <p>{{ locatedArticle.snippet }}</p>
            </div>
          </div>
          <button class="btn-delete" title="删除" @click="deleteDoc(doc)">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              ></path>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 使用说明 -->
    <div v-if="documents.length === 0 && !importing" class="card">
      <h2 class="section-title">这个资料夹还没有东西</h2>
      <div class="steps">
        <div class="step">
          <span class="step-num">1</span>
          <div>
            <strong>先选资料夹</strong>
            <p>按科目建资料夹，例如数学、英语、语文。</p>
          </div>
        </div>
        <div class="step">
          <span class="step-num">2</span>
          <div>
            <strong>导入资料</strong>
            <p>上传课件、笔记、作业等文件。</p>
          </div>
        </div>
        <div class="step">
          <span class="step-num">3</span>
          <div>
            <strong>自动读资料</strong>
            <p>学伴会把长资料拆成小段，聊天时先找最相关的内容。</p>
          </div>
        </div>
        <div class="step">
          <span class="step-num">4</span>
          <div>
            <strong>聊天时选择资料</strong>
            <p>聊天页可以选择“全部资料”、某个资料夹，或者“不用资料”。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collection-card {
  margin-bottom: 16px;
}

.collection-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.collection-desc {
  color: #888;
  font-size: 13px;
  margin-top: 4px;
}

.create-form {
  display: flex;
  gap: 8px;
  min-width: 320px;
}

.collection-input {
  flex: 1;
  border: 2px solid #e5e5e5;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
}

.collection-input:focus {
  border-color: var(--xm-green);
}

.collection-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.collection-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 160px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 2px solid #e5e5e5;
  background: #fafafa;
  cursor: pointer;
  transition: all 0.15s;
}

.collection-item:hover {
  border-color: #bfe7c2;
  background: #f4fbf5;
}

.collection-item.active {
  border-color: var(--xm-green);
  background: #edf9ef;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.12);
}

.collection-name {
  font-weight: 800;
  color: #222;
}

.collection-meta {
  color: #888;
  font-size: 12px;
}

.stats-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 12px;
  border: 2px solid #e5e5e5;
}

.stat-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--xm-green-dark);
}

.stat-label {
  font-size: 12px;
  font-weight: 700;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

.status-on {
  color: var(--xm-green);
}
.status-off {
  color: #ccc;
}

.import-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.import-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.import-title {
  font-weight: 700;
  font-size: 16px;
}

.import-hint {
  font-size: 13px;
  color: #999;
  margin-top: 2px;
}

.doc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.located-source {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid #e1f1d7;
  border-radius: 14px;
  background: #f7fbf3;
}

.located-source strong {
  display: block;
  color: var(--xm-green-dark);
  font-size: 13px;
  font-weight: 900;
  margin-bottom: 3px;
}

.located-source p {
  color: #333;
  font-size: 14px;
  font-weight: 800;
}

.located-source span,
.located-source em {
  color: #8aa47b;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f7f7f7;
  border: 2px solid transparent;
  border-radius: 10px;
  transition:
    border-color 0.18s,
    background 0.18s,
    box-shadow 0.18s;
}

.doc-item.located {
  border-color: var(--xm-green);
  background: #edf9ef;
  box-shadow: 0 8px 22px rgba(88, 204, 2, 0.15);
}

.doc-icon {
  flex-shrink: 0;
}
.doc-info {
  flex: 1;
}
.doc-name {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}
.doc-meta {
  display: flex;
  gap: 6px;
}

.chunk-preview {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed #bfe7c2;
  background: #ffffff;
}

.chunk-preview strong {
  display: block;
  color: var(--xm-green-dark);
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 5px;
}

.chunk-preview p {
  color: #666;
  font-size: 12px;
  line-height: 1.55;
}

.btn-delete {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.15s;
}

.btn-delete:hover {
  color: #ef4444;
  background: #fee2e2;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px;
  background: #f7f7f7;
  border-radius: 8px;
}

.step-num {
  width: 28px;
  height: 28px;
  background: var(--xm-green);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  flex-shrink: 0;
}

.step strong {
  font-size: 14px;
}
.step p {
  font-size: 13px;
  color: #777;
  margin-top: 2px;
}

.error-msg {
  margin-top: 12px;
  padding: 10px 14px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .collection-head,
  .import-section {
    flex-direction: column;
    align-items: stretch;
  }

  .create-form {
    min-width: 0;
  }
}
</style>
