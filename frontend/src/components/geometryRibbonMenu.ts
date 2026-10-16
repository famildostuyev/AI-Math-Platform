import type { GeometryTool } from './geometryAuthoringModel'
import type { GeometryTool3D } from './geometry3dAuthoring'
import type { SolidKind3D } from './geometry3dSolids'

export type GeometryRibbonAction = GeometryTool | 'delete'
export type GeometryRibbonAction3D = GeometryTool3D | SolidKind3D | 'delete'
export type GeometryRibbonItem = { label: string; label3D?:string; action?: GeometryRibbonAction; action3D?:GeometryRibbonAction3D; title?: string }
export type GeometryRibbonGroup = { label: string; items: GeometryRibbonItem[] }
export type GeometryRibbonControl = GeometryRibbonItem & { create?: boolean; groups?: GeometryRibbonGroup[] }
export const GEOMETRY_FUTURE_TITLE = 'Sonrakı mərhələdə aktivləşdiriləcək'
export const GEOMETRY_BASE_SIDES_TITLE = 'Oturacağın tərəflərinin sayı (n)'
const group = (label: string, labels: string[]): GeometryRibbonGroup => ({ label, items: labels.map(label => ({ label })) })

// Each dimension routes only explicitly supported commands; future entries are presentation only.
export const GEOMETRY_RIBBON: GeometryRibbonControl[] = [
  { label: 'Çərçivə əlavə et', create: true },
  { label: 'Seç', action: 'select',action3D:'select' },
  { label: 'Fiquru fırlat',action3D:'rotate_solid' },
  { label: 'Fiquru hərəkət etdir',action3D:'translate_solid' },
  { label: 'Nöqtə', action: 'point',action3D:'point' },
  { label: 'Xətt', groups: [{ label: 'Xətt', items: [
    { label: 'Düz xətt', action: 'line',action3D:'line' }, { label: 'İstiqamətlənmiş düz xətt',label3D:'Şüa', action: 'directed_line',action3D:'ray' }, { label: 'Parça', action: 'segment',action3D:'segment' }, { label: 'Vektor', action: 'vector',action3D:'vector' }, { label: 'Sınıq xətt', action: 'polyline',action3D:'polyline' },
  ] }] },
  { label: 'Müstəvi fiqurları', groups: [
    { label: 'Üçbucaqlar', items: [{ label: 'Üçbucaq', action: 'triangle',action3D:'triangle' }, { label: 'Düzbucaqlı üçbucaq', action: 'right_triangle' }] },
    { label: 'Dördbucaqlılar', items: [{ label: 'Düzbucaqlı', action: 'rectangle' }, { label: 'Kvadrat', action: 'square' }, { label: 'Paraleloqram', action: 'parallelogram' }, { label: 'Romb', action: 'rhombus' }, { label: 'Trapesiya', action: 'trapezoid' }] },
    { label: 'Çoxbucaqlılar', items: [{ label: 'Düzgün 5-bucaqlı', action: 'regular_pentagon' }, { label: 'Düzgün 6-bucaqlı', action: 'regular_hexagon' }, { label: 'Düzgün n-bucaqlı', action: 'regular_polygon' }] },
    { label: 'Sərbəst', items: [{ label: 'Sərbəst fiqur',label3D:'Poliqon', action: 'polygon',action3D:'polygon' }] },
  ] },
  { label: 'Çevrə', groups: [
    { label: 'Çevrə', items: [{ label: 'Çevrə', action: 'circle' }, ...group('', ['Mərkəz və radiusla', 'Mərkəz və çevrə üzərində nöqtə ilə', 'Diametrlə', '3 nöqtədən keçən']).items] },
    { label: 'Dairə', items: [{ label: 'Dairə', action: 'disk' }, ...group('', ['Mərkəz və radiusla', 'Mərkəz və sərhəd nöqtəsi ilə', 'Diametrlə']).items] },
    { label: 'Qövs', items: [{ label: 'Qövs', action: 'arc' }, ...group('', ['Mərkəz + başlanğıc + son nöqtə', '3 nöqtə ilə']).items] },
    { label: '', items: [{ label: 'Sektor', action: 'sector' }] }, group('Əyri', ['Sərbəst əyri']),
  ] },
  { label: 'Konstruksiya', groups: [{ label: 'Konstruksiya', items: [{ label: 'Orta nöqtə', action: 'midpoint' }, { label: 'Paralel', action: 'parallel' }, { label: 'Perpendikulyar', action: 'perpendicular' }, { label: 'Kəsişmə', action: 'intersection' }, { label: 'Tənbölən', action: 'angle_bisector' }, { label: 'Hündürlük', action: 'altitude' }, { label: 'Median', action: 'median' }] }] },
  { label: 'Ölçü', groups: [group('Ölçü', ['Uzunluq', 'Məsafə', 'Bucaq', 'Perimetr', 'Sahə'])] },
  { label: '3D', groups: ([
    {label:'Müstəvi və bucaqlar',items:[{label:'Müstəvi',action3D:'plane'},{label:'Kamera',action3D:'camera'},{label:'İkiüzlü bucaq'}]},
    {label:'Prizmalar',items:[{label:'Kub',action3D:'cube'},{label:'Düzbucaqlı paralelepiped',action3D:'cuboid'},{label:'Prizma',action3D:'prism'},{label:'Düzgün n-bucaqlı prizma'}]},
    {label:'Piramidalar',items:[{label:'Piramida',action3D:'pyramid'},{label:'Düzgün n-bucaqlı piramida'},{label:'Düzgün n-bucaqlı kəsik piramida'}]},
    group('Fırlanma cisimləri', ['Silindr', 'Konus', 'Kəsik konus', 'Sfera', 'Kürə']),
    group('Digər', ['Sərbəst çoxüzlü']),
  ] satisfies GeometryRibbonGroup[]).map(section => ({ ...section, items: section.items.map(item => item.label.includes('n-bucaqlı') ? { ...item, title: GEOMETRY_BASE_SIDES_TITLE } : item) })) },
  { label: 'Mətn', action: 'text' },
  { label: 'Düstur' },
  { label: 'Qələm', groups: [group('Qələm', ['Qələm', 'Marker', 'Pozan'])] },
  { label: 'Daha çox', groups: [
    group('İşarələmələr', ['Düz bucaq işarəsi', 'Bərabər parça işarəsi', 'Bərabər bucaq işarəsi', 'Paralellik işarəsi', 'Perpendikulyarlıq işarəsi']),
    group('Etiket', ['Etiket əlavə et', 'Etiketi redaktə et', 'Etiketi sil']),
    group('Görünüş', ['Grid', 'Snap', 'Koordinat oxları', 'Guides']),
    { label: 'Redaktə', items: [{ label: 'Seçiləni sil', action: 'delete',action3D:'delete' }] },
  ] },
]

