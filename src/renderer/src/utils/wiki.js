// 从 Fandom Wiki 的页面 HTML 中提取任务相关的章节，并按白名单重建为安全的 HTML。
// 不直接插入原始 HTML：只保留少量排版标签，链接改为外部打开，图片只允许 Wiki 的图片域名。

const WIKI_ORIGIN = 'https://escapefromtarkov.fandom.com'
const IMG_ORIGIN = 'https://static.wikia.nocookie.net/'

const ALLOWED = new Set([
  'P', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'BR', 'H3', 'H4', 'H5', 'IMG', 'A',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'DL', 'DT', 'DD', 'SUP', 'SMALL', 'CODE'
])
// 这些元素连同内容一起丢弃
const DROP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'VIDEO', 'AUDIO'])
const DROP_CLASSES = ['navbox', 'mw-editsection', 'toc', 'reference', 'mw-empty-elt', 'noprint']


const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function imgSrc(el) {
  const src = el.getAttribute('data-src') || el.getAttribute('src') || ''
  return src.startsWith(IMG_ORIGIN) ? src : null
}

function linkHref(el) {
  const href = el.getAttribute('href') || ''
  if (href.startsWith('/wiki/')) return WIKI_ORIGIN + href
  if (href.startsWith(WIKI_ORIGIN) || href.startsWith(IMG_ORIGIN)) return href
  return null
}

function clean(node) {
  if (node.nodeType === Node.TEXT_NODE) return esc(node.textContent)
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const tag = node.tagName
  if (DROP.has(tag)) return ''
  if (DROP_CLASSES.some((c) => node.classList.contains(c))) return ''
  const inner = () => [...node.childNodes].map(clean).join('')
  if (!ALLOWED.has(tag)) return inner() // 不在白名单的标签去壳保留内容
  const t = tag.toLowerCase()
  if (t === 'img') {
    const src = imgSrc(node)
    if (!src) return ''
    const w = Math.min(Number(node.getAttribute('width')) || 320, 480)
    return `<img src="${esc(src)}" alt="${esc(node.getAttribute('alt') || '')}" width="${w}" loading="lazy" />`
  }
  if (t === 'a') {
    const href = linkHref(node)
    // 图片外面包着的链接直接去掉，只留图片
    if (!href || node.querySelector('img')) return inner()
    return `<a href="${esc(href)}" target="_blank" rel="noreferrer">${inner()}</a>`
  }
  if (t === 'br') return '<br />'
  if (t === 'td' || t === 'th') {
    const span = Number(node.getAttribute('colspan')) || 1
    return `<${t}${span > 1 ? ` colspan="${Math.min(span, 10)}"` : ''}>${inner()}</${t}>`
  }
  return `<${t}>${inner()}</${t}>`
}

// 返回 { image, intro, sections: [{ title, html }] }，章节标题的翻译见 i18n 的 wikiSections
export function extractWiki(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('.mw-parser-output') ?? doc.body
  const infobox = root.querySelector('.va-infobox')
  const image = infobox ? [...infobox.querySelectorAll('img')].map(imgSrc).find(Boolean) ?? null : null
  infobox?.remove()

  const sections = []
  let intro = ''
  let cur = null
  for (const el of [...root.children]) {
    if (el.tagName === 'H2') {
      const title = (el.querySelector('.mw-headline')?.textContent ?? el.textContent).replace(/\[\]$/, '').trim()
      cur = { title, html: '' }
      sections.push(cur)
      continue
    }
    // 页面末尾的任务导航表
    if (el.classList.contains('navbox') || el.querySelector?.('.navbox')) continue
    const h = clean(el)
    if (cur) cur.html += h
    else intro += h
  }
  return { image, intro, sections: sections.filter((s) => s.html.replace(/<[^>]+>/g, '').trim() || s.html.includes('<img')) }
}
