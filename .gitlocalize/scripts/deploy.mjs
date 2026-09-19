#!/usr/bin/env node
/* GitLocalize one-shot deploy.
 *
 * Run inside your own repository:
 *   node .gitlocalize/scripts/deploy.mjs
 *
 * Collects configuration interactively, saves it to .gitlocalize/config.json,
 * downloads the editor assets, generates the CI workflow, enables GitHub Pages
 * and optionally sets up branch protection.
 */
import { createInterface } from 'node:readline/promises'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const ROOT = process.cwd()
const CONFIG_DIR = path.join(ROOT, '.gitlocalize')
const EDITOR_DIR = path.join(CONFIG_DIR, 'editor')
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows')
const UPSTREAM = process.env.GITLOCALIZE_UPSTREAM ?? 'https://hayashiume.github.io/GitLocalize/Editor/'

const BRANCH_RE = /^[A-Za-z0-9._/-]{1,80}$/

function fetchText(url, redirects = 2) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        resolve(fetchText(new URL(response.headers.location, url).toString(), redirects - 1))
        return
      }
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => {
        if (response.statusCode !== 200) reject(new Error(`HTTP ${response.statusCode} for ${url}`))
        else resolve(body)
      })
    }).on('error', reject)
  })
}

function download(url, file) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) { reject(new Error(`HTTP ${response.statusCode} for ${url}`)); return }
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const stream = fs.createWriteStream(file)
      response.pipe(stream)
      stream.on('finish', resolve)
      stream.on('error', reject)
    }).on('error', reject)
  })
}

