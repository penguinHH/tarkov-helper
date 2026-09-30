// 轻量多语言：界面文字按 key 取对应语言，缺失时回退中文，再回退 key 本身。
// 游戏数据（物品、任务、地图标记）的语言由 tarkov.dev 的翻译文件提供，见 api/tarkov.js 的 lang 参数。
import { reactive } from 'vue'
import zh from './zh'
import en from './en'
import ja from './ja'

export const LOCALES = [
  { id: 'zh', label: '中文', tag: 'zh-CN' },
  { id: 'en', label: 'English', tag: 'en-US' },
  { id: 'ja', label: '日本語', tag: 'ja-JP' }
]
const messages = { zh, en, ja }

function detect() {
  try {
    const saved = localStorage.getItem('locale')
    if (messages[saved]) return saved
  } catch {
    // 忽略
  }
  const nav = (navigator.language || 'en').toLowerCase()
  if (nav.startsWith('zh')) return 'zh'
  if (nav.startsWith('ja')) return 'ja'
  return 'en'
}

export const i18n = reactive({ locale: detect() })

function applyDocument() {
  document.documentElement.lang = LOCALES.find((l) => l.id === i18n.locale)?.tag ?? 'en'
}
applyDocument()

export function setLocale(id) {
  if (!messages[id]) return
  i18n.locale = id
  applyDocument()
  try {
    localStorage.setItem('locale', id)
  } catch {
    // 忽略
  }
}

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict)

// t('prices.count', { n: 3 }) → 模板里的 {n} 被替换
export function t(key, params) {
  let s = lookup(messages[i18n.locale], key) ?? lookup(messages.zh, key) ?? key
  if (typeof s !== 'string') return key
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`))
  return s
}

// 当前语言有翻译就用翻译，没有就用给定的原文（例如 Wiki 的英文章节标题），不回退到中文
export function tOr(key, fallback) {
  const s = lookup(messages[i18n.locale], key)
  return typeof s === 'string' ? s : fallback
}

// 数据请求用的语言（tarkov.dev 支持 zh / en / ja）
export const dataLang = () => i18n.locale

// 按当前语言格式化
export const localeTag = () => LOCALES.find((l) => l.id === i18n.locale)?.tag ?? 'en-US'
export const fmtNum = (n) => Number(n).toLocaleString(localeTag())
export const fmtDate = (t) => new Date(t).toLocaleDateString(localeTag())
export const fmtDateTime = (t) => new Date(t).toLocaleString(localeTag())
export const fmtTime = (t) => new Date(t).toLocaleTimeString(localeTag())
