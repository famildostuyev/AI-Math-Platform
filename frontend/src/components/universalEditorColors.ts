export type EditorColor = { name: string; value: string }

// MathLive accepts named colors; canonical text marks use controlled hex values.
export const TEXT_COLOR_HEX: Record<string, string> = {
  black: '#000000', gray: '#808080', navy: '#000080', teal: '#008080',
  green: '#008000', purple: '#800080', red: '#ff0000', orange: '#ffa500',
  maroon: '#800000', yellow: '#ffff00', cyan: '#00ffff', blue: '#0000ff',
}

export const THEME_COLORS: readonly EditorColor[] = [
  { name: 'Qara', value: 'black' }, { name: 'Boz', value: 'gray' },
  { name: 'Tünd göy', value: 'navy' }, { name: 'Firuzəyi', value: 'teal' },
  { name: 'Yaşıl', value: 'green' }, { name: 'Bənövşəyi', value: 'purple' },
  { name: 'Qırmızı', value: 'red' }, { name: 'Narıncı', value: 'orange' },
]

export const STANDARD_COLORS: readonly EditorColor[] = [
  { name: 'Tünd qırmızı', value: 'maroon' }, { name: 'Qırmızı', value: 'red' },
  { name: 'Narıncı', value: 'orange' }, { name: 'Sarı', value: 'yellow' },
  { name: 'Yaşıl', value: 'green' }, { name: 'Mavi-yaşıl', value: 'cyan' },
  { name: 'Mavi', value: 'blue' }, { name: 'Bənövşəyi', value: 'purple' },
]
