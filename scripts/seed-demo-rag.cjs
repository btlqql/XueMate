const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const dbPath = path.join(os.homedir(), '.xuemate', 'xuemate.db')
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

const now = Date.now()

function uuid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function fakeEmbedding(text, dim = 64) {
  const buf = Buffer.alloc(dim * 4)
  for (let i = 0; i < dim; i++) {
    const h = hash32(`${i}:${text}`)
    const value = ((h % 20000) / 10000 - 1) * 0.18
    buf.writeFloatLE(value, i * 4)
  }
  return buf
}

function ensureCollection(id, name, description) {
  const existing = db.prepare('SELECT * FROM collections WHERE id = ?').get(id)
  if (existing) {
    db.prepare('UPDATE collections SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
      name,
      description,
      now,
      id
    )
    return id
  }
  db.prepare('INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    description,
    now,
    now
  )
  return id
}

function findCollectionIdByName(name) {
  const row = db.prepare('SELECT id FROM collections WHERE name = ?').get(name)
  return row?.id
}

const mathOld = db.prepare("SELECT id, name FROM collections WHERE name = '111'").get()
const mathId = mathOld?.id || findCollectionIdByName('数学') || 'demo-math'
ensureCollection(mathId, '数学', '【演示数据】小学数学知识图谱：分数、小数、几何、应用题')

const englishId = findCollectionIdByName('英语') || 'demo-english'
ensureCollection(englishId, '英语', '【演示数据】小学英语知识图谱：单词、语法、阅读、口语')

const scienceId = findCollectionIdByName('科学编程') || 'demo-science-code'
ensureCollection(scienceId, '科学编程', '【演示数据】科学实验与少儿编程综合图谱')

ensureCollection('default', '默认资料库', '自动创建的默认资料库；含 XueMate 演示资料')

