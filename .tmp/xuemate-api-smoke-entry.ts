import * as rag from '../src/main/services/rag'
import { buildLearningGraph } from '../src/main/services/learningGraph'
import { getMemory } from '../src/main/services/memory'

const collections = rag.getCollections()
const docs = rag.getDocuments(rag.DEFAULT_COLLECTION_ID)
const stats = rag.getStats(rag.DEFAULT_COLLECTION_ID)
const graph = buildLearningGraph(rag.DEFAULT_COLLECTION_ID)
const memory = getMemory()

console.log(JSON.stringify({
  ragCollections: collections.length,
  ragDocs: docs.length,
  ragStats: stats,
  graphStats: graph.stats,
  graphConceptSamples: graph.nodes.filter((n) => n.type === 'concept').slice(0, 10).map((n) => n.label),
  memoryLanguage: memory.preferences.language,
  ok: true
}, null, 2))
