import { computed, nextTick, shallowRef, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export const suggestions = [
  '解释二叉树遍历',
  '解释 Python 列表推导式',
  '看看作业格式有没有问题',
  '帮我把这道题讲清楚'
]

export const quickEntries = [
  { view: 'knowledge', title: '整理课本资料', desc: '课件、笔记、作业要求放在这里', icon: '📚' },
  { view: 'tools', title: '代码作业辅导', desc: '代码、作业文件、练习题处理', icon: '💻' }
]

const ANIM_RE = /```animation\s*\n?([\s\S]*?)```/
const OPEN_ANIM_BLOCK_RE = /```animation\s*\n?[\s\S]*$/

// 安全渲染 Markdown：先解析再消毒，防止 XSS
// FORBID_TAGS: style（防止 CSS 注入），form/input/button（防止表单钓鱼）
function safeMd(text) {
  const raw = marked.parse(text || '', { breaks: true })
  return DOMPurify.sanitize(raw, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  })
}

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
    const html = safeMd(text)
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
      const html = safeMd(cleanContent)
      renderCache.set(pendingMsgId, html)
      debouncedRender.value = html
    }, 80)
  }

  watch(
    () => props.loading,
    (val) => {
      if (!val && pendingMsgId) {
        const cleanContent = stripIncompleteSvg(pendingContent || '')
        const html = safeMd(cleanContent)
        renderCache.set(pendingMsgId, html)
        debouncedRender.value = html
        pendingMsgId = null
        pendingContent = ''
      }
    }
  )

  function getStreamingHtml(msg) {
    scheduleRender(msg.id, msg.content)
    return debouncedRender.value || safeMd(msg.content)
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
    (newLen, oldLen) => {
      // 只清除新增/变化消息的缓存，保留已渲染的旧消息
      if (newLen > oldLen) {
        // 新消息加入：旧缓存仍然有效，无需清除
      } else {
        // 消息被删除：全部重建
        renderCache.clear()
      }
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
