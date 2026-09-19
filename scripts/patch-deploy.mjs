import fs from 'node:fs'
let w = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8')
const oldBlock = [
  '          npm ci',
  '          npm run editor:build',
  '          cd docs',
  '          npm ci',
  '          npx vuepress build',
  '          cd ../..',
  '          cp -r editor/dist "docs/.vuepress/dist/Editor"',
].join('\n')
const newBlock = [
  '          npm ci',
  '          npm run editor:build',
  '          npm run build',
  '          cp -r editor/dist "docs/.vuepress/dist/Editor"',
].join('\n')
if (!w.includes(oldBlock)) {
  console.log('PATTERN NOT FOUND')
  process.exit(1)
}
w = w.replace(oldBlock, newBlock)
fs.writeFileSync('.github/workflows/deploy-pages.yml', w)
console.log('deploy-pages now:', w.includes('cd docs') ? 'STILL HAS cd docs' : 'three-step ok')