type RibbonCommands<A extends string>={id:string;tool:string;disabled:boolean;canDelete:boolean;run:(action:A)=>void}
export function geometryRibbonTarget(active:{kind:string;id?:string}|null|undefined,two:RibbonCommands<GeometryRibbonAction>|null|undefined,three:RibbonCommands<GeometryRibbonAction3D>|null|undefined){
  if(active?.kind!=='geometry')return null
  const v1=two?.id===active.id?two:null,v2=three?.id===active.id?three:null
  if(!!v1===!!v2)return null // Missing or ambiguous registration must never choose a frame implicitly.
  return v1?{dimension:2 as const,commands:v1}:{dimension:3 as const,commands:v2!}
}
export function geometryRibbonActionState(item:GeometryRibbonItem,target:ReturnType<typeof geometryRibbonTarget>,disabled=false){
  const action=target?.dimension===3?item.action3D:target?.dimension===2?item.action:undefined
  return {action,label:target?.dimension===3?(item.label3D??item.label):item.label,
    disabled:disabled||!target||target.commands.disabled||!action||action==='delete'&&!target.commands.canDelete,
    pressed:!!action&&action!=='delete'&&target?.commands.tool===action,
    title:!item.action&&!item.action3D?[item.title,GEOMETRY_FUTURE_TITLE].filter(Boolean).join(' — '):!target?'Əvvəlcə uyğun 2D və ya 3D çərçivəni redaktə edin.':!action?`Bu alət ${target.dimension}D çərçivədə hələ dəstəklənmir.`:undefined}
}
export function runGeometryRibbonAction(item:GeometryRibbonItem,target:ReturnType<typeof geometryRibbonTarget>,disabled=false){
  if(geometryRibbonActionState(item,target,disabled).disabled||!target)return false
  if(target.dimension===2)target.commands.run(item.action!)
  else target.commands.run(item.action3D!)
  return true
}