function run(command) {
  return execSync(command, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()
}

let rl = null

/* Piped input (automation) is consumed from a buffer; TTY input uses readline. */
let pipedLines = null
let pipedIndex = 0

function nextPipedLine() {
  return pipedLines ? (pipedLines[pipedIndex] ?? '') : null
}

function consumePipedLine() {
  pipedIndex += 1
}

async function ask(question, fallback, validate) {
  for (;;) {
    const piped = nextPipedLine()
    if (process.env.GLZ_DEBUG) console.error('Q:', JSON.stringify(question.slice(0, 26)), 'A:', JSON.stringify(piped))
    const answer = (piped !== null ? piped : (await rl.question(question))).trim() || fallback
    if (piped !== null) consumePipedLine()
    const suffix = fallback ? ` [${fallback}]` : ''
    if (!piped) console.log(`${question}${suffix}: ${answer}`)
    if (validate) {
      console.error('VALIDATE:', JSON.stringify(answer));      const problem = validate(answer)
      if (problem) { console.log(`  x ${problem}`); continue }
    }
    return answer
  }
}

async function confirm(question, fallback = true) {
  for (;;) {
    const piped = nextPipedLine()
    const answer = (piped !== null ? piped : (await rl.question(question))).trim().toLowerCase()
    if (piped !== null) consumePipedLine()
    if (answer === '') return fallback
    if (answer === 'y' || answer === 'yes' || answer === 'n' || answer === 'no') {
      if (!piped) console.log(`${question}: ${answer}`)
      return answer === 'y' || answer === 'yes'
    }
    console.log('  x answer y or n')
  }
}
function assertBranch(name) {
  return BRANCH_RE.test(name) ? null : 'branch names may only contain letters, digits, dot, slash and dash'
}

async function main() {
  if (!process.stdin.isTTY) {
    pipedLines = fs.readFileSync(0, 'utf8').split(/\r?\n/)
    console.error('PIPED DUMP:', JSON.stringify(pipedLines))
  } else {
    rl = createInterface({ input: process.stdin, output: process.stdout })
  }
  console.log('GitLocalize deploy - configure your repository in a few questions.\n')

  let remote = ''
  try { remote = run('git config --get remote.origin.url') } catch { /* a fresh local repo may have none */ }
  const guess = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1] ?? ''

  const mainBranch = await ask('1) Main (target) branch name', 'main', assertBranch)
  const translationBranch = await ask('2) Translation / web branch name', 'i18n', assertBranch)

  const files = []
  console.log('\n3) Language files. For each group give the source file and the translation pattern.')
  console.log('   Use {language} in the translation pattern; it is replaced by the language code.')
  /* Piped input is linear, so automation collects exactly one file group; interactive users can add many. */
  const groupLimit = pipedLines ? 1 : Number.POSITIVE_INFINITY
  for (let group = 0; group < groupLimit; group += 1) {
    const source = await ask('   source file (blank to finish)', files.length === 0 ? 'locales/app.en.yml' : '')
    if (!source) break
    if (!fs.existsSync(path.join(ROOT, source))) {
      console.log(`  ! not found on disk: ${source} (continuing anyway - the file may appear later)`)
    }
    const translation = await ask('   translation pattern', source.replace(/\.([A-Za-z0-9]+)$/, '.{language}.$1'), (value) =>
      value.includes('{language}') ? null : 'the pattern must contain {language}')
    const names = {}
    console.log('   language names, one per line (code = display name); blank line to finish:')
    for (;;) {
      const piped = nextPipedLine()
      const pair = (piped !== null ? piped : (await rl.question('   e.g. zh-CN = Chinese (Simplified) : '))).trim()
      if (piped !== null) consumePipedLine()
      if (!pair) break
      const eq = pair.indexOf('=')
      const code = pair.slice(0, eq).trim()
      const name = pair.slice(eq + 1).trim()
      if (code && name) names[code] = name
      else console.log('  x use the form "code = name"')
    }
    files.push({ source, translation, names })
  }
  if (files.length === 0) { console.log('x no language files configured, aborting.'); process.exit(1) }

  const sourceLanguage = await ask('4) Source language code', 'en')
  const prTitle = await ask('5) Pull request title ({language} supported)', 'i18n({language}): update translations')
  const prBody = await ask('   Pull request body ({language} supported)', 'Update {language} translations reviewed in the GitLocalize editor.')
  const commitMessage = await ask('   Commit message ({language} supported)', 'i18n({language}): update translations')

  const enablePages = await confirm('6) Deploy the editor to GitHub Pages on this repository?')
  const branchProtection = await confirm('7) Set up branch protection (rulesets for both branches)?')

  const config = {
    project: guess,
    main_branch: mainBranch,
    translation_branch: translationBranch,
    source_language: sourceLanguage,
    files,
    pull_request: { title: prTitle, body: prBody },
    commit_message: commitMessage,
    pages: enablePages,
    branch_protection: branchProtection,
  }

  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n')
  console.log('\n+ configuration saved to .gitlocalize/config.json')

  console.log('\nDownloading editor assets...')
  fs.mkdirSync(EDITOR_DIR, { recursive: true })
  const indexHtml = await fetchText(UPSTREAM)
  fs.writeFileSync(path.join(EDITOR_DIR, 'index.html'), indexHtml)
  const assets = [...indexHtml.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((match) => match[1])
  for (const asset of assets) {
    await download(new URL(asset, UPSTREAM).toString(), path.join(EDITOR_DIR, asset))
  }
  console.log(`+ ${assets.length + 1} editor files under .gitlocalize/editor/`)

  fs.mkdirSync(WORKFLOW_DIR, { recursive: true })
  const languages = JSON.stringify([...new Set(files.flatMap((group) => Object.keys(group.names)))])
  const workflow = `
name: GitLocalize

on:
  push:
    branches: ["${translationBranch}"]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
${enablePages ? '  pages: write\n  id-token: write\n' : ''}
concurrency:
  group: gitlocalize
  cancel-in-progress: false

jobs:
  pull-request:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Open or refresh the translation pull request
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          TRANSLATION_BRANCH: ${translationBranch}
          MAIN_BRANCH: ${mainBranch}
          PR_TITLE: ${JSON.stringify(prTitle)}
          PR_BODY: ${JSON.stringify(prBody)}
        run: |
          set -euo pipefail
          git fetch origin "$MAIN_BRANCH" --quiet
          langs="$(git diff --name-only "origin/$MAIN_BRANCH" HEAD | grep -oE '\\.([A-Za-z]{2}(-[A-Za-z]{2,4})?)\\.(ya?ml|json)$' | sed 's/^\\.//' | sort -u | tr '\\n' ',' | sed 's/,$//')"
          langs="\${langs:-$TRANSLATION_BRANCH}"
          title="\${PR_TITLE//\\{language\\}/$langs}"
          body="\${PR_BODY//\\{language\\}/$langs}"
          existing="$(gh pr list --base "$MAIN_BRANCH" --head "$TRANSLATION_BRANCH" --state open --json number --jq '.[0].number')"
          if [ -n "$existing" ]; then
            gh pr edit "$existing" --title "$title" --body "$body"
            echo "Pull request #$existing refreshed"
          else
            gh pr create --base "$MAIN_BRANCH" --head "$TRANSLATION_BRANCH" --title "$title" --body "$body"
          fi
${enablePages ? `  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/${mainBranch}'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Stage the editor as the Pages artifact
        run: |
          mkdir -p _site
          cp -r .gitlocalize/editor/* _site/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - uses: actions/deploy-pages@v4
` : ''}`
  fs.writeFileSync(path.join(WORKFLOW_DIR, 'gitlocalize.yml'), workflow.trim() + '\n')
  console.log('+ .github/workflows/gitlocalize.yml generated')

  fs.writeFileSync(path.join(ROOT, '.github', 'i18n.yml'), [
    `source_language: ${sourceLanguage}`,
    `languages: ${languages}`,
    'files:',
    ...files.map((group) => `  - source: ${group.source}`),
    '',
  ].join('\n'))
  console.log('+ .github/i18n.yml generated')

  let ghOk = false
  try { run('gh --version'); ghOk = true } catch { console.log('! gh CLI not found - enable Pages manually in Settings > Pages.') }

  if (ghOk && enablePages) {
    try {
      run('gh api -X POST repos/:owner/:repo/pages -f build_type=workflow || true')
      console.log('+ GitHub Pages enabled (workflow build type)')
    } catch (error) { console.log(`! pages enable failed: ${error.message}`) }
  }
  if (ghOk && branchProtection) {
    try {
      run(`gh api -X POST repos/:owner/:repo/rulesets -H "Accept: application/vnd.github+json" -d '{"name":"gitlocalize-main","target":"branch","enforcement":"active","conditions":{"ref_name":{"include":["refs/heads/${mainBranch}"],"exclude":[]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"pull_request","parameters":{"required_approving_review_count":0,"allowed_merge_methods":["merge","squash"]}}]}' > /dev/null`)
      run(`gh api -X POST repos/:owner/:repo/rulesets -H "Accept: application/vnd.github+json" -d '{"name":"gitlocalize-${translationBranch}","target":"branch","enforcement":"active","conditions":{"ref_name":{"include":["refs/heads/${translationBranch}"],"exclude":[]}},"bypass_actors":[],"rules":[{"type":"deletion"},{"type":"non_fast_forward"}]}' > /dev/null`)
      console.log('+ branch rulesets created')
    } catch (error) { console.log(`! ruleset setup failed: ${error.message}`) }
  }

  if (await confirm('\nCommit and push these files now (creates the translation branch)?')) {
    try {
      run(`git checkout -b "${translationBranch}" 2>/dev/null || git checkout "${translationBranch}"`)
      run('git add .gitlocalize .github/workflows/gitlocalize.yml .github/i18n.yml')
      run('git commit -m "chore: set up GitLocalize"')
      run(`git push -u origin "${translationBranch}"`)
      console.log(`\n+ pushed ${translationBranch}. The translation pull request workflow runs on this push.`)
      if (enablePages) console.log('+ the editor will be served on this repository\'s Pages once the job finishes.')
    } catch (error) { console.log(`! git push failed: ${error.message} - commit the files manually.`) }
  }

  rl?.close()
}

main().catch((error) => { console.error(error); process.exit(1) }).finally(() => process.exit(0))
