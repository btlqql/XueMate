import { ref } from 'vue'

export const searchSamples = ['三年级分数加法练习题', '小学生英语单词记忆方法', '五年级科学小实验']

export function useQuickSearch() {
  const searchInput = ref('')
  const searching = ref(false)
  const searchError = ref('')
  const searchResult = ref(null)

  async function runQuickSearch() {
    if (!searchInput.value.trim() || searching.value) return
    searching.value = true
    searchError.value = ''
    searchResult.value = null

    try {
      const result = await window.quickSearch.run(searchInput.value.trim())
      if (result.success) {
        searchResult.value = result.data
      } else {
        searchError.value = result.error || '查资料失败'
      }
    } catch (e) {
      searchError.value = '查资料失败：' + (e.message || '未知错误')
    } finally {
      searching.value = false
    }
  }

  function loadSearchSample(text) {
    searchInput.value = text
  }

  return {
    searchInput,
    searching,
    searchError,
    searchResult,
    runQuickSearch,
    loadSearchSample
  }
}
