export type VectorLike = ArrayLike<number>
export type EmbeddingBlob = Buffer | Uint8Array | ArrayBuffer

export interface NormalizeVectorOptions {
  /** 复用外部 Float32Array，避免重复分配；长度必须与输入向量一致。 */
  target?: Float32Array
}

export interface EmbeddingBlobToFloat32Options {
  /** true 时强制返回独立副本；false/默认时在可安全解释为 LE Float32 时返回零拷贝视图。 */
  copy?: boolean
}

export interface Float32ToEmbeddingBlobOptions {
  /** false 时允许返回与 Float32Array 共享内存的 Buffer；默认复制，适合写入数据库。 */
  copy?: boolean
}

export interface CosineSimilarityFastOptions {
  /** 输入已经 L2 归一化时设为 true，此时直接走 dot product。 */
  assumeNormalized?: boolean
  /** assumeNormalized 的语义别名，便于调用端表达“预归一化”。 */
  preNormalized?: boolean
}

export const FLOAT32_BYTES = 4

const HOST_IS_LITTLE_ENDIAN = (() => {
  const bytes = new Uint8Array(new Uint32Array([0x01020304]).buffer)
  return bytes[0] === 0x04
})()

/**
 * 返回一个 L2 归一化后的 Float32Array 副本。
 *
 * 不会产生 Array<number> 中间对象；如果传入 options.target，会复用该缓冲区。
 */
export function normalizeVector(
  vector: VectorLike,
  options: NormalizeVectorOptions = {}
): Float32Array {
  const length = vector.length
  const out = options.target ?? new Float32Array(length)

  if (out.length !== length) {
    throw new RangeError(`normalizeVector target length mismatch: ${out.length} !== ${length}`)
  }

  if (vector instanceof Float32Array) {
    out.set(vector)
  } else {
    for (let i = 0; i < length; i++) out[i] = vector[i]
  }

  return normalizeFloat32InPlace(out)
}

/**
 * 原地 L2 归一化 Float32Array。零向量、空向量或非有限范数会保持原样返回。
 */
export function normalizeFloat32InPlace(vector: Float32Array): Float32Array {
  const length = vector.length
  if (length === 0) return vector

  let sum0 = 0
  let sum1 = 0
  let sum2 = 0
  let sum3 = 0
  let i = 0
  const blockEnd = length - (length % 4)

  for (; i < blockEnd; i += 4) {
    const v0 = vector[i]
    const v1 = vector[i + 1]
    const v2 = vector[i + 2]
    const v3 = vector[i + 3]
    sum0 += v0 * v0
    sum1 += v1 * v1
    sum2 += v2 * v2
    sum3 += v3 * v3
  }

  let normSq = sum0 + sum1 + sum2 + sum3
  for (; i < length; i++) {
    const value = vector[i]
    normSq += value * value
  }

  if (normSq <= 0 || !Number.isFinite(normSq)) return vector

  const invNorm = 1 / Math.sqrt(normSq)
  for (let j = 0; j < length; j++) vector[j] = Math.fround(vector[j] * invNorm)
  return vector
}

/**
 * 面向 embedding 的高速 dot product；维度不一致或空向量时返回 -Infinity，兼容 rag.ts 现有相似度无效值语义。
 */
export function dotProduct(a: VectorLike, b: VectorLike): number {
  const length = a.length
  if (length === 0 || length !== b.length) return -Infinity

  let sum0 = 0
  let sum1 = 0
  let sum2 = 0
  let sum3 = 0
  let i = 0
  const blockEnd = length - (length % 4)

  for (; i < blockEnd; i += 4) {
    sum0 += a[i] * b[i]
    sum1 += a[i + 1] * b[i + 1]
    sum2 += a[i + 2] * b[i + 2]
    sum3 += a[i + 3] * b[i + 3]
  }

  let dot = sum0 + sum1 + sum2 + sum3
  for (; i < length; i++) dot += a[i] * b[i]

  return Number.isFinite(dot) ? dot : -Infinity
}

/**
 * 快速余弦相似度。默认保持数学正确性；预归一化向量可传 true 或 { assumeNormalized: true } 直接退化为 dot product。
 */
