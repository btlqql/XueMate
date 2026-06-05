const path = require('path')
const esbuild = require(path.join(process.cwd(), 'node_modules/esbuild'))
const outfile = path.join(process.cwd(), '.tmp/xuemate-learningGraph.cjs')
esbuild.buildSync({
  entryPoints: [path.join(process.cwd(), 'src/main/services/learningGraph.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['better-sqlite3'],
  sourcemap: false,
  logLevel: 'silent'
})
const { buildLearningGraph } = require(outfile)
for (const id of ['default', 'all']) {
  const g = buildLearningGraph(id)
  console.log('\nGRAPH', id)
  console.log(JSON.stringify(g.stats, null, 2))
  console.log('nodes', g.nodes.slice(0, 16).map(n => `${n.type}:${n.label}`).join(' | '))
  console.log('edges', g.edges.slice(0, 16).map(e => `${e.label}:${e.source}->${e.target}`).join(' | '))
}
