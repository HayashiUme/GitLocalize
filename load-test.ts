import { createClient } from './src/github/api'
import { flatten, getParser } from './src/parser'

const token = process.env.GHTOK as string
const client = createClient(token)
for (const lang of ['en', 'zh-CN']) {
  const raw = await client.get<string>(
    `/repos/HayashiUme/GitLocalize/contents/locales/app.${lang}.yml?ref=i18n`,
    { accept: 'application/vnd.github.raw', raw: true },
  )
  const parsed = flatten(getParser(`locales/app.${lang}.yml`).parse(raw))
  const translated = parsed.filter((item) => (item.value ?? '').trim() !== '').length
  console.log(`${lang}: ${translated}/${parsed.length} strings`)
}
