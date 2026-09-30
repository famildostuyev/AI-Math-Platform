import type { MathfieldElement } from 'mathlive'

type MenuItem = MathfieldElement['menuItems'][number]
type MenuItemCommand = Extract<MenuItem, { onMenuSelect?: unknown }>

// Audited against MathLive 0.110.0 default-menu.ts (shipped in mathlive.mjs).
// Keep native callbacks and predicates; never render their HTML labels.
const DESTINATIONS: Record<string, [string, string, string?]> = {
  'add-row-above': ['Matris', 'Yuxarıya sətir əlavə et'],
  'add-row-below': ['Matris', 'Aşağıya sətir əlavə et'],
  'add-column-before': ['Matris', 'Sola sütun əlavə et'],
  'add-column-after': ['Matris', 'Sağa sütun əlavə et'],
  'delete-row': ['Matris', 'Sətiri sil'],
  'delete-column': ['Matris', 'Sütunu sil'],
  'environment-no-border': ['Matris', 'Mötərizəsiz', 'Matris mötərizəsi'],
  'environment-parentheses': ['Matris', 'Dairəvi', 'Matris mötərizəsi'],
  'environment-brackets': ['Matris', 'Kvadrat', 'Matris mötərizəsi'],
  'environment-bar': ['Matris', 'Şaquli xətlər', 'Matris mötərizəsi'],
  'environment-braces': ['Matris', 'Fiqurlu', 'Matris mötərizəsi'],
  'insert-abs': ['Mötərizə', 'Modul / mütləq qiymət'],
  'insert-modulus': ['Mötərizə', 'Kompleks ədədin modulu'],
  'insert-nth-root': ['Kök', 'n-ci dərəcədən kök şablonu'],
  'insert-log-base': ['Funksiya', 'Əsaslı loqarifm'],
  'insert-derivative': ['Funksiya', 'Törəmə'],
  'insert-nth-derivative': ['Funksiya', 'n-ci tərtib törəmə'],
  'insert-argument': ['Funksiya', 'Arqument'],
  'insert-real-part': ['Funksiya', 'Həqiqi hissə'],
  'insert-imaginary-part': ['Funksiya', 'Xəyali hissə'],
  'insert-conjugate': ['Funksiya', 'Qoşma kompleks ədəd'],
  'insert-integral': ['İnteqral', 'Sərhədli inteqral şablonu'],
  'insert-sum': ['Cəm/hasil', 'Cəm şablonu'],
  'insert-product': ['Cəm/hasil', 'Hasil şablonu'],
  'ce-evaluate': ['Funksiya', 'Hesabla'],
  'ce-simplify': ['Funksiya', 'Sadələşdir'],
  'ce-solve': ['Funksiya', 'Tənliyi həll et'],
  'mode-math': ['Daha çox', 'Riyazi giriş', 'Giriş rejimi'],
  'mode-text': ['Daha çox', 'Mətn girişi', 'Giriş rejimi'],
  'mode-latex': ['Daha çox', 'LaTeX ilə giriş', 'Giriş rejimi'],
  'cut': ['Daha çox', 'Kəs'],
  'paste': ['Daha çox', 'Yapışdır'],
  'select-all': ['Daha çox', 'Formulun hamısını seç'],
  'copy-latex': ['Daha çox', 'LaTeX kimi köçür', 'Köçür'],
  'copy-ascii-math': ['Daha çox', 'ASCII riyazi mətn kimi köçür', 'Köçür'],
  'copy-math-ml': ['Daha çox', 'MathML kimi köçür', 'Köçür'],
  'variant-double-struck': ['Daha çox', 'İkiqat xəttli', 'Formula üslubu'],
  'variant-fraktur': ['Daha çox', 'Qotik', 'Formula üslubu'],
  'variant-calligraphic': ['Daha çox', 'Xəttatlıq', 'Formula üslubu'],
  'variant-style-up': ['Daha çox', 'Dik', 'Formula üslubu'],
  'variant-style-bold': ['Daha çox', 'Qalın', 'Formula üslubu'],
  'variant-style-italic': ['Daha çox', 'Kursiv', 'Formula üslubu'],
  'accent-vec': ['Simvollar', 'Vektor işarəsi', 'Üst və alt işarələr'],
  'accent-overrightarrow': ['Simvollar', 'Sağa ox', 'Üst və alt işarələr'],
  'accent-overleftarrow': ['Simvollar', 'Sola ox', 'Üst və alt işarələr'],
  'accent-dot': ['Simvollar', 'Bir nöqtə', 'Üst və alt işarələr'],
  'accent-ddot': ['Simvollar', 'İki nöqtə', 'Üst və alt işarələr'],
  'accent-bar': ['Simvollar', 'Qısa üst xətt', 'Üst və alt işarələr'],
  'accent-overline': ['Simvollar', 'Üst xətt', 'Üst və alt işarələr'],
  'accent-overgroup': ['Simvollar', 'Üst qövs', 'Üst və alt işarələr'],
  'accent-overbrace': ['Simvollar', 'Üst fiqurlu mötərizə', 'Üst və alt işarələr'],
  'accent-underline': ['Simvollar', 'Alt xətt', 'Üst və alt işarələr'],
  'accent-undergroup': ['Simvollar', 'Alt qövs', 'Üst və alt işarələr'],
  'accent-underbrace': ['Simvollar', 'Alt fiqurlu mötərizə', 'Üst və alt işarələr'],
  'decoration-boxed': ['Simvollar', 'Çərçivə', 'Çərçivələr'],
  'decoration-red-box': ['Simvollar', 'Qırmızı çərçivə', 'Çərçivələr'],
  'decoration-dashed-black-box': ['Simvollar', 'Qırıq xətli qara çərçivə', 'Çərçivələr'],
}
const COLORS: Record<string, string> = {
  red: 'Qırmızı', orange: 'Narıncı', yellow: 'Sarı', lime: 'Açıq yaşıl',
  green: 'Yaşıl', teal: 'Firuzəyi', cyan: 'Mavi-yaşıl', blue: 'Mavi',
  indigo: 'İndiqo', purple: 'Bənövşəyi', magenta: 'Al-qırmızı', black: 'Qara',
  'dark-grey': 'Tünd boz', grey: 'Boz', 'light-grey': 'Açıq boz', white: 'Ağ',
}
const modifiers = { alt: false, control: false, shift: false, meta: false }
type Predicate = boolean | ((keys: typeof modifiers) => boolean)
const allowed = (value?: Predicate) => typeof value === 'function' ? value(modifiers) : value !== false

