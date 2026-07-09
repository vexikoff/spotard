// ==== СПИСОК АДМИНИСТРАТОРОВ ====
export const ADMIN_EMAILS = [
  'admin-x5m@spotard.app',
  'vexikoff@gmail.com',
  'claus_maslov@gmail.com'
]

export const ADMIN_NAMES = [
  'Claus_Maslov',
]

// ==== СПИСОК МОДЕРАТОРОВ ====
export const MODERATOR_EMAILS = [
  'moder-x5m@spotard.app',
  'vova72181@gmail.com'
]

export const MODERATOR_NAMES = [
  'Covek'
]

export type UserRole = 'admin' | 'moderator' | 'user'

export function getUserRole(
  email: string | null | undefined,
  name?: string | null | undefined
): UserRole {
  const e = (email ?? '').toLowerCase()
  const n = (name ?? '').toLowerCase()

  if (ADMIN_EMAILS.includes(e) || ADMIN_NAMES.includes(name ?? '') || ADMIN_NAMES.includes(n)) {
    return 'admin'
  }

  if (MODERATOR_EMAILS.includes(e) || MODERATOR_NAMES.includes(name ?? '') || MODERATOR_NAMES.includes(n)) {
    return 'moderator'
  }

  return 'user'
}

export const SPOT_CATEGORIES = [
  { value: 'skate', label: 'Скейт' },
  { value: 'bike', label: 'Вело / BMX' },
  { value: 'universal', label: 'Универсал' },
] as const

export const SPOT_TYPES = [
  // Скейт / стрит
  { value: 'street', label: 'Стрит', short: 'ST', color: '#c8f542', category: 'skate' },
  { value: 'park', label: 'Скейтпарк', short: 'PK', color: '#42d7f5', category: 'universal' },
  { value: 'rail', label: 'Рейл', short: 'RL', color: '#f5a742', category: 'skate' },
  { value: 'stairs', label: 'Лестница', short: 'SR', color: '#f56042', category: 'skate' },
  { value: 'ledge', label: 'Грань / Ledge', short: 'LG', color: '#8af542', category: 'skate' },
  { value: 'gap', label: 'Пролёт / Gap', short: 'GP', color: '#f542a7', category: 'universal' },
  { value: 'bowl', label: 'Боул / Рампа', short: 'BW', color: '#42f5b3', category: 'universal' },
  { value: 'manual', label: 'Мануал пад', short: 'MP', color: '#d4f542', category: 'skate' },
  { value: 'flat', label: 'Флэт / Площадка', short: 'FL', color: '#9adbf5', category: 'universal' },
  { value: 'diy', label: 'DIY спот', short: 'DIY', color: '#e8e8e8', category: 'universal' },
  { value: 'hubba', label: 'Хабба', short: 'HB', color: '#f5e042', category: 'skate' },
  { value: 'plaza', label: 'Плаза', short: 'PZ', color: '#42f5e0', category: 'skate' },
  { value: 'polejam', label: 'Поул-джем', short: 'PJ', color: '#a7f542', category: 'skate' },
  // Вело / BMX
  { value: 'pumptrack', label: 'Памп-трек', short: 'PT', color: '#f5d742', category: 'bike' },
  { value: 'dirt', label: 'Дёрт / Трамплины', short: 'DT', color: '#c87f4a', category: 'bike' },
  { value: 'trials', label: 'Триал', short: 'TR', color: '#42f56b', category: 'bike' },
  { value: 'wallride', label: 'Воллрайд', short: 'WR', color: '#f58a42', category: 'bike' },
  { value: 'bmxtrack', label: 'BMX трасса', short: 'BX', color: '#f0b342', category: 'bike' },
  { value: 'drop', label: 'Дроп', short: 'DR', color: '#f56b8a', category: 'bike' },
  { value: 'downhill', label: 'Даунхилл / Спуск', short: 'DH', color: '#8a6bf5', category: 'bike' },
  { value: 'foampit', label: 'Поролоновая яма', short: 'FP', color: '#6bd4f5', category: 'bike' },
  // Универсальные
  { value: 'bank', label: 'Бэнк / Наклон', short: 'BK', color: '#7ff5d4', category: 'universal' },
  { value: 'curb', label: 'Поребрик / Curb', short: 'CB', color: '#b8f542', category: 'skate' },
  { value: 'quarterpipe', label: 'Квотерпайп', short: 'QP', color: '#42b3f5', category: 'universal' },
  { value: 'halfpipe', label: 'Халфпайп', short: 'HP', color: '#f542d4', category: 'universal' },
  { value: 'funbox', label: 'Фанбокс', short: 'FB', color: '#d442f5', category: 'universal' },
  { value: 'spine', label: 'Спайн', short: 'SN', color: '#f5426b', category: 'universal' },
  { value: 'snakerun', label: 'Снейк-ран', short: 'SK', color: '#6bf542', category: 'universal' },
  { value: 'indoor', label: 'Крытый парк', short: 'IN', color: '#f5f542', category: 'universal' },
] as const

export const SURFACES = [
  { value: 'concrete', label: 'Бетон' },
  { value: 'asphalt', label: 'Асфальт' },
  { value: 'wood', label: 'Дерево' },
  { value: 'metal', label: 'Металл' },
  { value: 'marble', label: 'Мрамор / плитка' },
  { value: 'brick', label: 'Кирпич' },
  { value: 'dirt', label: 'Грунт / земля' },
] as const

export const SECURITY_LEVELS = [
  { value: 'chill', label: 'Спокойно', color: '#c8f542' },
  { value: 'medium', label: 'Иногда гоняют', color: '#f5a742' },
  { value: 'strict', label: 'Строго', color: '#f56042' },
] as const

export const MAP_STYLES = [
  {
    value: 'dark',
    label: 'Тёмная',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
  },
  {
    value: 'light',
    label: 'Белая',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
  },
  {
    value: 'satellite',
    label: 'Спутник',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    subdomains: '',
  },
] as const

export type MapStyleValue = (typeof MAP_STYLES)[number]['value']

export function getMapStyle(value: string) {
  return MAP_STYLES.find((m) => m.value === value) ?? MAP_STYLES[0]
}

export function getSpotType(value: string) {
  const first = (value ?? '').split(',')[0].trim()
  return SPOT_TYPES.find((t) => t.value === first) ?? SPOT_TYPES[0]
}

export function getCategoryLabel(value: string) {
  return SPOT_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export function getSecurity(value: string) {
  return SECURITY_LEVELS.find((s) => s.value === value) ?? SECURITY_LEVELS[0]
}

export function getSurfaceLabel(value: string) {
  return SURFACES.find((s) => s.value === value)?.label ?? value
}