const docs = [
  {
    collectionId: 'default',
    fileName: '演示_XueMate_学习助手总览.md',
    chunks: [
      `# XueMate 学习助手总览\nXueMate 是面向小学生的全面学习助手，核心场景包括资料导入、RAG 检索、知识图谱、学习画像、复习队列和作业任务解析。学生导入课件、笔记、错题本后，系统会把资料拆成小段文字，抽取知识点，并把资料、片段、知识点、学习画像连接成学习网络。\n知识图谱不是静态图片，而是根据真实资料动态生成：资料夹连接资料，资料连接片段，片段解释知识点，薄弱点连接复习任务。`,
      `## RAG 检索流程\nRAG 的流程是：导入资料、文本清洗、分块、向量化、关键词召回、混合排序、上下文注入。XueMate 在聊天时会先根据问题检索相关片段，再把片段作为证据给模型回答。\n例如学生问“分数加法为什么要通分”，系统会优先找到分数、通分、同分母、异分母相关片段，而不是直接凭空回答。`,
      `## 学习画像与复习队列\n学习画像会记录学生最近学习的主题、薄弱点、掌握点和目标。薄弱点例如“分数通分容易漏乘分子”“英语一般现在时和一般过去时混淆”“Scratch 循环条件不清楚”。\n复习队列根据薄弱点、重要性、最近出现时间生成，提醒学生复习分数、小数、阅读理解、科学实验和编程循环。`,
      `## 比赛展示亮点\n演示时可以展示从资料导入到知识图谱生成的全过程：先导入一份数学资料，再问学伴相关问题，最后打开学习网络查看资料、知识点和复习任务如何连起来。专家能看到真实数据流、真实关系边、真实学习路径，而不是一张静态 SVG。`
    ]
  },
  {
    collectionId: 'default',
    fileName: '演示_作业任务解析与学习路径.md',
    chunks: [
      `# 作业任务解析\nXueMate 可以把老师布置的自然语言作业拆成任务清单，例如截止时间、提交格式、命名规则、附件要求、评分重点。任务解析适合小学生和家长一起看，避免漏交、错交、格式错误。`,
      `## 学习路径推荐\n当学生导入多门课程资料后，系统会根据知识图谱推荐学习路径。数学可以从分数到小数再到应用题；英语可以从单词到句型再到阅读理解；科学可以从观察记录到实验结论；编程可以从顺序结构到循环和条件判断。`,
      `## 图谱交互\n学习网络支持全部图谱和子图谱。全部图谱展示跨科目的整体关系，子图谱展示某个资料夹的局部关系。点击资料节点可以查看文件名和片段数，点击知识点可以查看学科、置信度、出现次数，点击复习任务可以查看推荐原因。`,
      `## 小学生友好设计\n前端界面要减少专业术语，例如把 RAG 图标改成“资料小书包”，把知识图谱解释为“学习地图”。按钮文案要短：导入资料、刷新图谱、回到全图、查看所在图谱。`
    ]
  },
  {
    collectionId: mathId,
    fileName: '演示_四年级数学_分数小数面积.md',
    chunks: [
      `# 四年级数学：分数与小数\n分数表示把一个整体平均分成若干份，其中一份或几份可以用分数表示。分母表示平均分成几份，分子表示取了几份。学习分数时要反复区分分子、分母、单位“1”和平均分。`,
      `## 分数加减法和通分\n同分母分数相加减，分母不变，只把分子相加减。异分母分数相加减，需要先通分，把不同分母变成相同分母，再进行计算。通分时分子和分母要同时乘同一个数，不能只改分母。`,
      `## 小数和分数互化\n十分之几可以写成一位小数，百分之几可以写成两位小数。0.3 等于十分之三，0.25 等于百分之二十五。小数比较大小时，先比较整数部分，再比较十分位、百分位。`,
      `## 面积和周长\n长方形周长等于长和宽的和乘 2，面积等于长乘宽。正方形周长等于边长乘 4，面积等于边长乘边长。做几何题要先分清求的是周长还是面积，单位也不同。`,
      `## 易错点\n学生常见错误包括：异分母分数直接加分子、通分忘记分子也要变化、小数位数对不齐、面积单位和长度单位混用。复习时可以用错题本把这些薄弱点连到知识图谱。`
    ]
  },
  {
    collectionId: mathId,
    fileName: '演示_数学应用题_数量关系.md',
    chunks: [
      `# 数学应用题：数量关系\n应用题的关键是找数量关系。常见关系包括速度、时间、路程；单价、数量、总价；工作效率、工作时间、工作总量。读题时先圈关键词，再画线段图或表格。`,
      `## 速度时间路程\n路程等于速度乘时间，速度等于路程除以时间，时间等于路程除以速度。遇到相向而行、同向追及问题时，要判断速度是相加还是相减。`,
      `## 单价数量总价\n总价等于单价乘数量，单价等于总价除以数量，数量等于总价除以单价。购物题常出现优惠、找零、满减，需要分步骤计算。`,
      `## 解题步骤\n第一步读题，第二步找已知条件，第三步确定要求的问题，第四步列式，第五步检查单位和答案是否合理。XueMate 可以把这些步骤变成任务清单。`,
      `## 薄弱点复习\n如果学生总是把速度和路程混淆，学习画像会记录为薄弱点。知识图谱会把“速度时间路程”“线段图”“单位换算”连接到复习队列。`
    ]
  },
  {
    collectionId: englishId,
    fileName: '演示_小学英语_单词语法阅读.md',
    chunks: [
      `# 小学英语：单词与自然拼读\n英语单词学习可以从自然拼读开始。字母组合 sh, ch, th, ee, oo 有常见发音规律。学生看到单词时，可以先拆音节，再尝试拼读和记忆。`,
      `## 一般现在时\n一般现在时表示经常发生的动作或客观事实。主语是第三人称单数时，动词通常加 s 或 es，例如 He likes apples. She goes to school.`,
      `## 一般过去时\n一般过去时表示过去发生的事情。规则动词通常加 ed，例如 played, cleaned, watched。不规则动词需要单独记忆，例如 go-went, do-did, see-saw。`,
      `## 阅读理解\n做阅读理解时，先看题目，再回到文章找关键词。注意人物、时间、地点、原因和结果。遇到不认识的单词，可以根据上下文猜意思。`,
      `## 易错点\n学生常把一般现在时和一般过去时混淆，或者忘记第三人称单数加 s。知识图谱会把“时态”“第三人称单数”“阅读关键词”连接起来。`
    ]
  },
  {
    collectionId: englishId,
    fileName: '演示_英语口语_校园情景.md',
    chunks: [
      `# 英语口语：校园情景\n校园口语可以从问候、自我介绍、借东西、问路、课堂回答开始。常用句型包括 May I borrow your pencil? Where is the library? I like science.`,
      `## 自我介绍\n自我介绍可以包括姓名、年龄、年级、爱好和喜欢的科目。例如 My name is Lily. I am ten years old. I like reading and drawing. My favorite subject is English.`,
      `## 问路和地点\n问路常用 Where is ...? It is next to ... It is on the second floor. 学生需要掌握 library, classroom, playground, office 等校园地点词。`,
      `## 口语练习方法\n先听标准句子，再跟读，再替换关键词造句。XueMate 可以根据学习画像判断学生是否更喜欢中文提示、英文提示或中英双语提示。`
    ]
  },
  {
    collectionId: scienceId,
    fileName: '演示_科学实验_植物磁铁过滤.md',
    chunks: [
      `# 科学实验：观察与记录\n科学实验需要提出问题、作出假设、设计实验、观察记录、分析结论。记录时要写清楚时间、材料、步骤、现象和结论。`,
      `## 植物生长\n植物生长需要水、空气、阳光和适宜温度。观察种子发芽时，可以记录每天的高度、叶片数量和颜色变化。要控制变量，例如只有光照不同，其他条件保持相同。`,
      `## 磁铁实验\n磁铁有南极和北极，同极相斥，异极相吸。磁铁能吸引铁、钴、镍等材料，但不能吸引纸、木头、塑料。实验时要记录哪些物体能被吸引。`,
      `## 过滤实验\n过滤可以把不溶于水的固体和液体分开，例如用滤纸过滤泥沙水。实验要注意滤纸贴紧漏斗，液面不能高过滤纸边缘。`,
      `## 实验报告\n实验报告包括问题、假设、材料、步骤、现象、结论和反思。XueMate 可以检查实验报告是否缺少步骤或结论。`
    ]
  },
  {
    collectionId: scienceId,
    fileName: '演示_Scratch_Python_少儿编程.md',
    chunks: [
      `# 少儿编程：Scratch 与 Python\n少儿编程先理解顺序结构、循环结构和条件判断。Scratch 用积木表达程序逻辑，Python 用代码表达程序逻辑。二者都需要先想清楚步骤。`,
      `## 循环结构\n循环用于重复执行动作。Scratch 中有重复执行、重复直到；Python 中有 for 循环和 while 循环。学习循环时要注意循环次数和停止条件。`,
      `## 条件判断\n条件判断用于根据情况选择不同动作。Scratch 中使用如果那么积木，Python 中使用 if、elif、else。条件表达式可以比较大小、判断是否相等。`,
      `## 变量和列表\n变量用于保存一个值，例如分数、生命值、计数器。列表可以保存多个值，例如成绩列表、单词列表。Python 列表索引从 0 开始，容易出现索引越界。`,
      `## 调试方法\n调试程序时先复现问题，再缩小范围，最后修改一处再测试。XueMate 可以把错误提示翻译成小学生能懂的话，例如“循环没有停止条件”“变量名字写错了”。`
    ]
  }
]

