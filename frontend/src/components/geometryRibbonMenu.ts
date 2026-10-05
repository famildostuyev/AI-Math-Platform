import type { GeometryTool } from './geometryAuthoringModel'

export type GeometryRibbonAction = GeometryTool | 'delete'
export type GeometryRibbonItem = { label: string; action?: GeometryRibbonAction; title?: string }
export type GeometryRibbonGroup = { label: string; items: GeometryRibbonItem[] }
export type GeometryRibbonControl = GeometryRibbonItem & { create?: boolean; groups?: GeometryRibbonGroup[] }
export const GEOMETRY_FUTURE_TITLE = 'Sonrakı mərhələdə aktivləşdiriləcək'
export const GEOMETRY_BASE_SIDES_TITLE = 'Oturacağın tərəflərinin sayı (n)'
const group = (label: string, labels: string[]): GeometryRibbonGroup => ({ label, items: labels.map(label => ({ label })) })

// Only existing V1 authoring commands carry actions; future entries are presentation only.
export const GEOMETRY_RIBBON: GeometryRibbonControl[] = [
  { label: 'Çərçivə əlavə et', create: true },
  { label: 'Seç', action: 'select' },
  { label: 'Nöqtə', action: 'point' },
  { label: 'Xətt', groups: [{ label: 'Xətt', items: [
    { label: 'Düz xətt', action: 'line' }, { label: 'İstiqamətlənmiş düz xətt', action: 'directed_line' }, { label: 'Parça', action: 'segment' }, { label: 'Vektor', action: 'vector' }, { label: 'Sınıq xətt', action: 'polyline' },
  ] }] },
  { label: '2D fiqurlar', groups: [
    { label: 'Üçbucaqlar', items: [{ label: 'Üçbucaq', action: 'triangle' }, { label: 'Düzbucaqlı üçbucaq', action: 'right_triangle' }] },
    { label: 'Dördbucaqlılar', items: [{ label: 'Düzbucaqlı', action: 'rectangle' }, { label: 'Kvadrat', action: 'square' }, { label: 'Paraleloqram', action: 'parallelogram' }, { label: 'Romb', action: 'rhombus' }, { label: 'Trapesiya', action: 'trapezoid' }] },
    { label: 'Çoxbucaqlılar', items: [{ label: 'Düzgün 5-bucaqlı', action: 'regular_pentagon' }, { label: 'Düzgün 6-bucaqlı', action: 'regular_hexagon' }, { label: 'Düzgün n-bucaqlı', action: 'regular_polygon' }] },
    { label: 'Sərbəst', items: [{ label: 'Sərbəst fiqur', action: 'polygon' }] },
  ] },
  { label: 'Çevrə', groups: [
    { label: 'Çevrə', items: [{ label: 'Çevrə', action: 'circle' }, ...group('', ['Mərkəz və radiusla', 'Mərkəz və çevrə üzərində nöqtə ilə', 'Diametrlə', '3 nöqtədən keçən']).items] },
    { label: 'Dairə', items: [{ label: 'Dairə', action: 'disk' }, ...group('', ['Mərkəz və radiusla', 'Mərkəz və sərhəd nöqtəsi ilə', 'Diametrlə']).items] },
    { label: 'Qövs', items: [{ label: 'Qövs', action: 'arc' }, ...group('', ['Mərkəz + başlanğıc + son nöqtə', '3 nöqtə ilə']).items] },
    { label: '', items: [{ label: 'Sektor', action: 'sector' }] }, group('Əyri', ['Sərbəst əyri']),
  ] },
  { label: 'Konstruksiya', groups: [{ label: 'Konstruksiya', items: [{ label: 'Orta nöqtə', action: 'midpoint' }, { label: 'Paralel', action: 'parallel' }, { label: 'Perpendikulyar', action: 'perpendicular' }, { label: 'Kəsişmə', action: 'intersection' }, { label: 'Tənbölən', action: 'angle_bisector' }, { label: 'Hündürlük', action: 'altitude' }] }] },
  { label: 'Ölçü', groups: [group('Ölçü', ['Uzunluq', 'Məsafə', 'Bucaq', 'Perimetr', 'Sahə'])] },
  { label: '3D', groups: [
    group('Müstəvi və bucaqlar', ['Müstəvi', 'İkiüzlü bucaq']),
    group('Prizmalar', ['Kub', 'Paralelepiped', 'Prizma', 'Düzgün n-bucaqlı prizma']),
    group('Piramidalar', ['Piramida', 'Düzgün n-bucaqlı piramida', 'Düzgün n-bucaqlı kəsik piramida']),
    group('Fırlanma cisimləri', ['Silindr', 'Konus', 'Kəsik konus', 'Sfera', 'Kürə']),
    group('Digər', ['Sərbəst çoxüzlü']),
  ].map(section => ({ ...section, items: section.items.map(item => item.label.includes('n-bucaqlı') ? { ...item, title: GEOMETRY_BASE_SIDES_TITLE } : item) })) },
  { label: 'Mətn', action: 'text' },
  { label: 'Düstur' },
  { label: 'Qələm', groups: [group('Qələm', ['Qələm', 'Marker', 'Pozan'])] },
  { label: 'Daha çox', groups: [
    group('İşarələmələr', ['Düz bucaq işarəsi', 'Bərabər parça işarəsi', 'Bərabər bucaq işarəsi', 'Paralellik işarəsi', 'Perpendikulyarlıq işarəsi']),
    group('Etiket', ['Etiket əlavə et', 'Etiketi redaktə et', 'Etiketi sil']),
    group('Görünüş', ['Grid', 'Snap', 'Koordinat oxları', 'Guides']),
    { label: 'Redaktə', items: [{ label: 'Seçiləni sil', action: 'delete' }] },
  ] },
]
