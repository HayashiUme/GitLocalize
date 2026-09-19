import { Directory, Encoding, Filesystem, type StatResult } from '@capacitor/filesystem'
import { base64ToBytes, bytesToBase64 } from './base64'

/* isomorphic-git speaks Node's fs vocabulary; the Capacitor plugin speaks its own. This bridges them. */
const ROOT = Directory.Data
const DIRECTORY_MODE = 0o040755
const FILE_MODE = 0o100644

export interface FsStats {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  size: number
  mtimeMs: number
  ctimeMs: number
  atimeMs: number
  birthtimeMs: number
  mode: number
  uid: number
  gid: number
  ino: number
  dev: number
  nlink: number
  rdev: number
  blksize: number
  blocks: number
  atime: Date
  mtime: Date
  ctime: Date
  birthtime: Date
}

interface FsError extends Error {
  code?: string
}

type EncodingOption = string | null | undefined
type Options = EncodingOption | { encoding?: EncodingOption }

/* The plugin resolves against a Directory, so the leading slash isomorphic-git leaves has to go. */
function relative(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

/* isomorphic-git branches on err.code, so a missing file must surface as ENOENT and not as a message. */
function asFsError(error: unknown, path: string): FsError {
  const message = error instanceof Error ? error.message : String(error)
  const wrapped = new Error(`${path}: ${message}`) as FsError
  if (/does not exist|not found|ENOENT|no such file/i.test(message)) wrapped.code = 'ENOENT'
  else if (/already exists|EEXIST/i.test(message)) wrapped.code = 'EEXIST'
  else if (/not a directory|ENOTDIR/i.test(message)) wrapped.code = 'ENOTDIR'
  else wrapped.code = 'EIO'
  return wrapped
}

function toStats(info: StatResult): FsStats {
  const directory = info.type === 'directory'
  const mtime = info.mtime ?? 0
  const ctime = info.ctime ?? mtime
  return {
    isFile: () => !directory,
    isDirectory: () => directory,
    isSymbolicLink: () => false,
    size: info.size ?? 0,
    mtimeMs: mtime,
    ctimeMs: ctime,
    atimeMs: mtime,
    birthtimeMs: ctime,
    mode: directory ? DIRECTORY_MODE : FILE_MODE,
    uid: 0,
    gid: 0,
    ino: 1,
    dev: 1,
    nlink: 1,
    rdev: 0,
    blksize: 4096,
    blocks: 0,
    atime: new Date(mtime),
    mtime: new Date(mtime),
    ctime: new Date(ctime),
    birthtime: new Date(ctime),
  }
}

function readEncoding(options?: Options): EncodingOption {
  return typeof options === 'string' ? options : options?.encoding
}

async function readFile(path: string, options?: Options): Promise<string | Uint8Array> {
  try {
    if (readEncoding(options)) {
      const { data } = await Filesystem.readFile({
        path: relative(path),
        directory: ROOT,
        encoding: Encoding.UTF8,
      })
      return typeof data === 'string' ? data : await data.text()
    }
    const { data } = await Filesystem.readFile({ path: relative(path), directory: ROOT })
    /* Native returns base64; the web fallback hands back a Blob. */
    return typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer())
  } catch (error) {
    throw asFsError(error, path)
  }
}

async function writeFile(path: string, data: string | Uint8Array, options?: Options): Promise<void> {
  const textual = typeof data === 'string'
  try {
    await Filesystem.writeFile({
      path: relative(path),
      data: textual ? (data as string) : bytesToBase64(data as Uint8Array),
      directory: ROOT,
      /* A string without an encoding option is still text, and Capacitor would read it as base64. */
      encoding: textual ? Encoding.UTF8 : undefined,
      recursive: true,
    })
  } catch (error) {
    throw asFsError(error, path)
  }
}

async function unlink(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: relative(path), directory: ROOT })
  } catch (error) {
    throw asFsError(error, path)
  }
}

async function readdir(path: string): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path: relative(path), directory: ROOT })
    return files.map((entry) => entry.name)
  } catch (error) {
    throw asFsError(error, path)
  }
}

async function mkdir(path: string): Promise<void> {
  try {
    await Filesystem.mkdir({ path: relative(path), directory: ROOT, recursive: true })
  } catch (error) {
    const failure = asFsError(error, path)
    if (failure.code !== 'EEXIST') throw failure
  }
}

async function rmdir(path: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path: relative(path), directory: ROOT, recursive: true })
  } catch (error) {
    throw asFsError(error, path)
  }
}

async function stat(path: string): Promise<FsStats> {
  try {
    return toStats(await Filesystem.stat({ path: relative(path), directory: ROOT }))
  } catch (error) {
    throw asFsError(error, path)
  }
}

/* bindFs walks a fixed command list regardless of the optional markers in the types, so these must exist. */
async function readlink(path: string): Promise<string> {
  const error = new Error(`${path}: not a symbolic link`) as FsError
  error.code = 'EINVAL'
  throw error
}

async function symlink(_target: string, path: string): Promise<void> {
  const error = new Error(`${path}: symbolic links are not supported`) as FsError
  error.code = 'ENOSYS'
  throw error
}

export const capacitorFs = {
  promises: {
    readFile,
    writeFile,
    unlink,
    readdir,
    mkdir,
    rmdir,
    stat,
    lstat: stat,
    readlink,
    symlink,
  },
}
