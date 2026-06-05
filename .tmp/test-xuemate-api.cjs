const path = require('path')
const esbuild = require(path.join(process.cwd(), 'node_modules/esbuild'))
const outfile = path.join(process.cwd(), '.tmp/xuemate-api-smoke.cjs')
esbuild.buildSync({
  entryPoints: [path.join(process.cwd(), '.tmp/xuemate-api-smoke-entry.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['better-sqlite3'],
  sourcemap: false,
  logLevel: 'silent'
})
require(outfile)
