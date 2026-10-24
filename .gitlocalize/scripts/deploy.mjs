#!/usr/bin/env node
/* Thin launcher for the GitLocalize CLI.
 *
 * The real implementation is the Rust binary released on GitHub; this file only
 * downloads it once and forwards the arguments, so `node .gitlocalize/scripts/deploy.mjs`
 * keeps working on machines without a Rust toolchain. */
'use strict'

const { spawn } = require('node:child_process')
const { existsSync, mkdirSync, createWriteStream, chmodSync } = require('node:fs')
const { join } = require('node:path')
const { homedir } = require('node:os')
const https = require('node:https')

const upstream = process.env.GITLOCALIZE_UPSTREAM || 'HayashiUme/GitLocalize'
const windows = process.platform === 'win32'
const platform = windows ? 'windows-x64' : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64') : 'linux-x64'
const archive = `gitlocalize-${platform}.${windows ? 'zip' : 'tar.gz'}`
const dir = join(homedir(), '.cache', 'gitlocalize')
const binary = join(dir, windows ? 'gitlocalize.exe' : 'gitlocalize')

function download(url, file) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'gitlocalize-launcher' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          download(new URL(response.headers.location, url).toString(), file).then(resolve, reject)
          return
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`))
          return
        }
        const stream = createWriteStream(file)
        response.pipe(stream)
        stream.on('finish', resolve)
      })
      .on('error', reject)
  })
}

function extract(file) {
  return new Promise((resolve, reject) => {
    const command = windows
      ? ['powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${file}" -DestinationPath "${dir}" -Force`]]
      : ['tar', ['-xzf', file, '-C', dir]]
    const child = spawn(command[0], command[1], { stdio: 'inherit' })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`extract failed with ${code}`))))
  })
}

async function main() {
  if (!existsSync(binary)) {
    mkdirSync(dir, { recursive: true })
    const url = `https://github.com/${upstream}/releases/latest/download/${archive}`
    console.error(`Downloading ${archive} from ${upstream}...`)
    const temp = join(dir, archive)
    await download(url, temp)
    await extract(temp)
    if (!windows) chmodSync(binary, 0o755)
  }
  const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((error) => {
  console.error(`gitlocalize launcher: ${error.message}`)
  console.error('Install the CLI manually from the releases page if this keeps failing.')
  process.exit(1)
})
