import { Buffer } from 'buffer'

/* isomorphic-git reaches for Node's Buffer while running; the WebView has no such global. */
;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer
