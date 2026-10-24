/* Web download: the editor runs in a browser, so a blob anchor is all it needs. */
export async function downloadTextFile(path: string, content: string): Promise<string> {
  const name = path.split('/').pop() ?? 'translation.txt'
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
  return name
}