export type MathRibbonAction = {
  key: string
  id: string
  group: string
  label: string
  section?: string
  enabled: boolean
  checked?: boolean | 'mixed'
  run: (active: MathfieldElement | null) => boolean
}

// Stable presentation uses the existing catalog; execution still requires a live native action.
export function getMoreMathRibbonActions(actions: readonly MathRibbonAction[]): MathRibbonAction[] {
  return Object.entries(DESTINATIONS)
    .filter(([, [, , section]]) => section === 'Üst və alt işarələr' || section === 'Çərçivələr')
    .map(([id, [, label, section]]) => actions.find((action) => action.id === id) ?? {
      key: id, id, group: 'Daha çox', label, section, enabled: false, run: () => false,
    })
}

export function getMathRibbonActions(field: MathfieldElement | null): MathRibbonAction[] {
  if (!field?.isConnected || field.disabled || field.readOnly) return []
  const result: MathRibbonAction[] = []
  const walk = (items: readonly MenuItem[], ancestors: MenuItem[] = [], path = '') => {
    items.forEach((item, index) => {
      if (item.type === 'divider' || item.type === 'heading') return
      const chain = [...ancestors, item]
      if (!chain.every((entry) => allowed((entry as MenuItemCommand).visible))) return
      const key = `${path}/${index}`
      if ('submenu' in item) { walk(item.submenu, chain, key); return }
      const id = item.id ?? ''
      let destination = DESTINATIONS[id]
      if (id.startsWith('insert-matrix-')) destination = ['Matris', id.slice(14).replace('x', ' × '), 'Yeni matris']
      if (id.startsWith('variant-') && destination) destination = ['Mətn formatı', destination[1], 'Formula üslubu']
      for (const prefix of ['color-', 'background-color-']) {
        if (id.startsWith(prefix) && COLORS[id.slice(prefix.length)]) {
          destination = ['Mətn formatı', COLORS[id.slice(prefix.length)], prefix === 'color-' ? 'Formula rəngi' : 'Formula fonu']
        }
      }
      // Native accent and decoration actions remain available without crowding the fast symbol grid.
      if (destination?.[0] === 'Simvollar') destination = ['Daha çox', destination[1], destination[2]]
      // 0.110.0 uses copy-latex twice: submenu position 1 is Typst.
      if (id === 'copy-latex' && index === 1) destination = ['Daha çox', 'Typst kimi köçür', 'Köçür']
      if (!destination || !item.onMenuSelect) return
      const enabled = () => chain.every((entry) => allowed((entry as MenuItemCommand).enabled) && allowed((entry as MenuItemCommand).visible))
      result.push({ key, id, group: destination[0], label: destination[1], section: destination[2],
        enabled: enabled(), checked: typeof item.checked === 'function' ? item.checked(modifiers) : item.checked,
        run: (active) => {
          if (active !== field || !field.isConnected || field.disabled || field.readOnly || !enabled()) return false
          field.focus()
          item.onMenuSelect?.({ target: field, modifiers, id: item.id, data: item.data })
          // Includes native style/environment callbacks which do not all emit input.
          field.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        },
      })
    })
  }
  walk(field.menuItems)
  return result
}
