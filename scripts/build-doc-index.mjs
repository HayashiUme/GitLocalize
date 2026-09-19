// Generates docs/<lang>/guide/index.md for every docs locale.
// Run: node scripts/build-doc-index.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const langs = {
  '': {
    title: 'Documentation',
    intro:
      'GitLocalize is a translation collaboration platform that runs entirely on GitHub: no server, no database, the repository is the backend.',
    steps: [
      ['Get a personal access token', 'Fine-grained, scoped to your repository, with Contents read and write.'],
      ['Deploy your own copy', 'Use this template, run scripts/setup-repo.sh, done.'],
      ['Translate in the editor', 'Open the published editor, paste the token, commit as yourself.'],
    ],
    more: 'The full guides are linked below. They are currently written in English; translations are being added language by language.',
    pages: [
      ['Getting a token', '/guide/token.md'],
      ['Deploying GitLocalize', '/guide/deploy.md'],
      ['Architecture', '/guide/architecture.md'],
      ['Repository setup', '/guide/setup.md'],
      ['Security model', '/guide/security.md'],
    ],
  },
  'zh': {
    title: '文档',
    intro: 'GitLocalize 是一个完全运行在 GitHub 上的翻译协作平台：没有服务器、没有数据库，仓库本身就是后端。',
    steps: [
      ['获取个人访问令牌', '细粒度令牌，仅限本仓库，授予 Contents 读写权限。'],
      ['部署你自己的 GitLocalize', '使用模板创建仓库，运行 scripts/setup-repo.sh 即可。'],
      ['在编辑器中翻译', '打开在线编辑器，粘贴令牌，以你自己的身份提交。'],
    ],
    more: '完整指南为英文版，链接见下；各语言版本正在逐步补充。',
    pages: [['获取令牌（英文）', '/guide/token.md'], ['部署指南（英文）', '/guide/deploy.md']],
  },
  'zh-tw': {
    title: '文件',
    intro: 'GitLocalize 是一個完全執行在 GitHub 上的翻譯協作平台：沒有伺服器、沒有資料庫，儲存庫本身就是後端。',
    steps: [
      ['取得個人存取權杖', '精細權杖，僅限本儲存庫，授予 Contents 讀寫權限。'],
      ['部署你自己的 GitLocalize', '使用範本建立儲存庫，執行 scripts/setup-repo.sh 即可。'],
      ['在編輯器中翻譯', '開啟線上編輯器，貼上權杖，以你自己的身分提交。'],
    ],
    more: '完整指南為英文版，連結見下；各語言版本正在逐步補充。',
    pages: [['取得權杖（英文）', '/guide/token.md'], ['部署指南（英文）', '/guide/deploy.md']],
  },
  'ja': {
    title: 'ドキュメント',
    intro: 'GitLocalize は GitHub 上だけで動く翻訳コラボレーションプラットフォームです。サーバーもデータベースも不要で、リポジトリ自体がバックエンドです。',
    steps: [
      ['個人アクセストークンを取得', '対象リポジトリ限定の Fine-grained トークンで、Contents の読み書きを許可します。'],
      ['自分の GitLocalize をデプロイ', 'テンプレートからリポジトリを作り、scripts/setup-repo.sh を実行するだけです。'],
      ['エディタで翻訳', '公開されたエディタを開き、トークンを貼って自分自身のコミットとして翻訳します。'],
    ],
    more: '詳細ガイドは現在英語です。下のリンクから参照できます。各言語版は順次追加予定です。',
    pages: [['トークンの取得（英語）', '/guide/token.md'], ['デプロイガイド（英語）', '/guide/deploy.md']],
  },
  'ko': {
    title: '문서',
    intro: 'GitLocalize는 GitHub 위에서만 동작하는 번역 협업 플랫폼입니다. 서버도 데이터베이스도 없으며 저장소 자체가 백엔드입니다.',
    steps: [
      ['개인 액세스 토큰 발급', '이 저장소로 한정된 fine-grained 토큰에 Contents 읽기/쓰기를 허용합니다.'],
      ['자신만의 GitLocalize 배포', '템플릿으로 저장소를 만들고 scripts/setup-repo.sh를 실행하세요.'],
      ['편집기에서 번역', '공개된 편집기를 열고 토큰을 붙여넣어 본인 명의로 커밋합니다.'],
    ],
    more: '전체 가이드는 현재 영어로 제공됩니다. 아래 링크를 참고하세요.',
    pages: [['토큰 받기(영어)', '/guide/token.md'], ['배포 가이드(영어)', '/guide/deploy.md']],
  },
  'es': {
    title: 'Documentación',
    intro: 'GitLocalize es una plataforma de traducción colaborativa que funciona por completo en GitHub: sin servidores ni bases de datos, el repositorio es el backend.',
    steps: [
      ['Obtén un token de acceso', 'Fine-grained, limitado a tu repositorio, con Contents de lectura y escritura.'],
      ['Despliega tu propia copia', 'Crea el repositorio desde la plantilla y ejecuta scripts/setup-repo.sh.'],
      ['Traduce en el editor', 'Abre el editor publicado, pega el token y haz commits con tu identidad.'],
    ],
    more: 'Las guías completas están en inglés por ahora; los enlaces están abajo.',
    pages: [['Obtener un token (inglés)', '/guide/token.md'], ['Guía de despliegue (inglés)', '/guide/deploy.md']],
  },
  'fr': {
    title: 'Documentation',
    intro: 'GitLocalize est une plateforme de traduction collaborative qui fonctionne entièrement sur GitHub : sans serveur ni base de données, le dépôt est le backend.',
    steps: [
      ['Obtenez un jeton d’accès', 'Fine-grained, limité à votre dépôt, avec Contents en lecture et écriture.'],
      ['Déployez votre propre copie', 'Créez le dépôt depuis le modèle puis lancez scripts/setup-repo.sh.'],
      ['Traduisez dans l’éditeur', 'Ouvrez l’éditeur publié, collez le jeton et commitez en votre nom.'],
    ],
    more: 'Les guides complets sont en anglais pour le moment ; les liens sont ci-dessous.',
    pages: [['Obtenir un jeton (anglais)', '/guide/token.md'], ['Guide de déploiement (anglais)', '/guide/deploy.md']],
  },
  'de': {
    title: 'Dokumentation',
    intro: 'GitLocalize ist eine Übersetzungsplattform, die komplett auf GitHub läuft: ohne Server, ohne Datenbank – das Repository ist das Backend.',
    steps: [
      ['Personal Access Token holen', 'Fine-grained, auf dein Repository beschränkt, mit Contents-Lese-/Schreibzugriff.'],
      ['Eigene Kopie aufsetzen', 'Repository aus der Vorlage erstellen und scripts/setup-repo.sh ausführen.'],
      ['Im Editor übersetzen', 'Veröffentlichten Editor öffnen, Token einfügen, unter eigenem Namen committen.'],
    ],
    more: 'Die vollständigen Anleitungen sind derzeit englischsprachig; die Links finden Sie unten.',
    pages: [['Token holen (englisch)', '/guide/token.md'], ['Deployment-Anleitung (englisch)', '/guide/deploy.md']],
  },
  'pt': {
    title: 'Documentação',
    intro: 'O GitLocalize é uma plataforma de tradução colaborativa que funciona inteiramente no GitHub: sem servidor e sem banco de dados, o repositório é o backend.',
    steps: [
      ['Obtenha um token de acesso', 'Fine-grained, restrito ao seu repositório, com Contents de leitura e escrita.'],
      ['Implante sua própria cópia', 'Crie o repositório pelo template e execute scripts/setup-repo.sh.'],
      ['Traduza no editor', 'Abra o editor publicado, cole o token e faça commits com sua identidade.'],
    ],
    more: 'Os guias completos estão em inglês por enquanto; os links estão abaixo.',
    pages: [['Obter um token (inglês)', '/guide/token.md'], ['Guia de implantação (inglês)', '/guide/deploy.md']],
  },
  'it': {
    title: 'Documentazione',
    intro: 'GitLocalize è una piattaforma di traduzione collaborativa che funziona interamente su GitHub: senza server né database, il repository è il backend.',
    steps: [
      ['Ottieni un token di accesso', 'Fine-grained, limitato al tuo repository, con Contents in lettura e scrittura.'],
      ['Distribuisci la tua copia', 'Crea il repository dal template ed esegui scripts/setup-repo.sh.'],
      ['Traduci nell’editor', 'Apri l’editor pubblicato, incolla il token e fai commit con la tua identità.'],
    ],
    more: 'Le guide complete sono in inglese per ora; i collegamenti sono qui sotto.',
    pages: [['Ottenere un token (inglese)', '/guide/token.md'], ['Guida al deployment (inglese)', '/guide/deploy.md']],
  },
  'ru': {
    title: 'Документация',
    intro: 'GitLocalize — платформа для совместного перевода, работающая целиком на GitHub: без сервера и базы данных, репозиторий сам является бэкендом.',
    steps: [
      ['Получите персональный токен', 'Fine-grained, ограниченный вашим репозиторием, с правом чтения и записи Contents.'],
      ['Разверните свою копию', 'Создайте репозиторий из шаблона и запустите scripts/setup-repo.sh.'],
      ['Переводите в редакторе', 'Откройте опубликованный редактор, вставьте токен и коммитьте от своего имени.'],
    ],
    more: 'Полные руководства пока на английском; ссылки ниже.',
    pages: [['Получение токена (англ.)', '/guide/token.md'], ['Руководство по развёртыванию (англ.)', '/guide/deploy.md']],
  },
  'ar': {
    title: 'الوثائق',
    intro: 'GitLocalize منصة تعاون للترجمة تعمل بالكامل على GitHub: بلا خوادم ولا قواعد بيانات، فالمستودع نفسه هو الخلفية.',
    steps: [
      ['احصل على رمز وصول شخصي', 'رمز دقيق محدد بمستودعك مع إذن قراءة وكتابة للمحتويات.'],
      ['انشر نسختك الخاصة', 'أنشئ المستودع من القالب ثم شغّل scripts/setup-repo.sh.'],
      ['ترجم في المحرر', 'افتح المحرر المنشور، ألصق الرمز، ولتُسجَّل التعديلات باسمك.'],
    ],
    more: 'الأدلة الكاملة متاحة حاليًا بالإنجليزية؛ الروابط أدناه.',
    pages: [['الحصول على رمز (إنجليزي)', '/guide/token.md'], ['دليل النشر (إنجليزي)', '/guide/deploy.md']],
  },
  'hi': {
    title: 'दस्तावेज़',
    intro: 'GitLocalize एक ऐसा अनुवाद सहयोग मंच है जो पूरी तरह GitHub पर चलता है: कोई सर्वर नहीं, कोई डेटाबेस नहीं — रिपॉज़िटरी ही बैकएंड है।',
    steps: [
      ['पर्सनल एक्सेस टोकन लें', 'फ़ाइन-ग्रेन्यूल्ड, केवल अपने रिपॉज़िटरी के लिए, Contents पढ़ने/लिखने के साथ।'],
      ['अपनी कॉपी तैनात करें', 'टेम्पलेट से रिपॉज़िटरी बनाएँ और scripts/setup-repo.sh चलाएँ।'],
      ['एडिटर में अनुवाद करें', 'प्रकाशित एडिटर खोलें, टोकन चिपकाएँ, और अपने नाम से कमिट करें।'],
    ],
    more: 'पूर्ण गाइड अभी अंग्रेज़ी में हैं; लिंक नीचे हैं।',
    pages: [['टोकन प्राप्ति (अंग्रेज़ी)', '/guide/token.md'], ['डिप्लॉय गाइड (अंग्रेज़ी)', '/guide/deploy.md']],
  },
  'id': {
    title: 'Dokumentasi',
    intro: 'GitLocalize adalah platform kolaborasi terjemahan yang berjalan sepenuhnya di GitHub: tanpa server, tanpa basis data — repositorinya adalah backend-nya.',
    steps: [
      ['Dapatkan token akses pribadi', 'Fine-grained, terbatas pada repositori Anda, dengan izin baca-tulis Contents.'],
      ['Sebar salinan Anda sendiri', 'Buat repositori dari template lalu jalankan scripts/setup-repo.sh.'],
      ['Terjemahkan di editor', 'Buka editor yang dipublikasikan, tempel token, dan commit dengan identitas Anda.'],
    ],
    more: 'Panduan lengkap saat ini dalam bahasa Inggris; tautan di bawah.',
    pages: [['Mendapatkan token (Inggris)', '/guide/token.md'], ['Panduan deployment (Inggris)', '/guide/deploy.md']],
  },
  'tr': {
    title: 'Belgeler',
    intro: 'GitLocalize, tamamen GitHub üzerinde çalışan bir çeviri işbirliği platformudur: sunucu yok, veritabanı yok — depo kendisi arka uçtur.',
    steps: [
      ['Kişisel erişim tokenı alın', 'Fine-grained, yalnızca deponuz için, Contents okuma-yazma yetkisiyle.'],
      ['Kendi kopyanızı kurun', 'Şablondan depo oluşturun ve scripts/setup-repo.sh dosyasını çalıştırın.'],
      ['Editörde çevirin', 'Yayınlanan editörü açın, tokenı yapıştırın ve kendi adınıza commit atın.'],
    ],
    more: 'Eksiksiz kılavuzlar şimdilik İngilizcedir; bağlantılar aşağıda.',
    pages: [['Token alma (İngilizce)', '/guide/token.md'], ['Dağıtım kılavuzu (İngilizce)', '/guide/deploy.md']],
  },
  'vi': {
    title: 'Tài liệu',
    intro: 'GitLocalize là nền tảng dịch thuật cộng tác chạy hoàn toàn trên GitHub: không máy chủ, không cơ sở dữ liệu — chính kho lưu trữ là backend.',
    steps: [
      ['Lấy mã truy cập cá nhân', 'Fine-grained, giới hạn trong kho của bạn, cấp quyền đọc/ghi Contents.'],
      ['Triển khai bản của riêng bạn', 'Tạo kho từ mẫu rồi chạy scripts/setup-repo.sh.'],
      ['Dịch trong trình soạn thảo', 'Mở trình soạn thảo trực tuyến, dán mã và commit với danh nghĩa bạn.'],
    ],
    more: 'Hướng dẫn đầy đủ hiện có bản tiếng Anh; liên kết bên dưới.',
    pages: [['Lấy mã (tiếng Anh)', '/guide/token.md'], ['Hướng dẫn triển khai (tiếng Anh)', '/guide/deploy.md']],
  },
  'th': {
    title: 'เอกสาร',
    intro: 'GitLocalize คือแพลตฟอร์มการแปลแบบร่วมมือกันที่ทำงานบน GitHub ทั้งหมด: ไม่มีเซิร์ฟเวอร์ ไม่มีฐานข้อมูล — ตัวรีโพสิทอรีนั่นเองคือแบ็กเอนด์',
    steps: [
      ['ขอรับ personal access token', 'แบบ fine-grained จำกัดเฉพาะรีโพสิทอรีของคุณ พร้อมสิทธิ์อ่าน/เขียน Contents'],
      ['ติดตั้งสำเนาของคุณเอง', 'สร้างรีโพสิทอรีจาก template แล้วรัน scripts/setup-repo.sh'],
      ['แปลในตัวแก้ไข', 'เปิดตัวแก้ไขที่เผยแพร่ วาง token แล้วคอมมิตในนามของคุณ'],
    ],
    more: 'คู่มือฉบับเต็มเป็นภาษาอังกฤษในตอนนี้; ลิงก์อยู่ด้านล่าง',
    pages: [['การขอรับ token (อังกฤษ)', '/guide/token.md'], ['คู่มือการติดตั้ง (อังกฤษ)', '/guide/deploy.md']],
  },
  'nl': {
    title: 'Documentatie',
    intro: 'GitLocalize is een vertaalsamenwerkingsplatform dat volledig op GitHub draait: geen server, geen database — de repository is zelf de backend.',
    steps: [
      ['Vraag een personal access token aan', 'Fine-grained, beperkt tot je repository, met Contents lezen en schrijven.'],
      ['Zet je eigen kopie neer', 'Maak de repository vanuit de template en draai scripts/setup-repo.sh.'],
      ['Vertaal in de editor', 'Open de gepubliceerde editor, plak de token en commit onder je eigen naam.'],
    ],
    more: 'De volledige gidsen zijn voorlopig Engelstalig; de links staan hieronder.',
    pages: [['Token aanvragen (Engels)', '/guide/token.md'], ['Deployment-handleiding (Engels)', '/guide/deploy.md']],
  },
  'pl': {
    title: 'Dokumentacja',
    intro: 'GitLocalize to platforma do współtworzenia tłumaczeń działająca w całości na GitHubie: bez serwera i bazy danych — samą repozytorium jest backendem.',
    steps: [
      ['Uzyskaj osobisty token dostępu', 'Fine-grained, ograniczony do twojego repozytorium, z odczytem i zapisem Contents.'],
      ['Wdróż własną kopię', 'Utwórz repozytorium z szablonu i uruchom scripts/setup-repo.sh.'],
      ['Tłumacz w edytorze', 'Otwórz opublikowany edytor, wklej token i commituj pod własnym nazwiskiem.'],
    ],
    more: 'Pełne przewodniki są na razie po angielsku; linki poniżej.',
    pages: [['Uzyskanie tokenu (ang.)', '/guide/token.md'], ['Przewodnik wdrożenia (ang.)', '/guide/deploy.md']],
  },
  'sv': {
    title: 'Dokumentation',
    intro: 'GitLocalize är en samarbetsplattform för översättning som körs helt på GitHub: ingen server, ingen databas — själva repot är backend.',
    steps: [
      ['Skaffa en personlig åtkomsttoken', 'Fine-grained, begränsad till ditt repo, med läs- och skrivbehörighet för Contents.'],
      ['Distribuera din egen kopia', 'Skapa repot från mallen och kör scripts/setup-repo.sh.'],
      ['Översätt i editorn', 'Öppna den publicerade editorn, klistra in token och committa i ditt eget namn.'],
    ],
    more: 'De fullständiga guiderna är för närvarande på engelska; länkar nedan.',
    pages: [['Hämta token (engelska)', '/guide/token.md'], ['Distributionsguide (engelska)', '/guide/deploy.md']],
  },
  'uk': {
    title: 'Документація',
    intro: 'GitLocalize — платформа для спільного перекладу, що працює повністю на GitHub: без сервера й бази даних, сам репозиторій є бекендом.',
    steps: [
      ['Отримайте персональний токен', 'Fine-grained, обмежений вашим репозиторієм, з правом читання й запису Contents.'],
      ['Розгорніть власну копію', 'Створіть репозиторій із шаблону та запустіть scripts/setup-repo.sh.'],
      ['Перекладайте в редакторі', 'Відкрийте опублікований редактор, вставте токен і комітьте від свого імені.'],
    ],
    more: 'Повні посібники поки що англійською; посилання нижче.',
    pages: [['Отримання токена (англ.)', '/guide/token.md'], ['Посібник із розгортання (англ.)', '/guide/deploy.md']],
  },
  'cs': {
    title: 'Dokumentace',
    intro: 'GitLocalize je platforma pro spolupráci na překladech, běžící celá na GitHubu: bez serveru a databáze — repozitář sám je backendem.',
    steps: [
      ['Získejte osobní přístupový token', 'Fine-grained, omezený na váš repozitář, s právem číst a zapisovat Contents.'],
      ['Nasaďte vlastní kopii', 'Vytvořte repozitář ze šablony a spusťte scripts/setup-repo.sh.'],
      ['Překládejte v editoru', 'Otevřete zveřejněný editor, vložte token a commitujte pod svým jménem.'],
    ],
    more: 'Úplné příručky jsou zatím v angličtině; odkazy níže.',
    pages: [['Získání tokenu (anglicky)', '/guide/token.md'], ['Průvodce nasazením (anglicky)', '/guide/deploy.md']],
  },
}

for (const [dir, doc] of Object.entries(langs)) {
  const guideDir = path.join(root, 'docs', dir, 'guide')
  mkdirSync(guideDir, { recursive: true })
  const lines = [`# ${doc.title}`, '', doc.intro, '']
  doc.steps.forEach(([heading, body], index) => {
    lines.push(`${index + 1}. **${heading}** — ${body}`)
  })
  lines.push('', doc.more)
  if (dir === '') {
    lines.push('', '## Guides', '')
    for (const [label, link] of doc.pages) lines.push(`- [${label}](${link})`)
  } else {
    lines.push('')
    for (const [label, link] of doc.pages) lines.push(`- [${label}](${link})`)
  }
  lines.push('', `---

*Other languages:* ${Object.keys(langs)
    .filter((other) => other !== dir)
    .map((other) => `[${other || 'en'}](/${other ? other + '/' : ''}guide/index.md)`)
    .join(' · ')}`)
  writeFileSync(path.join(guideDir, 'index.md'), lines.join('\n') + '\n')
}

console.log('generated', Object.keys(langs).length, 'guide index pages')
