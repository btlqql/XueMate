<script setup>
import { computed, onMounted, ref } from 'vue'

const collections = ref([])
const activeCollectionId = ref('default')
const documents = ref([])
const stats = ref({ docCount: 0, chunkCount: 0 })
const importing = ref(false)
const creating = ref(false)
const error = ref('')
const newCollectionName = ref('')

const activeCollection = computed(() =>
  collections.value.find((collection) => collection.id === activeCollectionId.value)
)

onMounted(async () => {
  await loadCollections()
  await loadData()
})

async function loadCollections() {
  try {
    const result = await window.rag.collections()
    if (result.success) {
      collections.value = result.data || []
      if (!collections.value.some((collection) => collection.id === activeCollectionId.value)) {
        activeCollectionId.value = collections.value[0]?.id || 'default'
      }
    } else {
      error.value = result.error || '加载资料夹失败'
    }
  } catch (e) {
    console.error('[Knowledge] loadCollections 失败:', e)
    error.value = '加载资料夹失败: ' + (e.message || '未知错误')
  }
}

async function loadData() {
  try {
    const collectionId = activeCollectionId.value || 'default'
    const [docRes, statsRes] = await Promise.all([
      window.rag.documents(collectionId),
      window.rag.stats(collectionId)
    ])
    if (docRes.success) documents.value = docRes.data || []
    else error.value = docRes.error || '加载文档失败'

    if (statsRes.success) stats.value = statsRes.data || { docCount: 0, chunkCount: 0 }
    else error.value = statsRes.error || '加载统计失败'
  } catch (e) {
    console.error('[Knowledge] loadData 失败:', e)
    error.value = '加载资料失败: ' + (e.message || '未知错误')
  }
}

async function setActiveCollection(id) {
  if (activeCollectionId.value === id) return
  activeCollectionId.value = id
  error.value = ''
  await loadData()
}

async function createCollection() {
  const name = newCollectionName.value.trim()
  if (!name || creating.value) return

  creating.value = true
  error.value = ''
  try {
    const result = await window.rag.createCollection(name)
    if (result.success && result.data) {
      activeCollectionId.value = result.data.id
      newCollectionName.value = ''
      await loadCollections()
      await loadData()
    } else {
      error.value = result.error || '创建资料夹失败'
    }
  } catch (e) {
    error.value = '创建资料夹失败: ' + (e.message || '未知错误')
  } finally {
    creating.value = false
  }
}

async function selectAndImport() {
  if (importing.value) return
  importing.value = true
  error.value = ''

  try {
    const result = await window.rag.selectAndImport(activeCollectionId.value || 'default')
    if (result.success) {
      const { imported = [], errors = [] } = result.data || {}
      if (errors.length > 0) {
        error.value = errors.join('\n')
      }
      if (imported.length > 0) {
        await loadCollections()
      }
      await loadData()
    } else if (result.error !== '已取消') {
      error.value = result.error
    }
  } catch (e) {
    error.value = '导入失败: ' + (e.message || '未知错误')
  } finally {
    importing.value = false
  }
}

async function deleteDoc(doc) {
  if (!confirm(`确定删除 "${doc.fileName}"？`)) return
  try {
    await window.rag.delete(doc.id)
    await loadCollections()
    await loadData()
  } catch (e) {
    error.value = '删除失败: ' + (e.message || '未知错误')
  }
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
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
        <button class="btn btn-primary" @click="selectAndImport" :disabled="importing">
          {{ importing ? '导入中...' : '选择资料' }}
        </button>
      </div>
      <div class="error-msg" v-if="error">{{ error }}</div>
    </div>

    <!-- 文档列表 -->
    <div class="card" v-if="documents.length > 0">
      <h2 class="section-title">已经放好的资料</h2>
      <div class="doc-list">
        <div v-for="doc in documents" :key="doc.id" class="doc-item">
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
          </div>
          <button class="btn-delete" @click="deleteDoc(doc)" title="删除">
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
    <div class="card" v-if="documents.length === 0 && !importing">
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

.doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f7f7f7;
  border-radius: 10px;
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