function chunkOffsets(chunks) {
  let pos = 0
  return chunks.map((content) => {
    const start = pos
    const end = start + content.length
    pos = end + 1
    return { content, start, end }
  })
}

const tx = db.transaction(() => {
  db.prepare("DELETE FROM documents WHERE file_name LIKE '演示_%'").run()

  for (const doc of docs) {
    const docId = uuid('demo-doc')
    const chunks = chunkOffsets(doc.chunks)
    db.prepare('INSERT INTO documents (id, collection_id, file_name, chunk_count, created_at) VALUES (?, ?, ?, ?, ?)').run(
      docId,
      doc.collectionId,
      doc.fileName,
      chunks.length,
      now
    )
    for (const chunk of chunks) {
      db.prepare('INSERT INTO chunks (id, document_id, collection_id, file_name, content, embedding, start_pos, end_pos, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid('demo-chunk'),
        docId,
        doc.collectionId,
        doc.fileName,
        chunk.content,
        fakeEmbedding(chunk.content),
        chunk.start,
        chunk.end,
        now
      )
    }
    db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now, doc.collectionId)
  }
})

tx()

const summary = db.prepare(`
  SELECT c.id, c.name, COUNT(d.id) AS docs, COALESCE(SUM(d.chunk_count), 0) AS chunks
  FROM collections c
  LEFT JOIN documents d ON d.collection_id = c.id
  GROUP BY c.id
  ORDER BY CASE WHEN c.id='default' THEN 0 ELSE 1 END, c.updated_at DESC
`).all()

console.log(JSON.stringify({ ok: true, dbPath, insertedDocs: docs.length, summary }, null, 2))
