import { defineClientConfig } from 'vuepress/client'

/* In-place page translation: pick a language, the visible text is machine-translated
   where it stands. No route change, no per-language page tree. "Original" restores. */

const LANGS = [
  'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'hi',
  'id', 'tr', 'vi', 'th', 'nl', 'pl', 'sv', 'uk', 'cs',
]

const STORAGE_KEY = 'gitlocalize.docLang'
const originals = new WeakMap<Text, string>()
let busy = false

async function mtOne(text: string, target: string): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
    `&sl=en&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(String(response.status))
  const data = (await response.json()) as unknown[][]
  return (data[0] ?? []).map((segment) => String(segment?.[0] ?? '')).join('')
}

function collectTextNodes(root: Element): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const text = node.textContent?.trim() ?? ''
    if (text.length < 2) continue
    if (node.parentElement?.closest('pre, code, input, textarea, select, script, style, .wz')) continue
    nodes.push(node)
  }
  return nodes
}

async function translatePage(target: string): Promise<void> {
  if (busy) return
  const root = document.querySelector('.theme-default-content')
  if (!root) return
  const indicator = document.getElementById('glz-mt-progress')
  const nodes = collectTextNodes(root)
  if (target === '') {
    for (const node of nodes) {
      const original = originals.get(node)
      if (original !== undefined) node.textContent = original
    }
    localStorage.removeItem(STORAGE_KEY)
    if (indicator) indicator.textContent = '🌐'
    return
  }

  busy = true
  for (const node of nodes) {
    if (!originals.has(node)) originals.set(node, node.textContent ?? '')
  }

  let done = 0
  let failures = 0
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < nodes.length) {
      const node = nodes[cursor]
      cursor += 1
      const original = originals.get(node) ?? ''
      try {
        const translated = await mtOne(original, target)
        if (translated) node.textContent = translated
      } catch {
        failures += 1
      }
      done += 1
      if (indicator) indicator.textContent = `🌐 ${done}/${nodes.length}`
    }
  }

  await Promise.all(Array.from({ length: 6 }, () => worker()))
  busy = false
  localStorage.setItem(STORAGE_KEY, target)
  if (indicator) {
    indicator.textContent = failures > 0 ? `🌐 ${target} (${failures} failed)` : `🌐 ${target} ✓`
  }
}

function mountSwitch(): void {
  const navbar = document.querySelector('.navbar-items')
  if (!navbar || document.getElementById('glz-mt-select')) return

  const item = document.createElement('li')
  item.className = 'navbar-item'
  item.style.display = 'flex'
  item.style.alignItems = 'center'
  item.style.gap = '6px'

  const select = document.createElement('select')
  select.id = 'glz-mt-select'
  select.style.cssText = 'padding:4px 8px;border:1px solid var(--c-border,#d0d7de);border-radius:6px;font-size:13px;background:transparent;color:inherit;max-width:150px'
  select.innerHTML =
    '<option value="">🌐 Original</option>' +
    LANGS.map((lang) => `<option value="${lang}">${lang}</option>`).join('')

  const progress = document.createElement('span')
  progress.id = 'glz-mt-progress'
  progress.textContent = '🌐'
  progress.style.fontSize = '13px'
  progress.title = 'Machine-translate this page in place'

  select.addEventListener('change', () => void translatePage(select.value))
  item.append(select, progress)
  navbar.appendChild(item)

  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    select.value = saved
    void indicatorProgress(progress, saved)
  }
}

async function indicatorProgress(progress: HTMLElement, target: string): Promise<void> {
  progress.textContent = `🌐 ${target}`
  await translatePage(target)
}

export default defineClientConfig({
  enhance() {
    if (typeof document === 'undefined') return
    const timer = setInterval(() => {
      if (document.querySelector('.navbar-items')) {
        clearInterval(timer)
        mountSwitch()
      }
    }, 400)
    /* Re-translate after client-side route changes: the DOM is rebuilt on navigation. */
    let lastPath = ''
    const routeTimer = setInterval(() => {
      if (typeof window === 'undefined') return
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) setTimeout(() => void translatePage(saved), 600)
      }
    }, 700)
    void routeTimer
  },
})
