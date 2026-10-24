declare module '*?raw' {
  const content: string
  export default content
}

declare interface Window {
  __GITLOCALIZE_CONFIG__?: {
    owner?: string
    repo?: string
    translationBranch?: string
    mainBranch?: string
    sourceLanguage?: string
    directory?: string
    files?: string[]
    deviceFlowClientId?: string
  }
}
