import { computed, nextTick, shallowRef, watch } from 'vue'
import { marked } from 'marked'

export const suggestions = [
  '今天复习数据结构',
  '解释 Python 列表推导式',
  '看看作业格式有没有问题',
  '排一下今天的学习安排'
]

export const quickEntries = [
  { view: 'knowledge', title: '整理课本资料', desc: '课件、笔记、作业要求放在这里', icon: '📚' },
  { view: 'tools', title: '处理学习任务', desc: '作业、刷题、复习放在一处', icon: '✏️' }
]

const ANIM_RE = /```animation\s*\n?([\s\S]*?)```/
const OPEN_ANIM_BLOCK_RE = /```animation\s*\n?[\s\S]*$/

export function useChatMessages(props, listRef) {
  const hasAssistantPlaceholder = computed(() => {
    const msgs = props.messages
    return msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant'
  })

  const renderCache = new Map()
  let renderTimer = null
  const debouncedRender = shallowRef('')
  let pendingContent = ''
  let pendingMsgId = null

  const renderMd = (text, msgId) => {
    if (msgId && renderCache.has(msgId)) {
      return renderCache.get(msgId)
    }
    const html = marked.parse(text || '', { breaks: true })
    if (msgId) renderCache.set(msgId, html)
    return html
  }

  function stripIncompleteSvg(text) {
    return text.replace(/```(?:svg|xml|animation)?\s*\n?[\s\S]*$/, '')
  }

  function scheduleRender(msgId, content) {
    pendingContent = content
    pendingMsgId = msgId
    if (renderTimer) return
    renderTimer = setTimeout(() => {
      renderTimer = null
      const cleanContent = stripIncompleteSvg(pendingContent || '')
      const html = marked.parse(cleanContent, { breaks: true })
      renderCache.set(pendingMsgId, html)
      debouncedRender.value = html
    }, 80)
  }

  watch(
    () => props.loading,
    (val) => {
      if (!val && pendingMsgId) {
        const cleanContent = stripIncompleteSvg(pendingContent || '')
        const html = marked.parse(cleanContent, { breaks: true })
        renderCache.set(pendingMsgId, html)
        debouncedRender.value = html
        pendingMsgId = null
        pendingContent = ''
      }
    }
  )

  function getStreamingHtml(msg) {
    scheduleRender(msg.id, msg.content)
    return debouncedRender.value || marked.parse(msg.content || '', { breaks: true })
  }

  function hasAnimBlock(text) {
    const content = text || ''
    return ANIM_RE.test(content) || OPEN_ANIM_BLOCK_RE.test(content)
  }

  function splitMessage(text) {
    if (!text) return [{ type: 'text', content: '' }]
    const parts = []
    let lastIndex = 0
    const re = /```animation\s*\n?([\s\S]*?)```/g
    let match

    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      }
      try {
        parts.push({ type: 'anim', data: JSON.parse(match[1].trim()) })
      } catch {
        parts.push({ type: 'text', content: '动画数据格式异常，无法预览。' })
      }
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex)
      const openBlock = remaining.match(/```animation\s*\n?([\s\S]*)$/)
      if (openBlock && openBlock.index !== undefined) {
        if (openBlock.index > 0) {
          parts.push({ type: 'text', content: remaining.slice(0, openBlock.index) })
        }
        try {
          parts.push({ type: 'anim', data: JSON.parse(openBlock[1].trim()) })
        } catch {
          parts.push({ type: 'text', content: '动画内容还没整理完整，暂时看不了。' })
        }
      } else {
        parts.push({ type: 'text', content: remaining })
      }
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }]
  }

  const scrollToBottom = () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight
      }
    })
  }

  watch(
    () => {
      const msgs = props.messages
      if (msgs.length === 0) return ''
      const last = msgs[msgs.length - 1]
      return last.role === 'assistant' ? last.content : ''
    },
    () => {
      if (props.loading) scrollToBottom()
    }
  )

  watch(
    () => props.messages.length,
    () => {
      renderCache.clear()
      scrollToBottom()
    }
  )
  watch(() => props.loading, scrollToBottom)

  const relativeTime = (ts) => {
    const diff = Date.now() - ts
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
    return new Date(ts).toLocaleDateString('zh-CN')
  }

  return {
    hasAssistantPlaceholder,
    renderMd,
    getStreamingHtml,
    hasAnimBlock,
    splitMessage,
    relativeTime
  }
}
