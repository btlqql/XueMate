export function parseLLMJson(text) {
  if (typeof text !== 'string') {
    throw new Error('LLM 返回不是文本')
  }

  const trimmed = stripFence(text.trim())
  const direct = tryParse(trimmed)
  if (direct.ok) return direct.value

  const jsonLike = extractFirstJson(trimmed)
  if (!jsonLike) {
    throw new Error('没有找到 JSON 内容')
  }

  const parsed = tryParse(jsonLike)
  if (parsed.ok) return parsed.value
  throw new Error(parsed.error?.message || 'JSON 解析失败')
}

function stripFence(text) {
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fence ? fence[1].trim() : text
}

function tryParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error }
  }
}

function extractFirstJson(text) {
  const starts = ['{', '[']
  for (const startChar of starts) {
    const start = text.indexOf(startChar)
    if (start === -1) continue
    const endChar = startChar === '{' ? '}' : ']'
    const extracted = extractBalanced(text, start, startChar, endChar)
    if (extracted) return extracted
  }
  return ''
}

function extractBalanced(text, start, openChar, closeChar) {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === openChar) {
      depth += 1
    } else if (ch === closeChar) {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return ''
}
