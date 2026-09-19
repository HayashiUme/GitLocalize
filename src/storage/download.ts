import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

/* Web builds download through the browser; native builds write the file where the user can reach it. */
export async function downloadTextFile(path: string, content: string): Promise<string> {
  const name = path.split('/').pop() ?? 'translation.txt'
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
    return name
  }
  const target = `GitLocalize/${name}`
  await Filesystem.writeFile({
    path: target,
    data: content,
    directory: Directory.Documents,
    encoding: undefined,
    recursive: true,
  })
  return target
}