export function cosineSimilarityFast(
  a: VectorLike,
  b: VectorLike,
  options: CosineSimilarityFastOptions | boolean = {}
): number {
  const assumeNormalized =
    typeof options === 'boolean'
      ? options
      : options.assumeNormalized === true || options.preNormalized === true

  if (assumeNormalized) return dotProduct(a, b)

  const length = a.length
  if (length === 0 || length !== b.length) return -Infinity

  let dot0 = 0
  let dot1 = 0
  let dot2 = 0
  let dot3 = 0
  let normA0 = 0
  let normA1 = 0
  let normA2 = 0
  let normA3 = 0
  let normB0 = 0
  let normB1 = 0
  let normB2 = 0
  let normB3 = 0
  let i = 0
  const blockEnd = length - (length % 4)

  for (; i < blockEnd; i += 4) {
    const a0 = a[i]
    const a1 = a[i + 1]
    const a2 = a[i + 2]
    const a3 = a[i + 3]
    const b0 = b[i]
    const b1 = b[i + 1]
    const b2 = b[i + 2]
    const b3 = b[i + 3]

    dot0 += a0 * b0
    dot1 += a1 * b1
    dot2 += a2 * b2
    dot3 += a3 * b3
    normA0 += a0 * a0
    normA1 += a1 * a1
    normA2 += a2 * a2
    normA3 += a3 * a3
    normB0 += b0 * b0
    normB1 += b1 * b1
    normB2 += b2 * b2
    normB3 += b3 * b3
  }

  let dot = dot0 + dot1 + dot2 + dot3
  let normA = normA0 + normA1 + normA2 + normA3
  let normB = normB0 + normB1 + normB2 + normB3

  for (; i < length; i++) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }

  if (
    normA <= 0 ||
    normB <= 0 ||
    !Number.isFinite(dot) ||
    !Number.isFinite(normA) ||
    !Number.isFinite(normB)
  ) {
    return -Infinity
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 将 rag.ts/ragMapper 使用的 raw little-endian Float32 BLOB 转成 Float32Array。
 *
 * 默认尽量返回零拷贝视图；如果后续会原地修改返回值，请传 { copy: true }。
 */
export function embeddingBlobToFloat32(
  blob: EmbeddingBlob,
  options: EmbeddingBlobToFloat32Options = {}
): Float32Array {
  const bytes = toUint8Array(blob)
  assertFloat32ByteLength(bytes.byteLength)
  const length = bytes.byteLength / FLOAT32_BYTES

  if (!options.copy && HOST_IS_LITTLE_ENDIAN && bytes.byteOffset % FLOAT32_BYTES === 0) {
    return new Float32Array(bytes.buffer, bytes.byteOffset, length)
  }

  const out = new Float32Array(length)
  if (HOST_IS_LITTLE_ENDIAN) {
    new Uint8Array(out.buffer).set(bytes)
    return out
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < length; i++) out[i] = view.getFloat32(i * FLOAT32_BYTES, true)
  return out
}

/**
 * 将 Float32/number 向量编码为 ragMapper.embeddingToBlob 兼容的 raw little-endian Float32 Buffer。
 */
export function float32ToEmbeddingBlob(
  vector: VectorLike,
  options: Float32ToEmbeddingBlobOptions = {}
): Buffer {
  const length = vector.length
  const byteLength = length * FLOAT32_BYTES

  if (
    options.copy === false &&
    vector instanceof Float32Array &&
    HOST_IS_LITTLE_ENDIAN &&
    vector.byteOffset % FLOAT32_BYTES === 0
  ) {
    return Buffer.from(vector.buffer as ArrayBuffer, vector.byteOffset, vector.byteLength)
  }

  const out = Buffer.allocUnsafe(byteLength)

  if (vector instanceof Float32Array && HOST_IS_LITTLE_ENDIAN) {
    out.set(new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength))
    return out
  }

  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  for (let i = 0; i < length; i++) view.setFloat32(i * FLOAT32_BYTES, vector[i], true)
  return out
}

function toUint8Array(blob: EmbeddingBlob): Uint8Array {
  return blob instanceof Uint8Array ? blob : new Uint8Array(blob)
}

function assertFloat32ByteLength(byteLength: number): void {
  if (byteLength % FLOAT32_BYTES !== 0) {
    throw new RangeError(`Invalid embedding BLOB byte length: ${byteLength}`)
  }
}
