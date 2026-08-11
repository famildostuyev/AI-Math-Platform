import { useLayoutEffect, useRef, useState } from 'react'
import './App.css'
import LoginScreen from './components/LoginScreen'
import { getCurrentUser } from './api/auth'
import type { CurrentUserResponse, TokenResponse } from './api/auth'

import {
  Archive,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  BookOpenCheck,
  Bookmark,
  Check,
  CircleCheckBig,
  Clock3,
  ClipboardList,
  CreditCard,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  GraduationCap,
  Hourglass,
  Info,
  Plus,
  Search,
  Trash2,
  Link2,
  PencilLine,
  Puzzle,
  HelpCircle,
  Home,
  Landmark,
  Moon,
  Send,
  Settings,
  Sparkles,
  Target,
  TimerReset,
  Trophy,
  Users,
  ArrowLeft,
  Flag,
  Shuffle,
  Lock,
  ShieldCheck,
  Activity,
  PlayCircle,
  XCircle,
  FileText,
  X,
  Timer,
  BookOpen,
} from 'lucide-react'

type Screen = 'dashboard' | 'test-builder' | 'online-tests' | 'online-test-details' | 'active-test-details'
type BuilderStep = 'purpose' | 'class' | 'section' | 'topics' | 'parameters' | 'review'
type PreparationStage = 'review' | 'use-mode' | 'online-students' | 'online-time' | 'online-presentation' | 'online-activation' | 'preview' | 'design' | 'final' | 'export'

const quickActions = [
  { title: 'Test tərtib et', description: 'Mövzu, sinif və təyinat seçin, testinizi tərtib edin.', icon: FilePlus2, tone: 'violet' },
  { title: 'Yarış təşkil et', description: 'Yarış təşkil edib iştirakçıları dəvət edin.', icon: Trophy, tone: 'green' },
  { title: 'Qruplarım', description: 'Şagird və müəllim qruplarınızı idarə edin.', icon: Users, tone: 'blue' },
  { title: 'MİQ hazırlığım', description: 'MİQ sınaqları, testlər və təhlillər.', icon: Target, tone: 'orange' },
  { title: 'Sertifikasiya hazırlığım', description: 'Sertifikasiya üzrə sınaqlar və testlər.', icon: BadgeCheck, tone: 'pink' },
  { title: 'Nəticələr və statistika', description: 'Nəticələri təhlil edin, irəliləyişinizi izləyin.', icon: BarChart3, tone: 'cyan' },
]

const navItems = [
  { label: 'Əsas səhifə', icon: Home },
  { label: 'AI köməkçi', icon: Sparkles },
  { label: 'Arxivim', icon: Archive },
  { label: 'Qruplarım', icon: Users },
  { label: 'Onlayn testlərim', icon: ClipboardList },
  { label: 'MİQ hazırlığım', icon: Target },
  { label: 'Sertifikasiya hazırlığım', icon: BadgeCheck },
  { label: 'Nəticələr və statistika', icon: BarChart3 },
]

const suggestions = [
  '9-cu sinif üçün 15 suallıq buraxılış sınağı hazırla',
  'KSQ imtahanı üçün test tərtib et',
  'Yarış təşkil edib iştirakçıları dəvət et',
  'Qarışıq mövzulardan çətinlik dərəcəsinə görə test hazırla',
]

const purposes = [
  { id: 'ksq', title: 'KSQ', description: 'Kiçik summativ qiymətləndirmə üçün test tərtib edin.', icon: BookOpenCheck, tone: 'violet', enabled: true },
  { id: 'bsq', title: 'BSQ', description: 'Böyük summativ qiymətləndirmə üçün test tərtib edin.', icon: GraduationCap, tone: 'blue', enabled: false },
  { id: 'diagnostic', title: 'Diaqnostik qiymətləndirmə', description: 'Diaqnostik qiymətləndirmə üçün test tərtib edin.', icon: BarChart3, tone: 'cyan', enabled: false },
  { id: 'dim', title: 'DİM', description: 'Buraxılış və blok imtahanları üçün test tərtib edin.', icon: Landmark, tone: 'green', enabled: false },
  { id: 'lyceum', title: 'Liseylərə qəbul', description: 'Lisey qəbul imtahanları üçün test tərtib edin.', icon: GraduationCap, tone: 'orange', enabled: false },
  { id: 'olympiad', title: 'Olimpiadalar', description: 'RFM və RFO istiqamətləri üzrə testlər hazırlayın.', icon: Trophy, tone: 'pink', enabled: false },
  { id: 'miq', title: 'MİQ', description: 'MİQ hazırlığı üçün sınaq və testlər tərtib edin.', icon: Target, tone: 'cyan', enabled: false },
  { id: 'certification', title: 'Sertifikasiya', description: 'Sertifikasiya hazırlığı üçün testlər tərtib edin.', icon: BadgeCheck, tone: 'violet', enabled: false },
  { id: 'other', title: 'Digər', description: 'İstədiyiniz qaydada sərbəst test tərtib edin.', icon: FilePlus2, tone: 'orange', enabled: false },
]

const classes = [5, 6, 7, 8, 9, 10, 11]
const temporarySections = ['Bölmə 1', 'Bölmə 2', 'Bölmə 3', 'Bölmə 4', 'Bölmə 5']
const temporaryTopics = ['Mövzu 1', 'Mövzu 2', 'Mövzu 3', 'Mövzu 4', 'Mövzu 5', 'Mövzu 6']
const questionTypes = [
  'Qapalı',
  'Açıq',
  'Uyğunluğu müəyyən et',
  'Ətraflı yazı tələb edən',
  'Situasiya',
  'İsbat tələb edən',
]

const questionTypeUi = {
  Qapalı: {
    icon: CircleCheckBig,
    tone: 'violet',
    shortHint: '4 seçimli',
  },
  Açıq: {
    icon: PencilLine,
    tone: 'blue',
    shortHint: 'Qısa cavab',
  },
  'Uyğunluğu müəyyən et': {
    icon: Link2,
    tone: 'teal',
    shortHint: '',
  },
  'Ətraflı yazı tələb edən': {
    icon: BookOpenCheck,
    tone: 'green',
    shortHint: '',
  },
  Situasiya: {
    icon: Puzzle,
    tone: 'orange',
    shortHint: '',
  },
  'İsbat tələb edən': {
    icon: Bookmark,
    tone: 'pink',
    shortHint: '',
  },
} as const
const builderSteps = ['Təyinat', 'Sinif', 'Bölmə', 'Mövzu(lar)', 'Parametrlər', 'Yoxlama']

const KSQ_MAX_QUESTIONS = 25

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isoDateToDisplay(dateValue: string) {
  if (!dateValue) return ''
  const [year, month, day] = dateValue.split('-')
  if (!year || !month || !day) return ''
  return `${day}/${month}/${year}`
}

function displayDateToIso(dateValue: string) {
  const match = dateValue.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null

  const [, day, month, year] = match
  const parsed = new Date(Number(year), Number(month) - 1, Number(day))

  const isValid =
    parsed.getFullYear() === Number(year) &&
    parsed.getMonth() === Number(month) - 1 &&
    parsed.getDate() === Number(day)

  return isValid ? `${year}-${month}-${day}` : null
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)

  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function addMinutesToTime(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(':').map(Number)
  const total = hours * 60 + minutes + minutesToAdd
  const normalized = ((total % 1440) + 1440) % 1440
  const resultHours = Math.floor(normalized / 60)
  const resultMinutes = normalized % 60
  return `${String(resultHours).padStart(2, '0')}:${String(resultMinutes).padStart(2, '0')}`
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const PAYMENT_CONFIG = {
  // Real qiymət müəyyən ediləndə yalnız bu sahəni dəyişmək kifayətdir.
  pricePerVariantAZN: null as number | null,
}


type OnlineStudent = {
  id: number
  name: string
  className: string
}

type OnlineGroup = {
  id: string
  name: string
  studentIds: number[]
}

const onlineStudents: OnlineStudent[] = [
  { id: 1, name: 'Əliyev Tural', className: '8A' },
  { id: 2, name: 'Cəfərova Ləman', className: '8A' },
  { id: 3, name: 'Həsənov Rüfət', className: '8A' },
  { id: 4, name: 'Məmmədova Aylin', className: '8A' },
  { id: 5, name: 'Quliyev Murad', className: '8A' },
  { id: 6, name: 'İsmayılova Nigar', className: '8A' },
  { id: 7, name: 'Rzayev Kənan', className: '8A' },
  { id: 8, name: 'Hüseynova Zəhra', className: '8A' },
  { id: 9, name: 'Süleymanlı Orxan', className: '8A' },
  { id: 10, name: 'Abbasova Dəniz', className: '8A' },
  { id: 11, name: 'Mürsəlov Emil', className: '8A' },
  { id: 12, name: 'Əsgərova Aysu', className: '8A' },
  { id: 13, name: 'Vəliyev Nicat', className: '8A' },
  { id: 14, name: 'Səmədova Leyla', className: '8A' },
  { id: 15, name: 'Nəcəfli Əli', className: '8A' },
  { id: 16, name: 'Kərimova Fidan', className: '8A' },
  { id: 17, name: 'Mehdiyev Elvin', className: '8A' },
  { id: 18, name: 'Ağayeva Nuray', className: '8A' },
  { id: 19, name: 'Babayev Ömər', className: '8A' },
  { id: 20, name: 'Sultanova İnci', className: '8A' },
  { id: 21, name: 'Qasımov Amin', className: '8A' },
  { id: 22, name: 'Ələkbərova Səbinə', className: '8A' },
  { id: 23, name: 'Mustafayev Raul', className: '8A' },
  { id: 24, name: 'Hacıyeva Mələk', className: '8A' },
  { id: 25, name: 'Əhmədov Nihad', className: '8B' },
  { id: 26, name: 'Qurbanlı Ayan', className: '8B' },
  { id: 27, name: 'Səfərov Tunar', className: '8B' },
  { id: 28, name: 'Məlikova Aydan', className: '8B' },
  { id: 29, name: 'Nərmin Əliyeva', className: '9C' },
  { id: 30, name: 'Tural Məmmədov', className: '7B' },
  { id: 31, name: 'Sevinc Quliyeva', className: '9A' },
  { id: 32, name: 'Anar Rzayev', className: '10A' },
  { id: 33, name: 'Aysel Əliyeva', className: '9B' },
  { id: 34, name: 'Murad Hüseynov', className: '11A' },
]

const onlineGroups: OnlineGroup[] = [
  {
    id: '8a',
    name: '8A sinfi',
    studentIds: Array.from({ length: 24 }, (_, index) => index + 1),
  },
  {
    id: 'math-group',
    name: 'Riyaziyyat qrupu',
    studentIds: [1, 2, 3, 7, 9, 12, 15, 18, 21, 24, 25, 26, 27, 28, 31, 33],
  },
  {
    id: '9b',
    name: '9B sinfi',
    studentIds: [25, 26, 27, 28, 29, 31, 33],
  },
  {
    id: 'admission-math',
    name: 'Abituriyentlərin riyaziyyat qrupu',
    studentIds: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
  },
]

function Sidebar({
  screen,
  onHome,
  onOpenOnlineTests,
  firstName,
  lastName,
  roleDisplayName,
}: {
  screen: Screen
  onHome: () => void
  onOpenOnlineTests: () => void
  firstName: string
  lastName: string
  roleDisplayName: string
}) {
  const normalizedFirstName = firstName.trim()
  const normalizedLastName = lastName.trim()
  const displayName = [
    normalizedFirstName,
    normalizedLastName ? `${normalizedLastName.charAt(0)}.` : '',
  ].filter(Boolean).join(' ')
  const avatarInitials = [normalizedFirstName, normalizedLastName]
    .map((name) => name.charAt(0))
    .filter(Boolean)
    .join('')
    .toLocaleUpperCase()

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark"><Sparkles size={24} /></div>
        <div><strong>AI Riyaziyyat</strong><span>Platforması</span></div>
      </div>

      <nav className="sidebar__nav" aria-label="Əsas naviqasiya">
        {navItems.map((item) => {
          const Icon = item.icon
          const active =
            (item.label === 'Əsas səhifə' && screen === 'dashboard') ||
            (item.label === 'Onlayn testlərim' && (screen === 'online-tests' || screen === 'online-test-details' || screen === 'active-test-details'))

          return (
            <button
              className={active ? 'nav-item active' : 'nav-item'}
              key={item.label}
              type="button"
              onClick={
                item.label === 'Əsas səhifə'
                  ? onHome
                  : item.label === 'Onlayn testlərim'
                    ? onOpenOnlineTests
                    : undefined
              }
            >
              <Icon size={21} /><span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar__secondary">
        <button className="nav-item" type="button"><Settings size={21} /><span>Parametrlər</span></button>
        <button className="nav-item" type="button"><HelpCircle size={21} /><span>Kömək və dəstək</span></button>
      </div>

      <button className="notification-item" type="button">
        <span className="notification-icon-wrap"><Bell size={21} /><b>3</b></span>
        <span>Bildirişlər</span>
      </button>

      <div className="sidebar__bottom">
        <button className="profile-card" type="button">
          <div className="avatar">{avatarInitials || '?'}</div>
          <div><strong>{displayName || 'User'}</strong><span>{roleDisplayName}</span><small><i />Online</small></div>
          <ChevronRight size={18} />
        </button>

        <div className="theme-row">
          <Moon size={19} /><span>Açıq rejim</span>
          <button className="switch" type="button" aria-label="Görünüş rejimini dəyiş"><span /></button>
        </div>
      </div>
    </aside>
  )
}

function Dashboard({
  onOpenTestBuilder,
  firstName,
  roleDisplayName,
}: {
  onOpenTestBuilder: () => void
  firstName: string
  roleDisplayName: string
}) {
  return (
    <main className="workspace">
      <div className="content">
        <section className="ai-hero">
          <div className="robot-visual" aria-hidden="true">
            <div className="robot-head">
              <span className="antenna" />
              <div className="robot-face"><i /><i /><em /></div>
            </div>
            <div className="robot-body"><span /></div>
            <div className="robot-arm" />
          </div>

          <div className="ai-hero__content">
            <div className="ai-hero__topline">
              <div><h1>Salam, {firstName} {roleDisplayName} 👋</h1><p>Bu gün sizə necə kömək edə bilərəm?</p></div>
              <span className="online-pill">● Online</span>
            </div>
            <div className="ai-input">
              <input aria-label="AI köməkçiyə mesaj" placeholder="Mesajınızı yazın..." />
              <button type="button" aria-label="Mesajı göndər"><Send size={22} /></button>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div><strong>Sürətli təkliflər</strong><span>(Sizin üçün)</span></div>
            <button type="button">Daha çox<ChevronRight size={17} /></button>
          </div>

          <div className="suggestions">
            {suggestions.map((text, index) => (
              <button key={text} type="button" onClick={text.includes('KSQ') ? onOpenTestBuilder : undefined}>
                {index === 0 ? <FilePlus2 /> : index === 1 ? <Target /> : index === 2 ? <Trophy /> : <Sparkles />}
                <strong>{text}</strong>
                <ChevronRight className="suggestion-arrow" size={19} />
              </button>
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading compact"><strong>Sürətli fəaliyyətlər</strong></div>
          <div className="quick-grid">
            {quickActions.map((item) => {
              const Icon = item.icon
              return (
                <button
                  className={`quick-card ${item.tone}`}
                  key={item.title}
                  type="button"
                  onClick={item.title === 'Test tərtib et' ? onOpenTestBuilder : undefined}
                >
                  <Icon className="quick-card__icon" size={30} />
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <ChevronRight className="quick-card__arrow" size={22} />
                </button>
              )
            })}
          </div>
        </section>

        <section className="stats">
          <div><Users /><span>Aktiv qruplar<strong>5 qrup</strong></span></div>
          <div><FilePlus2 /><span>Bu ay yaratdığınız testlər<strong>12 test</strong></span></div>
          <div><BarChart3 /><span>Orta nəticə artımı<strong>+18%</strong></span></div>
          <div><Target /><span>Ən çox istifadə etdiyiniz<strong>KSQ testi</strong></span></div>
        </section>
      </div>
    </main>
  )
}


function OnlineTestsPage({
  onCreateOnlineTest,
  onOpenDetails,
  onOpenActiveDetails,
}: {
  onCreateOnlineTest: () => void
  onOpenDetails: () => void
  onOpenActiveDetails: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'scheduled' | 'active' | 'finished' | 'cancelled'
  >('all')
  const [searchValue, setSearchValue] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [classGroupFilter, setClassGroupFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  const onlineTestRows = [
    {
      id: 1,
      title: 'KSQ — Natural ədədlər',
      type: 'KSQ',
      classGroup: '6-cı sinif · 1 qrup + qrupsuz şagirdlər',
      classValue: '6',
      groupValue: 'mixed',
      date: '13.08.2026',
      time: '10:00',
      students: 36,
      started: 0,
      finished: 0,
      status: 'scheduled',
      statusLabel: 'Planlaşdırılıb',
    },
    {
      id: 2,
      title: 'KSQ — Kəsrlər',
      type: 'KSQ',
      classGroup: '5-ci sinif · A qrupu',
      classValue: '5',
      groupValue: 'A',
      date: '10.08.2026',
      time: '10:00',
      students: 32,
      started: 18,
      finished: 7,
      status: 'active',
      statusLabel: 'Aktivdir',
    },
    {
      id: 3,
      title: 'KSQ — Faizlər',
      type: 'KSQ',
      classGroup: '6-cı sinif · B qrupu',
      classValue: '6',
      groupValue: 'B',
      date: '01.08.2026',
      time: '10:00',
      students: 34,
      started: 34,
      finished: 34,
      status: 'finished',
      statusLabel: 'Bitib',
    },
    {
      id: 4,
      title: 'BSQ — Tənliklər',
      type: 'BSQ',
      classGroup: '7-ci sinif · C qrupu',
      classValue: '7',
      groupValue: 'C',
      date: '25.07.2026',
      time: '10:00',
      students: 30,
      started: 30,
      finished: 28,
      status: 'finished',
      statusLabel: 'Bitib',
    },
    {
      id: 5,
      title: 'KSQ — Həndəsi fiqurlar',
      type: 'KSQ',
      classGroup: '5-ci sinif · D qrupu',
      classValue: '5',
      groupValue: 'D',
      date: '18.07.2026',
      time: '10:00',
      students: 28,
      started: 0,
      finished: 0,
      status: 'cancelled',
      statusLabel: 'Ləğv edilib',
    },
  ] as const

  const parseDate = (value: string) => {
    const [day, month, year] = value.split('.').map(Number)
    return new Date(year, month - 1, day).getTime()
  }

  const filteredRows = onlineTestRows.filter((row) => {
    const matchesStatus =
      statusFilter === 'all' ? true : row.status === statusFilter

    const normalizedSearch = searchValue.trim().toLocaleLowerCase('az')
    const matchesSearch =
      normalizedSearch.length === 0 ||
      row.title.toLocaleLowerCase('az').includes(normalizedSearch)

    const matchesType =
      typeFilter === 'all' ? true : row.type === typeFilter

    const matchesClassGroup =
      classGroupFilter === 'all'
        ? true
        : classGroupFilter === 'ungrouped'
          ? row.groupValue === 'mixed'
          : classGroupFilter.startsWith('class-')
            ? row.classValue === classGroupFilter.replace('class-', '')
            : classGroupFilter.startsWith('group-')
              ? row.groupValue === classGroupFilter.replace('group-', '')
              : true

    const rowDate = parseDate(row.date)
    const now = new Date(2026, 7, 10).getTime()
    const day = 24 * 60 * 60 * 1000
    const matchesDate =
      dateFilter === 'all'
        ? true
        : dateFilter === 'last-7'
          ? rowDate >= now - 7 * day && rowDate <= now
          : dateFilter === 'last-30'
            ? rowDate >= now - 30 * day && rowDate <= now
            : dateFilter === 'older'
              ? rowDate < now - 30 * day
              : true

    return (
      matchesStatus &&
      matchesSearch &&
      matchesType &&
      matchesClassGroup &&
      matchesDate
    )
  })

  const counts = {
    all: onlineTestRows.length,
    scheduled: onlineTestRows.filter((row) => row.status === 'scheduled').length,
    active: onlineTestRows.filter((row) => row.status === 'active').length,
    finished: onlineTestRows.filter((row) => row.status === 'finished').length,
    cancelled: onlineTestRows.filter((row) => row.status === 'cancelled').length,
  }

  const statusTabs = [
    { id: 'all', label: 'Hamısı', count: counts.all },
    { id: 'scheduled', label: 'Planlaşdırılıb', count: counts.scheduled },
    { id: 'active', label: 'Aktivdir', count: counts.active },
    { id: 'finished', label: 'Bitib', count: counts.finished },
    { id: 'cancelled', label: 'Ləğv edilib', count: counts.cancelled },
  ] as const

  return (
    <main className="workspace online-tests-workspace">
      <div className="online-tests-page">
        <div className="online-tests-page-header">
          <div>
            <h1>Onlayn testlərim</h1>
            <p>Onlayn testlərinizi izləyin və idarə edin.</p>
          </div>

          <button
            className="primary-action online-tests-create-button"
            type="button"
            onClick={onCreateOnlineTest}
          >
            <Plus size={17} />
            Yeni onlayn test yarat
          </button>
        </div>

        <div className="online-tests-tabs">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={statusFilter === tab.id ? 'active' : ''}
              onClick={() => setStatusFilter(tab.id)}
            >
              <span>{tab.label}</span>
              <b>{tab.count}</b>
            </button>
          ))}
        </div>

        <div className="online-tests-filters">
          <label className="online-tests-search">
            <Search size={17} />
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Test adı ilə axtarış"
            />
          </label>

          <label className="online-tests-select-wrap">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Test növü</option>
              <option value="KSQ">KSQ</option>
              <option value="BSQ">BSQ</option>
            </select>
            <ChevronDown size={15} />
          </label>

          <label className="online-tests-select-wrap">
            <select value={classGroupFilter} onChange={(event) => setClassGroupFilter(event.target.value)}>
              <option value="all">Sinif / Qrup</option>
              <optgroup label="Siniflər">
                <option value="class-5">5-ci sinif</option>
                <option value="class-6">6-cı sinif</option>
                <option value="class-7">7-ci sinif</option>
              </optgroup>
              <optgroup label="Qruplar">
                <option value="group-A">A qrupu</option>
                <option value="group-B">B qrupu</option>
                <option value="group-C">C qrupu</option>
                <option value="group-D">D qrupu</option>
              </optgroup>
              <option value="ungrouped">Heç bir qrupa daxil olmayanlar</option>
            </select>
            <ChevronDown size={15} />
          </label>

          <label className="online-tests-select-wrap">
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="all">Tarix aralığı</option>
              <option value="last-7">Son 7 gün</option>
              <option value="last-30">Son 30 gün</option>
              <option value="older">30 gündən əvvəl</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </div>

        <div className="online-tests-table">
          <div className="online-tests-table-head">
            <span>Testin adı</span>
            <span>Növ</span>
            <span>Sinif / Qrup</span>
            <span>Tarix və zaman</span>
            <span>Şagird sayı</span>
            <span>İştirak</span>
            <span>Status</span>
            <span>Təfərrüatlar</span>
          </div>

          <div className="online-tests-table-body">
            {filteredRows.map((row) => (
              <div className="online-tests-row" key={row.id}>
                <div className="online-test-title-cell">
                  <span className={`online-test-row-icon ${row.status}`}>
                    <ClipboardList size={18} />
                  </span>
                  <div>
                    <strong>{row.title}</strong>
                    <small>{row.classGroup}</small>
                  </div>
                </div>

                <div>
                  <span className="online-test-type-pill">{row.type}</span>
                </div>

                <div className="online-test-muted-cell">{row.classGroup}</div>

                <div className="online-test-date-cell">
                  <span>{row.date}</span>
                  <small>{row.time}</small>
                </div>

                <div className="online-test-student-cell">
                  <strong>{row.students}</strong>
                  <small>Təyin olunub</small>
                </div>

                <div className="online-test-participation-cell">
                  <span>{row.started} başladı</span>
                  <small>{row.finished} bitirdi</small>
                </div>

                <div>
                  <span className={`online-test-status ${row.status}`}>
                    {row.statusLabel}
                  </span>
                </div>

                <div className="online-test-actions">
                  <button type="button" onClick={row.status === 'active' ? onOpenActiveDetails : onOpenDetails}>
                    Ətraflı bax
                  </button>
                </div>
              </div>
            ))}

            {filteredRows.length === 0 && (
              <div className="online-tests-empty">
                Axtarışa uyğun onlayn test tapılmadı.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}



function ActiveOnlineTestDetails({ onBack }: { onBack: () => void }) {
  const [liveStudent, setLiveStudent] = useState<string | null>(null)
  const [finalStudent, setFinalStudent] = useState<string | null>(null)
  const students = [
    ['Əliyev Nihad','6-cı sinif / A qrupu','A','İşləyir','10:03','—'],
    ['Həsənova Aylin','6-cı sinif / A qrupu','B','İşləyir','10:05','—'],
    ['Orucov Məmməd','6-cı sinif / A qrupu','C','İşləyir','10:07','—'],
    ['Quliyeva Zəhra','6-cı sinif / B qrupu','A','İşləyir','10:08','—'],
    ['Rzayev Kamran','6-cı sinif / B qrupu','B','İşləyir','10:09','—'],
    ['Səfərova Ləman','6-cı sinif / B qrupu','C','İşləyir','10:10','—'],
    ['Məmmədli Tural','6-cı sinif / C qrupu','A','İşləyir','10:11','—'],
    ['Abdullayeva Nərmin','6-cı sinif / C qrupu','B','İşləyir','10:12','—'],
    ['Əhmədov Murad','6-cı sinif / C qrupu','C','İşləyir','10:13','—'],
    ['İbrahimli Kamran','6-cı sinif / A qrupu','A','İşləyir','10:14','—'],
    ['Hüseynova Günay','6-cı sinif / A qrupu','B','İşləyir','10:15','—'],
    ['Mustafayev Rəşad','6-cı sinif / A qrupu','C','Başlamayıb','—','—'],
    ['İsmayılova Leyla','6-cı sinif / A qrupu','A','Başlamayıb','—','—'],
    ['Qasımov Elvin','6-cı sinif / A qrupu','B','Başlamayıb','—','—'],
    ['Nəcəfova Aysu','6-cı sinif / B qrupu','C','Başlamayıb','—','—'],
    ['Əliyeva Nigar','6-cı sinif / B qrupu','A','Başlamayıb','—','—'],
    ['Kərimov Nicat','6-cı sinif / B qrupu','B','Başlamayıb','—','—'],
    ['Həsənli Fidan','6-cı sinif / C qrupu','C','Başlamayıb','—','—'],
    ['Rəhimov Zaur','6-cı sinif / C qrupu','A','Başlamayıb','—','—'],
    ['Quliyeva Ayan','6-cı sinif / C qrupu','B','Başlamayıb','—','—'],
    ['Sultanov Orxan','6-cı sinif / A qrupu','C','Başlamayıb','—','—'],
    ['Məlikova Aylin','6-cı sinif / B qrupu','A','Başlamayıb','—','—'],
    ['Cəfərov Samir','6-cı sinif / B qrupu','B','Başlamayıb','—','—'],
    ['Məmmədova Lalə','6-cı sinif / C qrupu','C','Başlamayıb','—','—'],
    ['Qurbanov Emil','6-cı sinif / C qrupu','A','Başlamayıb','—','—'],
    ['Xəlilov Tural','6-cı sinif / A qrupu','B','Bitirib','09:45','10:22'],
    ['Bağırov Elvin','6-cı sinif / A qrupu','C','Bitirib','09:50','10:26'],
    ['Əhmədova Nigar','6-cı sinif / B qrupu','A','Bitirib','09:55','10:31'],
    ['Hüseynov Rauf','6-cı sinif / B qrupu','B','Bitirib','09:58','10:34'],
    ['Əliyeva Zeynəb','6-cı sinif / C qrupu','C','Bitirib','10:00','10:36'],
    ['Rüstəmov Vüqar','6-cı sinif / C qrupu','A','Bitirib','10:01','10:38'],
    ['Səmədova Dəniz','6-cı sinif / C qrupu','B','Bitirib','10:02','10:40'],
  ] as const

  const getInitials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toLocaleUpperCase('az')

  const liveSelectedStudent = liveStudent
    ? students.find((student) => student[0] === liveStudent)
    : undefined

  const finalSelectedStudent = finalStudent
    ? students.find((student) => student[0] === finalStudent)
    : undefined

  return <main className="workspace active-test-workspace"><div className="active-test-page">
    <button className="active-back" onClick={onBack}><ArrowLeft size={18}/>Onlayn testlərimə qayıt</button>
    <div className="active-title-row"><div className="active-title-main"><span className="active-title-icon"><BookOpen size={24}/></span><h1>Kəsrlər bölməsinə aid KSQ</h1></div><span className="active-status"><Activity size={17}/>Aktivdir</span></div>

    <section className="active-summary">
      <div><Users/><span>Təyin olunub<strong>32</strong><small>şagird</small></span></div>
      <div className="green"><PlayCircle/><span>İşləyir<strong>11</strong><small>şagird</small></span></div>
      <div className="orange"><Clock3/><span>Başlamayıb<strong>14</strong><small>şagird</small></span></div>
      <div className="blue"><CircleCheckBig/><span>Bitirib<strong>7</strong><small>şagird</small></span></div>
    </section>

    <section className="active-table-card">
      <div className="active-table-title"><h2>Şagirdlərin vəziyyəti</h2><span><i/>İştirakçının imtahan nəticələri hər an yenilənir</span></div>
      <div className="active-table-scroll">
        <div className="active-table-head"><span>#</span><span>Şagirdin adı</span><span>Sinif / Qrup</span><span>Variant</span><span>Vəziyyət</span><span>Başlama zamanı</span><span>Bitmə zamanı</span><span>Anlıq məlumat</span></div>
        {students.map((s,i)=><div className="active-table-row" key={s[0]}>
          <span>{i+1}</span><strong>{s[0]}</strong><span>{s[1]}</span><span><b className={`variant variant-${s[2].toLowerCase()}`}>{s[2]}</b></span>
          <span><b className={`student-state ${s[3]==='İşləyir'?'working':s[3]==='Bitirib'?'finished':'not-started'}`}><i/>{s[3]}</b></span>
          <span>{s[4]}</span><span>{s[5]}</span><span>
            {s[3]==='İşləyir' && <button className="live-info-btn" onClick={()=>setLiveStudent(s[0])}><Activity size={15}/>Anlıq məlumat</button>}
            {s[3]==='Bitirib' && <button className="analysis-btn" onClick={()=>setFinalStudent(s[0])}><BarChart3 size={15}/>Son nəticə</button>}
            {s[3]==='Başlamayıb' && '—'}
          </span>
        </div>)}
      </div>
    </section>

    {liveStudent && <div className="live-modal-backdrop" onMouseDown={()=>setLiveStudent(null)}>
      <section className="live-modal" onMouseDown={e=>e.stopPropagation()}>
        <header className="live-modal-header">
          <h2>Anlıq məlumat</h2>
          <button onClick={()=>setLiveStudent(null)} aria-label="Bağla"><X size={20}/></button>
        </header>

        <div className="live-student-profile">
          <div className="live-avatar">{getInitials(liveStudent)}</div>
          <div>
            <strong>{liveStudent}</strong>
            <span>Sinif: {liveSelectedStudent?.[1] ?? '—'}</span>
            <span>Variant: <b>{liveSelectedStudent?.[2] ?? '—'}</b></span>
          </div>
        </div>

        <div className="live-answer-list">
          <div className="answered"><FileText/><span>Cavablandırılan sual sayı</span><strong>12</strong></div>
          <div className="correct"><CircleCheckBig/><span>Düzgün cavablandırılan sual sayı</span><strong>7</strong></div>
          <div className="wrong"><XCircle/><span>Yanlış cavablandırılan sual sayı</span><strong>5</strong></div>
          <div className="unanswered"><HelpCircle/><span>Cavablandırılmayan sual sayı</span><strong>13</strong></div>
        </div>

        <div className="remaining-time">
          <Timer/>
          <span>Qalan zaman</span>
          <strong>27:34</strong>
          <small>dəqiqə</small>
        </div>

        <div className="live-update-note">
          <Info size={17}/>
          İştirakçının imtahan nəticələri hər an yenilənir.
        </div>
      </section>
    </div>}

    {finalStudent && <div className="live-modal-backdrop" onMouseDown={()=>setFinalStudent(null)}>
      <section className="live-modal final-result-modal" onMouseDown={e=>e.stopPropagation()}>
        <header className="live-modal-header">
          <h2>Son nəticə</h2>
          <button onClick={()=>setFinalStudent(null)} aria-label="Bağla"><X size={20}/></button>
        </header>

        <div className="live-student-profile">
          <div className="live-avatar">{getInitials(finalStudent)}</div>
          <div>
            <strong>{finalStudent}</strong>
            <span>Sinif: {finalSelectedStudent?.[1] ?? '—'}</span>
            <span>Variant: <b>{finalSelectedStudent?.[2] ?? '—'}</b></span>
          </div>
        </div>

        <div className="live-answer-list">
          <div className="answered"><FileText/><span>Cavablandırılan sual sayı</span><strong>25</strong></div>
          <div className="correct"><CircleCheckBig/><span>Düzgün cavablandırılan sual sayı</span><strong>20</strong></div>
          <div className="wrong"><XCircle/><span>Yanlış cavablandırılan sual sayı</span><strong>5</strong></div>
          <div className="unanswered"><HelpCircle/><span>Cavablandırılmayan sual sayı</span><strong>0</strong></div>
        </div>

        <div className="remaining-time final-used-time">
          <Timer/>
          <span>İstifadə olunan zaman</span>
          <strong>37:00</strong>
          <small>dəqiqə</small>
        </div>
      </section>
    </div>}
  </div></main>
}

function PlannedOnlineTestDetails({ onBack }: { onBack: () => void }) {
  const students = [
    ['Əliyev Nihad','6-cı sinif / A qrupu',true,'10.08.2026 14:22'],
    ['Həsənova Aylin','6-cı sinif / A qrupu',true,'10.08.2026 13:05'],
    ['Quliyev Murad','6-cı sinif / B qrupu',false,'—'],
    ['İsmayılova Leyla','6-cı sinif / B qrupu',true,'09.08.2026 21:18'],
    ['Məmmədov Zaur','— (qrupa daxil deyil)',false,'—'],
    ['Rzayev Kamran','6-cı sinif / A qrupu',true,'09.08.2026 19:10'],
    ['Səfərova Ləman','6-cı sinif / A qrupu',true,'09.08.2026 18:32'],
    ['Abdullayev Rəşad','6-cı sinif / A qrupu',false,'—'],
    ['İbrahimli Kamran','6-cı sinif / B qrupu',true,'09.08.2026 17:45'],
    ['Əhmədova Nigar','6-cı sinif / B qrupu',false,'—'],
    ['Hüseynova Günay','6-cı sinif / B qrupu',true,'09.08.2026 16:28'],
    ['Qasımov Elvin','6-cı sinif / C qrupu',false,'—'],
    ['Nəcəfova Aysu','6-cı sinif / C qrupu',true,'09.08.2026 15:04'],
    ['Əliyeva Nigar','6-cı sinif / C qrupu',true,'09.08.2026 14:51'],
    ['Kərimov Nicat','6-cı sinif / A qrupu',false,'—'],
    ['Həsənli Fidan','6-cı sinif / A qrupu',true,'09.08.2026 13:37'],
    ['Rəhimov Zaur','6-cı sinif / B qrupu',false,'—'],
    ['Quliyeva Ayan','6-cı sinif / B qrupu',true,'09.08.2026 12:44'],
    ['Sultanov Orxan','6-cı sinif / C qrupu',false,'—'],
    ['Məlikova Aylin','6-cı sinif / C qrupu',true,'09.08.2026 11:58'],
    ['Cəfərov Samir','— (qrupa daxil deyil)',false,'—'],
    ['Məmmədova Lalə','6-cı sinif / A qrupu',true,'09.08.2026 11:22'],
    ['Qurbanov Emil','6-cı sinif / A qrupu',true,'09.08.2026 10:55'],
    ['Xəlilov Tural','6-cı sinif / B qrupu',false,'—'],
    ['Bağırov Elvin','6-cı sinif / B qrupu',true,'09.08.2026 10:10'],
    ['Rüstəmov Vüqar','6-cı sinif / C qrupu',false,'—'],
    ['Səmədova Dəniz','6-cı sinif / C qrupu',true,'09.08.2026 09:35'],
    ['Əliyev Rauf','6-cı sinif / A qrupu',true,'09.08.2026 09:01'],
    ['Hüseynov Murad','6-cı sinif / A qrupu',false,'—'],
    ['Nəsirova Leyla','6-cı sinif / B qrupu',true,'08.08.2026 22:14'],
    ['Əsgərov Tural','6-cı sinif / B qrupu',false,'—'],
    ['Məmmədli Ayan','6-cı sinif / C qrupu',true,'08.08.2026 20:40'],
    ['Quliyev Elvin','6-cı sinif / C qrupu',true,'08.08.2026 19:27'],
    ['Rəhimova Nərmin','— (qrupa daxil deyil)',false,'—'],
    ['Sultanova Aysel','6-cı sinif / A qrupu',true,'08.08.2026 17:53'],
    ['Kərimli Rauf','6-cı sinif / B qrupu',false,'—'],
  ] as const

  return (
    <main className="workspace planned-test-workspace">
      <div className="planned-test-page">
        <button className="planned-test-back" type="button" onClick={onBack}>
          <ArrowLeft size={16}/> Onlayn testlərimə qayıt
        </button>

        <div className="planned-test-title-row">
          <h1>KSQ — Natural ədədlər</h1>
          <span className="planned-test-status"><CalendarDays size={15}/>Planlaşdırılıb</span>
        </div>

        <section className="planned-test-summary">
          <div><CalendarDays/><span>İmtahan tarixi<strong>13.08.2026</strong><small>Cümə axşamı</small></span></div>
          <div><Clock3/><span>Başlama zamanı<strong>10:00</strong></span></div>
          <div><Clock3/><span>Ən gec başlama<strong>10:15</strong></span></div>
          <div><Flag/><span>Bitmə zamanı<strong>10:45</strong></span></div>
          <div><Users/><span>Təyin olunan şagirdlər<strong>36 nəfər</strong></span></div>
          <div><Shuffle/><span>Variant sayı<strong>6</strong><small>Avtomatik paylanacaq</small></span></div>
        </section>

        <div className="planned-test-content">
          <section className="planned-students-card">
            <h2>Şagirdlərin vəziyyəti</h2>
            <div className="planned-stats">
              <div><Users/><strong>36</strong><span>Təyin olunub</span><small>100%</small></div>
              <div><CircleCheckBig/><strong>21</strong><span>Ödəniş edib</span><small>58.3%</small></div>
              <div className="waiting"><Clock3/><strong>15</strong><span>Gözləyir</span><small>41.7%</small></div>
            </div>
            <div className="planned-student-table planned-student-scroll">
              <div className="planned-student-head"><span>#</span><span>Şagirdin adı</span><span>Sinif / Qrup</span><span>Ödəniş vəziyyəti</span><span>Ödəniş tarixi</span><span/></div>
              {students.map((s,i)=>(
                <div className="planned-student-row" key={s[0]}>
                  <span>{i+1}</span><strong>{s[0]}</strong><span>{s[1]}</span>
                  <span><b className={s[2]?'paid':'waiting'}>{s[2]?'Ödəniş edib':'Gözləyir'}</b></span>
                  <span>{s[3]}</span><button type="button">⋮</button>
                </div>
              ))}
            </div>
          </section>

          <aside className="planned-system-column">
            <section className="planned-system-card">
              <h2>Sistem məlumatı</h2>
              <div><CalendarDays/><p>Test təyin edilmiş zamanda avtomatik aktivləşəcək və şagirdlərə açılacaq.</p></div>
              <div><Shuffle/><p>Variantlar şagirdlərə avtomatik və balanslı şəkildə paylanacaq.</p></div>
              <div><Lock/><p>Suallar və düzgün cavablar imtahan bitdikdən sonra müəllimə açılacaq.</p></div>
              <div><ShieldCheck/><p>Şagirdlər yalnız təyin olunmuş zaman aralığında testə daxil ola biləcəklər.</p></div>
            </section>
            <section className="planned-ai-note">
              <Info size={20}/><p>Əlavə məlumat və kömək üçün <strong>AI köməkçidən</strong> istifadə edə bilərsiniz.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}

function StepIndicator({
  currentStep,
  selectedPurpose,
  selectedClass,
  selectedSection,
  topicsReady,
  parametersReady,
  onNavigate,
}: {
  currentStep: BuilderStep
  selectedPurpose: string | null
  selectedClass: number | null
  selectedSection: string | null
  topicsReady: boolean
  parametersReady: boolean
  onNavigate: (step: BuilderStep) => void
}) {
  const stepMap: BuilderStep[] = [
    'purpose',
    'class',
    'section',
    'topics',
    'parameters',
    'review',
  ]

  const activeIndex = stepMap.indexOf(currentStep)

  const canVisit = (index: number) => {
    if (index === 0) return true
    if (index === 1) return selectedPurpose === 'ksq'
    if (index === 2) return selectedPurpose === 'ksq' && selectedClass !== null
    if (index === 3) {
      return (
        selectedPurpose === 'ksq' &&
        selectedClass !== null &&
        selectedSection !== null
      )
    }
    if (index === 4) {
      return (
        selectedPurpose === 'ksq' &&
        selectedClass !== null &&
        selectedSection !== null &&
        topicsReady
      )
    }
    if (index === 5) {
      return (
        selectedPurpose === 'ksq' &&
        selectedClass !== null &&
        selectedSection !== null &&
        topicsReady &&
        parametersReady
      )
    }
    return false
  }

  return (
    <ol className="builder-steps interactive" aria-label="Test tərtibi mərhələləri">
      {builderSteps.map((step, index) => {
        const completed = index < activeIndex
        const active = index === activeIndex
        const canClick = canVisit(index)

        return (
          <li
            key={step}
            className={`${active ? 'active' : ''} ${completed ? 'completed' : ''} ${canClick ? 'clickable' : 'locked'}`}
          >
            <button
              type="button"
              disabled={!canClick}
              onClick={() => {
                if (canClick) onNavigate(stepMap[index])
              }}
              aria-current={active ? 'step' : undefined}
            >
              <span>{completed ? <Check size={16} /> : index + 1}</span>
              <strong>{step}</strong>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ClockIcon() {
  return (
    <span className="clock-css-icon" aria-hidden="true">
      <i />
    </span>
  )
}

function TestBuilder({
  onBack,
  onOpenOnlineTests,
  startInOnlineMode = false,
}: {
  onBack: () => void
  onOpenOnlineTests: () => void
  startInOnlineMode?: boolean
}) {
  const [builderStep, setBuilderStep] = useState<BuilderStep>('purpose')
  const [preparationStage, setPreparationStage] =
    useState<PreparationStage>('review')
  const [selectedPurpose, setSelectedPurpose] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<number | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [aiSelectTopics, setAiSelectTopics] = useState(false)

  const [questionCount, setQuestionCount] = useState(20)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [variantCount, setVariantCount] = useState(1)
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0)
  const [selectedPageCount, setSelectedPageCount] = useState(2)

  const [aiDifficulty, setAiDifficulty] = useState(false)
  const [difficultyEasy, setDifficultyEasy] = useState(0)
  const [difficultyMedium, setDifficultyMedium] = useState(0)
  const [difficultyHard, setDifficultyHard] = useState(0)

  const [aiTopicDistribution, setAiTopicDistribution] = useState(true)
  const [topicDistribution, setTopicDistribution] = useState<Record<string, number>>({})

  const [questionTypeDistribution, setQuestionTypeDistribution] =
    useState<Record<string, number>>({})

  const [, setDifficultyLimitMessage] = useState('')
  const [topicLimitMessage, setTopicLimitMessage] = useState('')
  const [questionTypeLimitMessage, setQuestionTypeLimitMessage] = useState('')

  const [voluntaryChangedQuestions, setVoluntaryChangedQuestions] =
    useState<number[]>([])
  const [questionVariants, setQuestionVariants] =
    useState<Record<number, number>>({})
  const [activeIssueQuestion, setActiveIssueQuestion] =
    useState<number | null>(null)
  const [issueReason, setIssueReason] = useState('')
  const [issueExplanation, setIssueExplanation] = useState('')
  const [issueStage, setIssueStage] =
    useState<'reason' | 'explanation' | 'recheck'>('reason')
  const [previewMessage, setPreviewMessage] = useState('')
  const [finalReviewAccepted, setFinalReviewAccepted] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentCompleted, setPaymentCompleted] = useState(false)
  const [parametersLocked, setParametersLocked] = useState(false)
  const [testUsageMode, setTestUsageMode] = useState<'pdf' | 'online' | null>(null)
  const [selectedOnlineGroupIds, setSelectedOnlineGroupIds] = useState<string[]>([])
  const [extraOnlineStudentIds, setExtraOnlineStudentIds] = useState<number[]>([])
  const [showExtraStudentPicker, setShowExtraStudentPicker] = useState(false)
  const [onlineStudentSearch, setOnlineStudentSearch] = useState('')
  const [onlineExamDate, setOnlineExamDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 4)
    return toLocalDateInputValue(date)
  })
  const [onlineExamDateDisplay, setOnlineExamDateDisplay] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 4)
    return isoDateToDisplay(toLocalDateInputValue(date))
  })
  const [onlineStartTime, setOnlineStartTime] = useState('10:00')
  const [onlineLatestStartTime, setOnlineLatestStartTime] = useState('10:15')
  const [onlineTestActivated, setOnlineTestActivated] = useState(false)
  const [onlineCreationShortcut, setOnlineCreationShortcut] =
    useState(startInOnlineMode)
  const [, setDesignLocked] = useState(false)

  const resetParameters = () => {
    setQuestionCount(20)
    setDurationMinutes(30)
    setVariantCount(1)
    setSelectedVariantIndex(0)
    setSelectedPageCount(2)

    setAiDifficulty(false)
    setDifficultyEasy(0)
    setDifficultyMedium(0)
    setDifficultyHard(0)

    setAiTopicDistribution(true)
    setTopicDistribution({})

    setQuestionTypeDistribution({})

    setDifficultyLimitMessage('')
    setTopicLimitMessage('')
    setQuestionTypeLimitMessage('')
    setPreparationStage('review')
    setVoluntaryChangedQuestions([])
    setQuestionVariants({})
    setActiveIssueQuestion(null)
    setIssueReason('')
    setIssueExplanation('')
    setIssueStage('reason')
    setPreviewMessage('')
    setFinalReviewAccepted(false)
    setPaymentOpen(false)
    setPaymentCompleted(false)
    setParametersLocked(false)
    setTestUsageMode(null)
    setSelectedOnlineGroupIds([])
    setExtraOnlineStudentIds([])
    setShowExtraStudentPicker(false)
    setOnlineStudentSearch('')
    const nextOnlineDate = new Date()
    nextOnlineDate.setDate(nextOnlineDate.getDate() + 4)
    const nextOnlineDateIso = toLocalDateInputValue(nextOnlineDate)
    setOnlineExamDate(nextOnlineDateIso)
    setOnlineExamDateDisplay(isoDateToDisplay(nextOnlineDateIso))
    setOnlineStartTime('10:00')
    setOnlineLatestStartTime('10:15')
    setOnlineTestActivated(false)
    setOnlineCreationShortcut(false)
    setDesignLocked(false)
  }

  const resetAfterPurpose = () => {
    setSelectedClass(null)
    setSelectedSection(null)
    setSelectedTopics([])
    setAiSelectTopics(false)
    resetParameters()
  }

  const resetAfterClass = () => {
    setSelectedSection(null)
    setSelectedTopics([])
    setAiSelectTopics(false)
    resetParameters()
  }

  const resetAfterSection = () => {
    setSelectedTopics([])
    setAiSelectTopics(false)
    resetParameters()
  }

  const resetAfterTopics = () => {
    resetParameters()
  }

  const selectPurpose = (purposeId: string) => {
    if (selectedPurpose !== purposeId) {
      resetAfterPurpose()
    }
    setSelectedPurpose(purposeId)
    if (purposeId === 'ksq') setBuilderStep('class')
  }

  const selectClass = (classNumber: number) => {
    if (selectedClass !== classNumber) {
      resetAfterClass()
    }
    setSelectedClass(classNumber)
  }

  const selectSection = (section: string) => {
    if (selectedSection !== section) {
      resetAfterSection()
    }
    setSelectedSection(section)
  }

  const toggleTopic = (topic: string) => {
    if (aiSelectTopics) {
      setAiSelectTopics(false)
    }

    const nextTopics = selectedTopics.includes(topic)
      ? selectedTopics.filter((item) => item !== topic)
      : [...selectedTopics, topic]

    if (
      nextTopics.length !== selectedTopics.length ||
      !nextTopics.every((item) => selectedTopics.includes(item))
    ) {
      resetAfterTopics()
    }

    setSelectedTopics(nextTopics)
  }

  const toggleAiSelectTopics = () => {
    const next = !aiSelectTopics

    if (next !== aiSelectTopics) {
      resetAfterTopics()
    }

    setAiSelectTopics(next)
    if (next) {
      setSelectedTopics([])
    }
  }

  const topicsReady = aiSelectTopics || selectedTopics.length > 0

  const normalizeInput = (value: string) => {
    if (value.trim() === '') return 0
    return Math.max(0, Math.trunc(Number(value) || 0))
  }

  const remainingLimit = (currentValue: number, currentTotal: number) =>
    Math.max(0, questionCount - (currentTotal - currentValue))

  const setDifficultyValue = (
    field: 'easy' | 'medium' | 'hard',
    rawValue: string,
  ) => {
    const nextValue = normalizeInput(rawValue)
    const currentValue =
      field === 'easy'
        ? difficultyEasy
        : field === 'medium'
          ? difficultyMedium
          : difficultyHard

    const currentTotal =
      difficultyEasy + difficultyMedium + difficultyHard
    const maxAllowed = remainingLimit(currentValue, currentTotal)

    if (nextValue > maxAllowed) {
      setDifficultyLimitMessage('Ümumi sual limitini aşdınız!')
      return
    }

    setDifficultyLimitMessage('')

    if (field === 'easy') setDifficultyEasy(nextValue)
    if (field === 'medium') setDifficultyMedium(nextValue)
    if (field === 'hard') setDifficultyHard(nextValue)
  }

  const applyAiDifficultySuggestion = () => {
    const easy = Math.floor(questionCount * 0.3)
    const hard = Math.floor(questionCount * 0.2)
    const medium = questionCount - easy - hard

    setDifficultyEasy(easy)
    setDifficultyMedium(medium)
    setDifficultyHard(hard)
    setDifficultyLimitMessage('')
    setAiDifficulty(true)
  }

  const applyAiTopicSuggestion = () => {
    if (selectedTopics.length === 0) return

    const base = Math.floor(questionCount / selectedTopics.length)
    const remainder = questionCount % selectedTopics.length

    setTopicDistribution(
      selectedTopics.reduce<Record<string, number>>((result, topic, index) => {
        result[topic] = base + (index < remainder ? 1 : 0)
        return result
      }, {}),
    )
    setTopicLimitMessage('')
    setAiTopicDistribution(true)
  }

  const updateTopicDistribution = (topic: string, rawValue: string) => {
    const nextValue = normalizeInput(rawValue)
    const currentValue = topicDistribution[topic] ?? 0
    const currentTotal = selectedTopics.reduce(
      (sum, item) => sum + (topicDistribution[item] ?? 0),
      0,
    )
    const maxAllowed = remainingLimit(currentValue, currentTotal)

    if (nextValue > maxAllowed) {
      setTopicLimitMessage('Ümumi sual limitini aşdınız!')
      return
    }

    setTopicLimitMessage('')
    setTopicDistribution((current) => ({
      ...current,
      [topic]: nextValue,
    }))
  }

  const questionTypeWeight = (type: string) =>
    type === 'Situasiya' ? 3 : 1

  const questionTypeQuestionCount = (
    type: string,
    distribution: Record<string, number>,
  ) => (distribution[type] ?? 0) * questionTypeWeight(type)

  const updateQuestionTypeDistribution = (
    type: string,
    rawValue: string,
  ) => {
    const nextValue = normalizeInput(rawValue)
    const currentValue = questionTypeDistribution[type] ?? 0
    const currentContribution = currentValue * questionTypeWeight(type)
    const currentTotal = questionTypes.reduce(
      (sum, item) =>
        sum + questionTypeQuestionCount(item, questionTypeDistribution),
      0,
    )
    const remainingForThisType = Math.max(
      0,
      questionCount - (currentTotal - currentContribution),
    )
    const maxAllowed =
      type === 'Situasiya'
        ? Math.floor(remainingForThisType / 3)
        : remainingForThisType

    if (nextValue > maxAllowed) {
      setQuestionTypeLimitMessage(
        type === 'Situasiya'
          ? 'Ümumi sual limitini aşdınız! 1 situasiya = 3 sual.'
          : 'Ümumi sual limitini aşdınız!',
      )
      return
    }

    setQuestionTypeLimitMessage('')
    setQuestionTypeDistribution((current) => ({
      ...current,
      [type]: nextValue,
    }))
  }

  const manualDifficultyTotal =
    difficultyEasy + difficultyMedium + difficultyHard

  const manualTopicTotal = selectedTopics.reduce(
    (sum, topic) => sum + (topicDistribution[topic] ?? 0),
    0,
  )

  const manualQuestionTypeTotal = questionTypes.reduce(
    (sum, type) =>
      sum + questionTypeQuestionCount(type, questionTypeDistribution),
    0,
  )

  const getLimitStatus = (total: number) => {
    if (total > questionCount) {
      return {
        className: 'limit-status error',
        text: `Yeni limit ${questionCount}-dir, bölgüləri yeniləyin.`,
      }
    }

    if (total < questionCount) {
      return {
        className: 'limit-status warning',
        text: `Sual sayınız təyin olunmuş limitdən azdır. Qalan: ${questionCount - total}`,
      }
    }

    return {
      className: 'limit-status ok',
      text: `${total}/${questionCount} — tamamlandı`,
    }
  }

  const difficultyStatus = getLimitStatus(manualDifficultyTotal)
  const topicStatus = getLimitStatus(manualTopicTotal)
  const questionTypeStatus = getLimitStatus(manualQuestionTypeTotal)

  const parametersReady =
    questionCount > 0 &&
    durationMinutes > 0 &&
    manualDifficultyTotal === questionCount &&
    (aiSelectTopics || manualTopicTotal === questionCount) &&
    manualQuestionTypeTotal === questionCount

  const navigateToStep = (step: BuilderStep) => {
    if (parametersLocked && step !== 'review') {
      return
    }

    if (step === 'purpose') {
      setBuilderStep('purpose')
      return
    }

    if (step === 'class' && selectedPurpose === 'ksq') {
      setBuilderStep('class')
      return
    }

    if (
      step === 'section' &&
      selectedPurpose === 'ksq' &&
      selectedClass !== null
    ) {
      setBuilderStep('section')
      return
    }

    if (
      step === 'topics' &&
      selectedPurpose === 'ksq' &&
      selectedClass !== null &&
      selectedSection !== null
    ) {
      setBuilderStep('topics')
      return
    }

    if (
      step === 'parameters' &&
      selectedPurpose === 'ksq' &&
      selectedClass !== null &&
      selectedSection !== null &&
      topicsReady
    ) {
      setPreparationStage('review')
      setBuilderStep('parameters')
      return
    }

    if (
      step === 'review' &&
      selectedPurpose === 'ksq' &&
      selectedClass !== null &&
      selectedSection !== null &&
      topicsReady &&
      parametersReady
    ) {
      setBuilderStep('review')
    }
  }

  const overallDifficultyLabel = (() => {
    if (questionCount <= 0) return '—'
    const score =
      (difficultyEasy + difficultyMedium * 2 + difficultyHard * 3) /
      questionCount

    if (score < 1.55) return 'Asan'
    if (score > 2.35) return 'Çətin'
    return 'Orta'
  })()

  const variantLetters = Array.from(
    { length: variantCount },
    (_, index) => String.fromCharCode(65 + index),
  )

  const activeVariantLetter = variantLetters[selectedVariantIndex] ?? 'A'

  const recommendedPageCount = (() => {
    if (questionCount <= 0) return 1

    const weightedNeed =
      difficultyEasy * 0.8 +
      difficultyMedium * 1.05 +
      difficultyHard * 1.3 +
      (questionTypeDistribution['Açıq'] ?? 0) * 0.35 +
      (questionTypeDistribution['Uyğunluğu müəyyən et'] ?? 0) * 0.45 +
      (questionTypeDistribution['Ətraflı yazı tələb edən'] ?? 0) * 0.8 +
      (questionTypeDistribution['Situasiya'] ?? 0) * 1.15 +
      (questionTypeDistribution['İsbat tələb edən'] ?? 0) * 1.1

    const estimatedPages = Math.ceil(weightedNeed / 10)

    return Math.min(8, Math.max(1, estimatedPages))
  })()

  const pageCountAiMessage =
    selectedPageCount === recommendedPageCount
      ? `AI təklifi ilə uyğundur: ${recommendedPageCount} səhifə`
      : selectedPageCount < recommendedPageCount
        ? `AI təklifi: ${recommendedPageCount} səhifə — hazırkı seçimdə həll sahələri darala bilər.`
        : `AI təklifi: ${recommendedPageCount} səhifə — hazırkı seçim daha geniş həll sahəsi verəcək.`

  const paymentUnitPriceLabel =
    PAYMENT_CONFIG.pricePerVariantAZN === null
      ? '— AZN'
      : `${PAYMENT_CONFIG.pricePerVariantAZN.toFixed(2)} AZN`

  const paymentTotalLabel =
    PAYMENT_CONFIG.pricePerVariantAZN === null
      ? '— AZN'
      : `${(PAYMENT_CONFIG.pricePerVariantAZN * variantCount).toFixed(2)} AZN`

  const estimatedMinutes = Math.max(
    1,
    Math.round(
      questionCount * 1.25 +
        (aiDifficulty ? questionCount * 0.2 : difficultyHard * 0.8) +
        (questionTypeDistribution['Ətraflı yazı tələb edən'] ?? 0) * 1.2 +
        (questionTypeDistribution['Situasiya'] ?? 0) * 3.6 +
        (questionTypeDistribution['İsbat tələb edən'] ?? 0) * 1.8,
    ),
  )


  const prepareTest = () => {
    if (!finalReviewAccepted) return

    if (onlineCreationShortcut) {
      setTestUsageMode('online')
      setParametersLocked(true)
      setPreparationStage('online-students')
      return
    }

    setPreparationStage('use-mode')
  }

  const choosePdfMode = () => {
    setTestUsageMode('pdf')
    setPaymentOpen(true)
  }

  const chooseOnlineMode = () => {
    setTestUsageMode('online')
    setParametersLocked(true)
    setPreparationStage('online-students')
  }

  const toggleOnlineGroup = (groupId: string) => {
    setSelectedOnlineGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    )
  }

  const toggleExtraOnlineStudent = (studentId: number) => {
    setExtraOnlineStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    )
  }

  const selectedOnlineGroups = onlineGroups.filter((group) =>
    selectedOnlineGroupIds.includes(group.id),
  )

  const selectedGroupStudentIds = selectedOnlineGroups.flatMap(
    (group) => group.studentIds,
  )

  const allOnlineSelectionIds = [
    ...selectedGroupStudentIds,
    ...extraOnlineStudentIds,
  ]

  const uniqueOnlineStudentIds = Array.from(new Set(allOnlineSelectionIds))

  const duplicateOnlineStudentCount =
    allOnlineSelectionIds.length - uniqueOnlineStudentIds.length

  const selectedOnlineStudents = uniqueOnlineStudentIds
    .map((id) => onlineStudents.find((student) => student.id === id))
    .filter((student): student is OnlineStudent => Boolean(student))

  const filteredExtraOnlineStudents = onlineStudents.filter((student) =>
    student.name.toLocaleLowerCase('az').includes(
      onlineStudentSearch.trim().toLocaleLowerCase('az'),
    ),
  )

  const onlineEndTime = addMinutesToTime(
    onlineLatestStartTime,
    durationMinutes,
  )

  const onlineTimeOrderValid =
    timeToMinutes(onlineLatestStartTime) >= timeToMinutes(onlineStartTime)

  const todayInputValue = toLocalDateInputValue(new Date())
  const onlineDateValid =
    Boolean(onlineExamDate) && onlineExamDate >= todayInputValue
  const onlineTimeSettingsValid = onlineTimeOrderValid && onlineDateValid

  const onlineExamDateLabel = (() => {
    if (!onlineExamDate) return 'Tarix seçilməyib'
    const [year, month, day] = onlineExamDate.split('-')
    return `${day}.${month}.${year}`
  })()

  const onlinePurposeLabel =
    purposes.find((purpose) => purpose.id === selectedPurpose)?.title ?? 'KSQ'

  const onlineClassTopicLabel = [
    selectedClass !== null ? `${selectedClass}-ci sinif` : null,
    selectedTopics.length > 0 ? selectedTopics.join(', ') : selectedSection,
  ]
    .filter(Boolean)
    .join(' / ')

  const onlineVariantLetters = Array.from(
    { length: variantCount },
    (_, index) => String.fromCharCode(65 + index),
  )

  const onlineVariantLabel =
    variantCount === 1
      ? '1 variant (A)'
      : `${variantCount} variant (${onlineVariantLetters.join(', ')})`

  const onlinePresentationReady =
    selectedOnlineStudents.length > 0 &&
    onlineTimeSettingsValid &&
    questionCount > 0 &&
    variantCount > 0

  const completePayment = () => {
    setPaymentOpen(false)
    setPaymentCompleted(true)
    setParametersLocked(true)
    setTestUsageMode('pdf')
    setPreparationStage('preview')
  }

  const expandDistribution = (
    labels: string[],
    distribution: Record<string, number>,
  ) => {
    const expanded: string[] = []

    labels.forEach((label) => {
      const count = distribution[label] ?? 0
      for (let i = 0; i < count; i += 1) {
        expanded.push(label)
      }
    })

    return expanded
  }

  const manualTypeSequence = questionTypes.flatMap((type) => {
    const selectedCount = questionTypeDistribution[type] ?? 0
    const questionCountForType =
      type === 'Situasiya' ? selectedCount * 3 : selectedCount

    return Array.from({ length: questionCountForType }, () => type)
  })

  const typeHeading = (type: string) => {
    if (type === 'Uyğunluğu müəyyən et' || type === 'İsbat tələb edən') {
      return null
    }

    if (type === 'Situasiya') return 'Situasiya sualları'
    if (type === 'Qapalı') return 'Qapalı suallar'
    if (type === 'Açıq') return 'Açıq suallar'
    if (type === 'Ətraflı yazı tələb edən') {
      return 'Ətraflı yazı tələb edən suallar'
    }

    return null
  }

  const aiDifficultySequence = Array.from(
    { length: questionCount },
    (_, index) => ['Asan', 'Orta', 'Orta', 'Çətin'][index % 4],
  )

  const manualDifficultySequence = [
    ...Array.from({ length: difficultyEasy }, () => 'Asan'),
    ...Array.from({ length: difficultyMedium }, () => 'Orta'),
    ...Array.from({ length: difficultyHard }, () => 'Çətin'),
  ]

  const aiTopicSequence = Array.from(
    { length: questionCount },
    (_, index) => `AI mövzu seçimi ${((index % 3) + 1).toString()}`,
  )

  const manualTopicSequence = aiTopicDistribution
    ? Array.from(
        { length: questionCount },
        (_, index) => selectedTopics[index % selectedTopics.length],
      )
    : expandDistribution(selectedTopics, topicDistribution)

  const voluntaryChangeLimit = 5
  const voluntaryChangeCount = voluntaryChangedQuestions.length

  const registerVoluntaryChange = (
    questionId: number,
    actionLabel: string,
  ) => {
    const alreadyCounted = voluntaryChangedQuestions.includes(questionId)

    if (!alreadyCounted && voluntaryChangeCount >= voluntaryChangeLimit) {
      setPreviewMessage(
        'İstəyə bağlı dəyişmə limitinə çatdınız. Sistem problemi təsdiqlənərsə həmin dəyişiklik limitdən sayılmayacaq.',
      )
      return
    }

    if (!alreadyCounted) {
      setVoluntaryChangedQuestions((current) => [...current, questionId])
    }

    setQuestionVariants((current) => ({
      ...current,
      [questionId]: (current[questionId] ?? 1) + 1,
    }))

    setPreviewMessage(
      `${questionId}-ci sual üçün “${actionLabel}” əməliyyatı qeydə alındı.`,
    )
  }

  const openIssueReview = (questionId: number) => {
    setActiveIssueQuestion(questionId)
    setIssueReason('')
    setIssueExplanation('')
    setIssueStage('reason')
    setPreviewMessage('')
  }

  const startIssueInvestigation = () => {
    if (!issueReason) return

    // Real AI inteqrasiyasında ilk müstəqil yoxlama burada işləyəcək.
    // Prototipdə AI müəllimlə avtomatik razılaşmır və əlavə izah istəyir.
    setIssueStage('explanation')
  }

  const recheckWithTeacherExplanation = () => {
    if (!issueExplanation.trim()) return

    // Real AI inteqrasiyasında müəllimin izahı yeni dəlil kimi nəzərə alınaraq
    // ikinci müstəqil araşdırma burada aparılacaq.
    setIssueStage('recheck')
  }

  const closeIssueReview = () => {
    setActiveIssueQuestion(null)
    setIssueReason('')
    setIssueExplanation('')
    setIssueStage('reason')
  }

  const mockQuestions = Array.from({ length: questionCount }, (_, index) => {
    const baseScore = Math.floor(100 / questionCount)
    const remainder = 100 % questionCount
    const score = baseScore + (index < remainder ? 1 : 0)

    const topic = aiSelectTopics
      ? aiTopicSequence[index]
      : manualTopicSequence[index] ?? selectedTopics[index % selectedTopics.length]

    const difficulty = aiDifficulty
      ? aiDifficultySequence[index]
      : manualDifficultySequence[index] ?? 'Orta'

    const type = manualTypeSequence[index] ?? 'Qapalı'

    const minute = difficulty === 'Çətin' ? 3 : difficulty === 'Orta' ? 2 : 1

    return {
      id: index + 1,
      score,
      topic,
      difficulty,
      type,
      minute,
      variant: questionVariants[index + 1] ?? 1,
      questionCode: `KSQ-${selectedClass ?? 0}-${activeVariantLetter}-${index + 1}-${questionVariants[index + 1] ?? 1}`,
    }
  })


  const solutionSpaceClass = (type: string) => {
    if (type === 'Qapalı') return 'solution-space compact'
    if (type === 'Açıq') return 'solution-space medium'
    if (type === 'Uyğunluğu müəyyən et') return 'solution-space medium'
    if (type === 'Ətraflı yazı tələb edən') return 'solution-space large'
    if (type === 'Situasiya') return 'solution-space medium'
    if (type === 'İsbat tələb edən') return 'solution-space xlarge'
    return 'solution-space medium'
  }

  const isGeometryQuestion = (questionId: number, type: string) =>
    type !== 'Situasiya' && questionId % 4 === 0

  const situationQuestionIndexes = mockQuestions
    .filter((question) => question.type === 'Situasiya')
    .map((question) => question.id)

  const situationBlockNumber = (questionId: number) => {
    const situationIndex = situationQuestionIndexes.indexOf(questionId)
    if (situationIndex < 0) return null
    return Math.floor(situationIndex / 3) + 1
  }

  const situationSubQuestionNumber = (questionId: number) => {
    const situationIndex = situationQuestionIndexes.indexOf(questionId)
    if (situationIndex < 0) return null
    return (situationIndex % 3) + 1
  }

  const isSituationStart = (questionId: number) =>
    situationSubQuestionNumber(questionId) === 1

  const solutionNeedWeight = (type: string) => {
    if (type === 'Qapalı') return 1
    if (type === 'Açıq') return 1.35
    if (type === 'Uyğunluğu müəyyən et') return 1.5
    if (type === 'Ətraflı yazı tələb edən') return 2.1
    if (type === 'Situasiya') return 1.65
    if (type === 'İsbat tələb edən') return 2.7
    return 1.35
  }

  const printColumnCount = selectedPageCount * 2
  const questionsPerColumn = Math.ceil(
    mockQuestions.length / Math.max(1, printColumnCount),
  )

  const printColumns = Array.from(
    { length: printColumnCount },
    (_, columnIndex) =>
      mockQuestions.slice(
        columnIndex * questionsPerColumn,
        (columnIndex + 1) * questionsPerColumn,
      ),
  )

  const printPages = Array.from({ length: selectedPageCount }, (_, pageIndex) => ({
    left: printColumns[pageIndex * 2] ?? [],
    right: printColumns[pageIndex * 2 + 1] ?? [],
  })).filter((page) => page.left.length > 0 || page.right.length > 0)

  const printPagesRef = useRef<HTMLDivElement | null>(null)

  const printLayoutSignature = mockQuestions
    .map((question) =>
      [
        question.id,
        question.type,
        question.topic,
        question.difficulty,
        question.variant,
      ].join(':'),
    )
    .join('|')

  useLayoutEffect(() => {
    if (preparationStage !== 'design' && preparationStage !== 'export') return

    let secondFrame = 0

    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const root = printPagesRef.current
        if (!root) return

        const columns = Array.from(
          root.querySelectorAll<HTMLElement>('.ksq-column'),
        )

        columns.forEach((column) => {
          const questions = Array.from(
            column.querySelectorAll<HTMLElement>('.print-question-wrap'),
          )

          if (questions.length === 0) return

          const solutionAreas = questions
            .map((question) =>
              question.querySelector<HTMLElement>('.measured-solution-space'),
            )
            .filter((element): element is HTMLElement => element !== null)

          // Əvvəl köhnə hesablanmış hündürlükləri sıfırlayırıq ki,
          // brauzerdən yalnız real məzmun hündürlüyünü ölçək.
          solutionAreas.forEach((solution) => {
            solution.style.height = '0px'
          })

          const columnStyle = window.getComputedStyle(column)
          const paddingTop = Number.parseFloat(columnStyle.paddingTop) || 0
          const paddingBottom = Number.parseFloat(columnStyle.paddingBottom) || 0
          const usableHeight =
            column.clientHeight - paddingTop - paddingBottom

          const baseHeights = questions.map((question) => {
            const style = window.getComputedStyle(question)
            const marginTop = Number.parseFloat(style.marginTop) || 0
            const marginBottom = Number.parseFloat(style.marginBottom) || 0

            return question.getBoundingClientRect().height + marginTop + marginBottom
          })

          const occupiedHeight = baseHeights.reduce(
            (sum, height) => sum + height,
            0,
          )

          const freeHeight = Math.max(0, usableHeight - occupiedHeight - 4)

          const weights = questions.map((question) =>
            solutionNeedWeight(question.dataset.questionType ?? ''),
          )

          const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

          solutionAreas.forEach((solution, index) => {
            const share =
              totalWeight > 0
                ? (freeHeight * weights[index]) / totalWeight
                : freeHeight / solutionAreas.length

            solution.style.height = `${Math.max(18, Math.floor(share))}px`
          })
        })
      })
    })

    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [
    builderStep,
    preparationStage,
    printLayoutSignature,
    selectedPageCount,
    selectedVariantIndex,
  ])


  const approveDesign = () => {
    setDesignLocked(true)
    setPreparationStage('final')
  }

  const reopenDesign = () => {
    setDesignLocked(false)
    setPreparationStage('design')
  }

  const openFinalPdfStage = () => {
    setPreparationStage('export')
  }

  const printCurrentVariantPdf = () => {
    window.print()
  }

  const downloadCurrentVariantPdf = () => {
    window.print()
  }

  return (
    <main className="workspace builder-workspace">
      <div className="builder-content refined-builder">
        {!(builderStep === 'review' && preparationStage !== 'review') && (
          <StepIndicator
            currentStep={builderStep}
            selectedPurpose={selectedPurpose}
            selectedClass={selectedClass}
            selectedSection={selectedSection}
            topicsReady={topicsReady}
            parametersReady={parametersReady}
            onNavigate={navigateToStep}
          />
        )}

        {builderStep === 'purpose' && (
          <section className="builder-panel simplified-panel">
            <div className="purpose-grid">
              {purposes.map((purpose) => {
                const Icon = purpose.icon
                const selected = selectedPurpose === purpose.id

                return (
                  <button
                    key={purpose.id}
                    type="button"
                    className={`purpose-card ${purpose.tone} ${selected ? 'selected' : ''} ${purpose.enabled ? '' : 'coming-soon'}`}
                    onClick={() => {
                      if (purpose.enabled) selectPurpose(purpose.id)
                    }}
                  >
                    <div className="purpose-card__icon"><Icon size={28} /></div>
                    <div>
                      <strong>{purpose.title}</strong>
                      <p>{purpose.description}</p>
                    </div>
                    {purpose.enabled
                      ? <ChevronRight className="purpose-card__arrow" size={21} />
                      : <span className="purpose-card__status">Sonra</span>}
                  </button>
                )
              })}
            </div>

            <div className="builder-footer-actions single-left">
              <button className="secondary-action back-left" type="button" onClick={onBack}>
                <ChevronLeft size={18} />Geri
              </button>
            </div>
          </section>
        )}

        {builderStep === 'class' && (
          <section className="builder-panel simplified-panel">
            <div className="class-grid">
              {classes.map((classNumber) => {
                const selected = selectedClass === classNumber

                return (
                  <button
                    key={classNumber}
                    type="button"
                    className={selected ? 'class-card selected' : 'class-card'}
                    onClick={() => selectClass(classNumber)}
                  >
                    <span>{classNumber}</span>
                    <strong>{classNumber}-ci sinif</strong>
                    {selected && <div className="class-card__check"><Check size={16} /></div>}
                  </button>
                )
              })}
            </div>

            <div className="builder-footer-actions">
              <button className="secondary-action back-left" type="button" onClick={() => setBuilderStep('purpose')}>
                <ChevronLeft size={18} />Geri
              </button>

              <button
                className="primary-action next-right"
                type="button"
                disabled={selectedClass === null}
                onClick={() => setBuilderStep('section')}
              >
                Davam et<ChevronRight size={19} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'section' && (
          <section className="builder-panel simplified-panel">
            <div className="section-choice-grid">
              {temporarySections.map((section) => {
                const selected = selectedSection === section

                return (
                  <button
                    key={section}
                    type="button"
                    className={selected ? 'section-choice-card selected' : 'section-choice-card'}
                    onClick={() => selectSection(section)}
                  >
                    <div className="section-choice-card__number">
                      {section.replace('Bölmə ', '')}
                    </div>
                    <strong>{section}</strong>
                    {selected && <div className="section-choice-card__check"><Check size={16} /></div>}
                  </button>
                )
              })}
            </div>

            <div className="builder-footer-actions">
              <button className="secondary-action back-left" type="button" onClick={() => setBuilderStep('class')}>
                <ChevronLeft size={18} />Geri
              </button>

              <button
                className="primary-action next-right"
                type="button"
                disabled={selectedSection === null}
                onClick={() => setBuilderStep('topics')}
              >
                Davam et<ChevronRight size={19} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'topics' && (
          <section className="builder-panel simplified-panel">
            <div className="topics-toolbar">
              <div>
                <strong>Mövzuları seçin</strong>
                <span>Bir və ya bir neçə mövzu seçə bilərsiniz.</span>
              </div>

              <button
                type="button"
                className={aiSelectTopics ? 'ai-choice active' : 'ai-choice'}
                onClick={toggleAiSelectTopics}
              >
                <Sparkles size={18} />
                AI seçsin
                {aiSelectTopics && <Check size={16} />}
              </button>
            </div>

            <div className={aiSelectTopics ? 'topics-grid ai-disabled' : 'topics-grid'}>
              {temporaryTopics.map((topic) => {
                const selected = selectedTopics.includes(topic)

                return (
                  <button
                    key={topic}
                    type="button"
                    disabled={aiSelectTopics}
                    className={selected ? 'topic-card selected' : 'topic-card'}
                    onClick={() => toggleTopic(topic)}
                  >
                    <div className="topic-card__icon">
                      <BookOpenCheck size={23} />
                    </div>

                    <strong>{topic}</strong>

                    {selected && (
                      <div className="topic-card__check">
                        <Check size={16} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {aiSelectTopics && (
              <div className="ai-topic-note">
                <Sparkles size={18} />
                <span>
                  Mövzular AI tərəfindən seçiləcək. Sonrakı mərhələdə bu seçim
                  müəllimə göstəriləcək və dəyişdirilə biləcək.
                </span>
              </div>
            )}

            <div className="builder-footer-actions">
              <button className="secondary-action back-left" type="button" onClick={() => setBuilderStep('section')}>
                <ChevronLeft size={18} />Geri
              </button>

              <button
                className="primary-action next-right"
                type="button"
                disabled={!topicsReady}
                onClick={() => setBuilderStep('parameters')}
              >
                Davam et<ChevronRight size={19} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'parameters' && (
          <section className="builder-panel simplified-panel parameter-panel parameter-redesign">
            <div className="parameters-toolbar">
              <div className="parameters-toolbar__title">
                <div className="parameters-toolbar__icon">
                  <Settings size={20} />
                </div>
                <div>
                  <h2>Parametrlər</h2>
                  <p>Testin strukturunu və sual bölgüsünü müəyyən edin.</p>
                </div>
              </div>

              <div className="parameters-toolbar__actions">
                <button className="ai-helper-chip" type="button">
                  <Sparkles size={16} />
                  <span>
                    <strong>AI köməkçisi</strong>
                    <small>Kontekstə uyğun təkliflər verir</small>
                  </span>
                </button>

                <button className="template-upload-button" type="button">
                  <FilePlus2 size={16} />
                  Şablonu yüklə
                </button>
              </div>
            </div>

            <div className="parameters-layout">
              <div className="parameters-main">
                <div className="parameter-top-row">
                  <div className="parameter-card top-parameter-card">
                    <div className="parameter-card__head">
                      <div>
                        <strong>Ümumi sual sayı</strong>
                        <span>Maksimum {KSQ_MAX_QUESTIONS} sual</span>
                      </div>
                    </div>

                    <div className="number-stepper large-stepper">
                      <button
                        type="button"
                        onClick={() =>
                          setQuestionCount((value) => Math.max(1, value - 1))
                        }
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={KSQ_MAX_QUESTIONS}
                        value={questionCount}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          const next = Math.trunc(Number(event.target.value) || 1)
                          setQuestionCount(
                            Math.min(KSQ_MAX_QUESTIONS, Math.max(1, next)),
                          )
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQuestionCount((value) =>
                            Math.min(KSQ_MAX_QUESTIONS, value + 1),
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="parameter-card top-parameter-card difficulty-card">
                    <div className="parameter-card__head">
                      <div>
                        <strong>Çətinlik dərəcəsi</strong>
                        <span>Sayları siz müəyyən edirsiniz.</span>
                      </div>

                      <button
                        className="ai-suggestion-button"
                        type="button"
                        onClick={applyAiDifficultySuggestion}
                      >
                        <Sparkles size={16} />
                        AI təklif et
                      </button>
                    </div>

                    <div className="mini-distribution-cards three">
                      {[
                        {
                          key: 'easy',
                          label: 'Asan',
                          value: difficultyEasy,
                          tone: 'green',
                        },
                        {
                          key: 'medium',
                          label: 'Orta',
                          value: difficultyMedium,
                          tone: 'blue',
                        },
                        {
                          key: 'hard',
                          label: 'Çətin',
                          value: difficultyHard,
                          tone: 'red',
                        },
                      ].map((item) => (
                        <div className={`mini-distribution-card ${item.tone}`} key={item.key}>
                          <strong className="difficulty-label">
                            <span
                              className={`difficulty-smiley ${item.key}`}
                              aria-hidden="true"
                            />
                            {item.label}
                          </strong>
                          <div className="mini-stepper">
                            <button
                              type="button"
                              onClick={() =>
                                setDifficultyValue(
                                  item.key as 'easy' | 'medium' | 'hard',
                                  String(Math.max(0, item.value - 1)),
                                )
                              }
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={item.value}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                setDifficultyValue(
                                  item.key as 'easy' | 'medium' | 'hard',
                                  event.target.value,
                                )
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDifficultyValue(
                                  item.key as 'easy' | 'medium' | 'hard',
                                  String(item.value + 1),
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                          <div className="distribution-progress">
                            <span
                              style={{
                                width: `${Math.min(
                                  100,
                                  (item.value / Math.max(1, questionCount)) * 100,
                                )}%`,
                              }}
                            />
                            <small>{item.value}/{questionCount}</small>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="compact-total-line">
                      <span className={difficultyStatus.className}>
                        {difficultyStatus.text}
                      </span>
                    </div>
                  </div>

                  <div className="parameter-card top-parameter-card">
                    <div className="parameter-card__head">
                      <div>
                        <strong>Variant sayı</strong>
                        <span>Eyni parametrlərlə fərqli suallar.</span>
                      </div>
                    </div>

                    <select
                      className="variant-select"
                      value={variantCount}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setVariantCount(next)
                        setSelectedVariantIndex(0)
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((count) => (
                        <option key={count} value={count}>
                          {count} variant
                        </option>
                      ))}
                    </select>

                    <div className="variant-pills">
                      {variantLetters.map((letter) => (
                        <span key={letter}>{letter}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="parameter-card">
                  <div className="parameter-card__head">
                    <div>
                      <strong>Sual tipləri üzrə bölgü</strong>
                      <span>Sayları yalnız istifadəçi müəyyən edir.</span>
                    </div>
                    <strong className="section-total">
                      Cəmi: {manualQuestionTypeTotal}/{questionCount}
                    </strong>
                  </div>

                  <div className="type-cards-grid">
                    {questionTypes.map((type, typeIndex) => {
                      const currentValue = questionTypeDistribution[type] ?? 0
                      const currentContribution =
                        currentValue * questionTypeWeight(type)
                      const remainingForThisType = Math.max(
                        0,
                        questionCount -
                          (manualQuestionTypeTotal - currentContribution),
                      )
                      const maxAllowed =
                        type === 'Situasiya'
                          ? Math.floor(remainingForThisType / 3)
                          : remainingForThisType
                      const countedQuestions =
                        type === 'Situasiya' ? currentValue * 3 : currentValue
                      const ui =
                        questionTypeUi[type as keyof typeof questionTypeUi]
                      const TypeIcon = ui.icon

                      return (
                        <div className={`type-distribution-card ${ui.tone}`} key={type}>
                          <div className="type-card-title accepted">
                            <div className="type-card-icon">
                              <TypeIcon size={18} />
                            </div>
                            <div className="type-card-copy">
                              <strong>
                                <b>{typeIndex + 1}.</b> {type}
                              </strong>
                              {ui.shortHint && <small>{ui.shortHint}</small>}
                              {type === 'Situasiya' && (
                                <small className="situation-header-note">
                                  (Hər situasiya 3 sualdır)
                                </small>
                              )}
                            </div>
                          </div>

                          <div className="mini-stepper">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuestionTypeDistribution(
                                  type,
                                  String(Math.max(0, currentValue - 1)),
                                )
                              }
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxAllowed}
                              value={currentValue}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                updateQuestionTypeDistribution(type, event.target.value)
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateQuestionTypeDistribution(
                                  type,
                                  String(currentValue + 1),
                                )
                              }
                            >
                              +
                            </button>
                          </div>

                          <div className="distribution-progress">
                            <span
                              style={{
                                width: `${Math.min(
                                  100,
                                  (countedQuestions / Math.max(1, questionCount)) * 100,
                                )}%`,
                              }}
                            />
                            <small>{countedQuestions}/{questionCount}</small>
                          </div>

                        </div>
                      )
                    })}
                  </div>

                  <div className="compact-total-line">
                    <span className={questionTypeStatus.className}>
                      {questionTypeStatus.text}
                    </span>
                    {questionTypeLimitMessage && (
                      <span className="limit-inline-error">
                        {questionTypeLimitMessage}
                      </span>
                    )}
                  </div>
                </div>

                {!aiSelectTopics && (
                  <div className="parameter-card">
                    <div className="parameter-card__head">
                      <div>
                        <strong>Mövzular üzrə bölgü</strong>
                        <span>Sual sayı ilə müəyyən edilir.</span>
                      </div>

                      <div className="parameter-head-actions">
                        <strong className="section-total">
                          Cəmi: {manualTopicTotal}/{questionCount}
                        </strong>
                        <button
                          className="ai-suggestion-button"
                          type="button"
                          onClick={applyAiTopicSuggestion}
                        >
                          <Sparkles size={16} />
                          AI təklif et
                        </button>
                      </div>
                    </div>

                    <div className="topic-distribution-grid">
                      {selectedTopics.map((topic, index) => {
                        const value = topicDistribution[topic] ?? 0
                        const topicTones = ['violet', 'blue', 'green', 'orange', 'teal']
                        return (
                          <div
                            className={`topic-distribution-card ${
                              topicTones[index % topicTones.length]
                            }`}
                            key={topic}
                          >
                            <strong>{topic}</strong>
                            <div className="mini-stepper">
                              <button
                                type="button"
                                onClick={() =>
                                  updateTopicDistribution(
                                    topic,
                                    String(Math.max(0, value - 1)),
                                  )
                                }
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={value}
                                onFocus={(event) => event.currentTarget.select()}
                                onChange={(event) =>
                                  updateTopicDistribution(topic, event.target.value)
                                }
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateTopicDistribution(topic, String(value + 1))
                                }
                              >
                                +
                              </button>
                            </div>
                            <div className="distribution-progress">
                              <span
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (value / Math.max(1, questionCount)) * 100,
                                  )}%`,
                                }}
                              />
                              <small>{value}/{questionCount}</small>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="compact-total-line">
                      <span className={topicStatus.className}>{topicStatus.text}</span>
                      {topicLimitMessage && (
                        <span className="limit-inline-error">{topicLimitMessage}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="parameter-card">
                  <div className="parameter-card__head">
                    <div>
                      <strong>Digər parametrlər</strong>
                      <span>Vaxt və ümumi bal.</span>
                    </div>
                  </div>

                  <div className="other-parameters-grid accepted-two">
                    <div className="small-setting-card accepted-setting-card time-card">
                      <div className="accepted-setting-title">
                        <div className="setting-icon violet">
                          <ClockIcon />
                        </div>
                        <span>İcazə verilən vaxt</span>
                      </div>

                      <div className="mini-stepper compact-setting-stepper">
                        <button
                          type="button"
                          onClick={() =>
                            setDurationMinutes((value) => Math.max(1, value - 5))
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={durationMinutes}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            setDurationMinutes(
                              Math.max(1, Math.trunc(Number(event.target.value) || 1)),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setDurationMinutes((value) => value + 5)}
                        >
                          +
                        </button>
                      </div>

                      <small className="ai-inline-note">
                        <Sparkles size={12} />
                        AI təxmini: {estimatedMinutes} dəqiqə
                      </small>
                    </div>

                    <div className="small-setting-card accepted-setting-card score-card">
                      <div className="accepted-setting-title">
                        <div className="setting-icon amber">★</div>
                        <span>Ümumi bal</span>
                      </div>

                      <strong className="setting-main-value">100 bal</strong>
                      <small>Bal bölgüsü suallar seçildikdən sonra hazırlanır.</small>
                    </div>
                  </div>
                </div>

                <div className="parameter-lock-warning">
                  <strong>Diqqət!</strong>
                  <span>
                    Yoxlama mərhələsindən və ödənişdən sonra parametrlərdə heç bir
                    dəyişiklik qəbul edilməyəcək. Bütün seçimləri diqqətlə yoxlayın.
                  </span>
                </div>

                <div className="builder-footer-actions">
                  <button
                    className="secondary-action back-left"
                    type="button"
                    onClick={() => setBuilderStep('topics')}
                  >
                    <ChevronLeft size={18} />Geri
                  </button>

                  <button
                    className="primary-action next-right"
                    type="button"
                    disabled={!parametersReady}
                    onClick={() => {
                      setFinalReviewAccepted(false)
                      setBuilderStep('review')
                    }}
                  >
                    Yoxlamaya keç<ChevronRight size={19} />
                  </button>
                </div>
              </div>

              <aside className="parameters-summary">
                <div className="summary-card accepted-summary-card">
                  <div className="summary-card-title">
                    <ClipboardList size={18} />
                    <strong>Test xülasəsi</strong>
                  </div>

                  <div className="summary-basic-grid">
                    <div><span>Sinif</span><strong>{selectedClass}-ci sinif</strong></div>
                    <div><span>Fənn</span><strong>Riyaziyyat</strong></div>
                    <div><span>Ümumi sual sayı</span><strong>{questionCount} (maks. 25)</strong></div>
                    <div>
                      <span>Çətinlik dərəcəsi</span>
                      <strong>
                        Asan: {difficultyEasy} &nbsp;|&nbsp; Orta: {difficultyMedium}
                        &nbsp;|&nbsp; Çətin: {difficultyHard}
                      </strong>
                    </div>
                    <div>
                      <span>Testin ümumi səviyyəsi</span>
                      <strong className="ai-level-pill">{overallDifficultyLabel}</strong>
                    </div>
                    <div>
                      <span>Variant sayı</span>
                      <strong>{variantCount} ({variantLetters.join(', ')})</strong>
                    </div>
                  </div>

                  <div className="summary-divider" />

                  <div className="accepted-summary-section">
                    <strong>Sual tipləri üzrə</strong>
                    <div className="summary-dot-list">
                      {questionTypes.map((type) => {
                        const value = questionTypeDistribution[type] ?? 0
                        const counted =
                          type === 'Situasiya' ? value * 3 : value
                        const ui =
                          questionTypeUi[type as keyof typeof questionTypeUi]

                        return (
                          <div key={type}>
                            <i className={`summary-dot ${ui.tone}`} />
                            <span>{type}</span>
                            <b>{counted}</b>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {!aiSelectTopics && (
                    <>
                      <div className="summary-divider" />
                      <div className="accepted-summary-section">
                        <strong>Mövzular üzrə</strong>
                        <div className="summary-dot-list topics">
                          {selectedTopics.map((topic) => (
                            <div key={topic}>
                              <i className="summary-dot neutral" />
                              <span>{topic}</span>
                              <b>{topicDistribution[topic] ?? 0}</b>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="summary-divider" />

                  <div className="accepted-summary-section">
                    <strong>Digər məlumatlar</strong>
                    <div className="summary-other-info">
                      <div>
                        <span>İcazə verilən vaxt</span>
                        <b>{durationMinutes} dəqiqə</b>
                        <em>
                          <Sparkles size={11} />
                          AI təxmini: {estimatedMinutes} dəq.
                        </em>
                      </div>
                      <div>
                        <span>Ümumi bal</span>
                        <b>100 bal</b>
                      </div>
                      <div>
                        <span>Səhifə sayı</span>
                        <b>Dizayn mərhələsində seçiləcək</b>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="payment-summary-card accepted-payment-card">
                  <div className="summary-card-title payment">
                    <CreditCard size={18} />
                    <strong>Ödəniş məlumatları</strong>
                  </div>

                  <div>
                    <span>1 variantın qiyməti</span>
                    <b>{paymentUnitPriceLabel}</b>
                  </div>
                  <div>
                    <span>Variant sayı</span>
                    <b>{variantCount}</b>
                  </div>
                  <div className="payment-total">
                    <span>Yekun məbləğ</span>
                    <b>{paymentTotalLabel}</b>
                  </div>

                  <small>
                    Ödəniş yoxlama mərhələsindən sonra tələb olunacaq.
                  </small>
                </div>

                <div className="summary-payment-note">
                  <span>i</span>
                  Ödəniş tamamlandıqdan sonra sistem testləri hazırlamağa başlayacaq
                  və növbəti mərhələlər aktiv olacaq.
                </div>
              </aside>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'review' && (
          <section className="builder-panel simplified-panel review-panel review-clean">
            <div className="review-clean-header">
              <div>
                <span className="review-kicker">Son mərhələ</span>
                <h2>Son yoxlama</h2>
                <p>
                  Parametrləri bir dəfə də yoxlayın. Bu mərhələdən və ödənişdən
                  sonra test parametrləri kilidlənəcək.
                </p>
              </div>

              <div className="review-score-pill">
                <span>Ümumi bal</span>
                <strong>100</strong>
                <small>bal</small>
              </div>
            </div>

            <div className="review-clean-layout">
              <div className="review-clean-main">
                <div className="review-section-card">
                  <div className="review-section-title">
                    <ClipboardList size={17} />
                    <strong>Əsas seçimlər</strong>
                  </div>

                  <div className="review-facts-grid">
                    <div className="review-fact">
                      <span>Təyinat</span>
                      <strong>KSQ</strong>
                    </div>
                    <div className="review-fact">
                      <span>Sinif</span>
                      <strong>{selectedClass}-ci sinif</strong>
                    </div>
                    <div className="review-fact">
                      <span>Bölmə</span>
                      <strong>{selectedSection}</strong>
                    </div>
                    <div className="review-fact wide">
                      <span>Mövzu(lar)</span>
                      <strong>
                        {aiSelectTopics
                          ? 'AI tərəfindən seçiləcək'
                          : selectedTopics.join(', ')}
                      </strong>
                    </div>
                    <div className="review-fact">
                      <span>Sual sayı</span>
                      <strong>{questionCount}</strong>
                    </div>
                    <div className="review-fact">
                      <span>Test müddəti</span>
                      <strong>{durationMinutes} dəqiqə</strong>
                    </div>
                    <div className="review-fact">
                      <span>Variant sayı</span>
                      <strong>{variantCount} ({variantLetters.join(', ')})</strong>
                    </div>
                    <div className="review-fact">
                      <span>AI ümumi səviyyə</span>
                      <strong className="review-ai-level">{overallDifficultyLabel}</strong>
                    </div>
                  </div>
                </div>

                <div className="review-section-card">
                  <div className="review-section-title">
                    <Sparkles size={17} />
                    <strong>Çətinlik bölgüsü</strong>
                    <span className="review-section-total">
                      Cəmi: {difficultyEasy + difficultyMedium + difficultyHard}/{questionCount}
                    </span>
                  </div>

                  <div className="review-difficulty-grid">
                    {[
                      { label: 'Asan', value: difficultyEasy, tone: 'easy', face: '••' },
                      { label: 'Orta', value: difficultyMedium, tone: 'medium', face: '••' },
                      { label: 'Çətin', value: difficultyHard, tone: 'hard', face: '••' },
                    ].map((item) => (
                      <div className={`review-difficulty-item ${item.tone}`} key={item.label}>
                        <div className="review-difficulty-top">
                          <span className="review-face">{item.face}</span>
                          <strong>{item.label}</strong>
                          <b>{item.value} sual</b>
                        </div>
                        <div className="review-progress-track">
                          <span
                            style={{
                              width: `${Math.min(
                                100,
                                (item.value / Math.max(1, questionCount)) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="review-section-card">
                  <div className="review-section-title">
                    <BookOpenCheck size={17} />
                    <strong>Mövzular üzrə bölgü</strong>
                    {(aiSelectTopics || aiTopicDistribution) && (
                      <span className="review-ai-chip">
                        <Sparkles size={12} />
                        AI
                      </span>
                    )}
                  </div>

                  <div className="review-topic-chips">
                    {aiSelectTopics ? (
                      <span className="review-empty-text">
                        Mövzular AI tərəfindən seçiləcək.
                      </span>
                    ) : (
                      selectedTopics.map((topic, index) => (
                        <div className="review-topic-chip" key={topic}>
                          <i className={`topic-dot tone-${index % 5}`} />
                          <span>{topic}</span>
                          <strong>{topicDistribution[topic] ?? 0}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="review-section-card">
                  <div className="review-section-title">
                    <Target size={17} />
                    <strong>Sual tipləri və bölgüsü</strong>
                    <span className="review-section-total">
                      Cəmi: {manualQuestionTypeTotal}/{questionCount}
                    </span>
                  </div>

                  <div className="review-type-grid">
                    {questionTypes.map((type) => {
                      const ui =
                        questionTypeUi[type as keyof typeof questionTypeUi]
                      const TypeIcon = ui.icon
                      const raw = questionTypeDistribution[type] ?? 0
                      const counted = type === 'Situasiya' ? raw * 3 : raw

                      return (
                        <div className={`review-type-item ${ui.tone}`} key={type}>
                          <div className="review-type-icon">
                            <TypeIcon size={16} />
                          </div>
                          <div className="review-type-copy">
                            <strong>{type}</strong>
                            <span>{counted} sual</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
<label className="final-confirmation-box review-final-confirmation">
                  <input
                    type="checkbox"
                    checked={finalReviewAccepted}
                    onChange={(event) => setFinalReviewAccepted(event.target.checked)}
                  />
                  <span>
                    Bütün seçimləri diqqətlə yoxladım. Ödənişdən sonra bu testin
                    parametrlərinin dəyişdirilməyəcəyini anlayıram.
                  </span>
                </label>
              </div>

              <aside className="review-clean-side">
                <div className="review-payment-card">
                  <div className="review-side-title payment">
                    <CreditCard size={18} />
                    <strong>Ödəniş məlumatları</strong>
                  </div>

                  <div className="review-payment-row">
                    <span>1 variantın qiyməti</span>
                    <strong>{paymentUnitPriceLabel}</strong>
                  </div>
                  <div className="review-payment-row">
                    <span>Variant sayı</span>
                    <strong>{variantCount}</strong>
                  </div>
                  <div className="review-payment-total">
                    <span>Yekun məbləğ</span>
                    <strong>{paymentTotalLabel}</strong>
                  </div>

                  <small>
                    Ödəniş tamamlandıqdan sonra sistem test variantlarını
                    hazırlamağa başlayacaq.
                  </small>
                </div>

                <div className="review-lock-card">
                  <div className="review-lock-icon">
                    <Check size={18} />
                  </div>
                  <div>
                    <strong>Dəyişikliklər kilidlənəcək</strong>
                    <p>
                      Ödənişdən sonra Təyinat, Sinif, Mövzular, sual sayı,
                      çətinlik, sual tipləri və variant sayı dəyişdirilməyəcək.
                    </p>
                  </div>
                </div>
              </aside>
            </div>

            <div className="builder-footer-actions review-footer-actions">
              <button
                className="secondary-action back-left"
                type="button"
                onClick={() => {
                  if (!parametersLocked) {
                    setPreparationStage('review')
                    setBuilderStep('parameters')
                  }
                }}
                disabled={parametersLocked}
              >
                <ChevronLeft size={18} />Geri
              </button>

              <button
                className="primary-action prepare-test-button"
                type="button"
                onClick={prepareTest}
                disabled={!finalReviewAccepted}
              >
                <Sparkles size={18} />
                Testi hazırla
              </button>
            </div>
          </section>
        )}


        {builderStep === 'review' && preparationStage === 'use-mode' && (
          <section className="builder-panel simplified-panel usage-mode-panel">
            <div className="usage-mode-header">
              <span className="processing-eyebrow">İstifadə forması</span>
              <h2>KSQ-dən necə istifadə edəcəksiniz?</h2>
              <p>
                Hazırlanacaq KSQ üçün istifadə formasını seçin.
              </p>
            </div>

            <div className="usage-mode-grid">
              <button
                type="button"
                className={`usage-mode-card pdf ${testUsageMode === 'pdf' ? 'selected' : ''}`}
                onClick={choosePdfMode}
              >
                <div className="usage-mode-visual pdf">
                  <FilePlus2 size={34} />
                </div>

                <div className="usage-mode-copy">
                  <strong>PDF / Çap</strong>
                  <p>
                    KSQ-ni PDF formatında hazırlayın və çap üçün əldə edin.
                  </p>
                </div>

                <span className="usage-mode-action">
                  PDF / Çap seç
                  <ChevronRight size={17} />
                </span>
              </button>

              <button
                type="button"
                className={`usage-mode-card online ${testUsageMode === 'online' ? 'selected' : ''}`}
                onClick={chooseOnlineMode}
              >
                <div className="usage-mode-visual online">
                  <Users size={34} />
                </div>

                <div className="usage-mode-copy">
                  <strong>Onlayn test</strong>
                  <p>
                    KSQ-ni sistemdəki şagirdlərə təyin edin və nəticələri
                    sistem üzərindən izləyin.
                  </p>
                </div>

                <div className="usage-mode-lock-note">
                  <span className="usage-lock-icon" aria-hidden="true">🔒</span>
                  <strong>
                    Müəllim test suallarını imtahan bitdikdən sonra görə biləcək.
                  </strong>
                </div>

                <span className="usage-mode-action">
                  Onlayn test seç
                  <ChevronRight size={17} />
                </span>
              </button>
            </div>

            <div className="builder-footer-actions single-left usage-mode-footer">
              <button
                className="secondary-action back-left"
                type="button"
                onClick={() => {
                  setTestUsageMode(null)
                  setPreparationStage('review')
                }}
              >
                <ChevronLeft size={18} />
                Geri
              </button>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'online-students' && (
          <section className="builder-panel simplified-panel online-students-panel">
            <div className="online-flow-steps" aria-label="Onlayn test mərhələləri">
              {[
                'İstifadə formasının seçilməsi',
                'Şagirdlərin seçilməsi',
                'Zaman parametrləri',
                'Təqdim və hazırlıq',
                'Testin aktivləşməsi',
              ].map((label, index) => (
                <div
                  className={`online-flow-step ${index === 0 ? 'done' : ''} ${index === 1 ? 'active' : ''}`}
                  key={label}
                >
                  <span>{index === 0 ? <Check size={14} /> : index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>

            <div className="online-students-heading">
              <div className="online-heading-icon">
                <Users size={23} />
              </div>
              <div>
                <h2>Şagirdləri seçin</h2>
                <p>Onlayn KSQ-ni işləyəcək şagirdləri müəyyən edin.</p>
              </div>
            </div>

            <div className="online-students-layout">
              <div className="online-students-main">
                <section className="online-selection-card">
                  <div className="online-selection-title">
                    <strong>1. Sinif və ya qrup(lar) seçin</strong>
                    <span>Sistemdəki sinif və ya qruplardan birini və ya bir neçəsini seçin.</span>
                  </div>

                  <div className="online-group-list">
                    {onlineGroups.map((group) => {
                      const checked = selectedOnlineGroupIds.includes(group.id)
                      return (
                        <label
                          className={`online-group-row ${checked ? 'selected' : ''}`}
                          key={group.id}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOnlineGroup(group.id)}
                          />
                          <span className="online-group-avatar">
                            <Users size={15} />
                          </span>
                          <strong>{group.name}</strong>
                          <b>{group.studentIds.length} şagird</b>
                          <ChevronDown size={15} />
                        </label>
                      )
                    })}
                  </div>
                </section>

                <section className="online-selection-card">
                  <div className="online-selection-title">
                    <strong>2. Digər şagirdləri əlavə edin <em>(istəyə bağlı)</em></strong>
                    <span>
                      Başqa sinif və ya qruplardakı sistemdə qeydiyyatda olan
                      şagirdləri ayrıca seçib əlavə edə bilərsiniz.
                    </span>
                  </div>

                  <button
                    className="online-add-student-button"
                    type="button"
                    onClick={() => setShowExtraStudentPicker((current) => !current)}
                  >
                    <Plus size={16} />
                    Digər şagirdləri əlavə et
                  </button>

                  {showExtraStudentPicker && (
                    <div className="online-extra-picker">
                      <label className="online-student-search">
                        <Search size={15} />
                        <input
                          value={onlineStudentSearch}
                          onChange={(event) => setOnlineStudentSearch(event.target.value)}
                          placeholder="Şagird axtarın..."
                        />
                      </label>

                      <div className="online-extra-picker-list">
                        {filteredExtraOnlineStudents.map((student) => {
                          const checked = extraOnlineStudentIds.includes(student.id)
                          return (
                            <label
                              className={`online-extra-picker-row ${checked ? 'selected' : ''}`}
                              key={student.id}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleExtraOnlineStudent(student.id)}
                              />
                              <span>{student.name}</span>
                              <small>{student.className}</small>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {extraOnlineStudentIds.length > 0 && (
                    <div className="online-extra-selected">
                      <div className="online-extra-selected-head">
                        <strong>Əlavə edilmiş şagirdlər ({extraOnlineStudentIds.length})</strong>
                      </div>

                      {extraOnlineStudentIds.map((studentId) => {
                        const student = onlineStudents.find((item) => item.id === studentId)
                        if (!student) return null

                        return (
                          <div className="online-extra-student-row" key={student.id}>
                            <span className="online-student-avatar">
                              {student.name.slice(0, 1)}
                            </span>
                            <strong>{student.name}</strong>
                            <small>{student.className}</small>
                            <button
                              type="button"
                              title="Seçimdən çıxar"
                              onClick={() => toggleExtraOnlineStudent(student.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="online-dedup-rule">
                    <Info size={15} />
                    <span>
                      Eyni şagird bir qrupdan və ayrıca seçilərsə, sistem onu
                      bir dəfə nəzərə alacaq.
                    </span>
                  </div>
                </section>
              </div>

              <aside className="online-students-summary">
                <div className="online-summary-count">
                  <span className="online-summary-icon">
                    <Users size={21} />
                  </span>
                  <div>
                    <strong>Seçilib: {selectedOnlineStudents.length} şagird</strong>
                    <small>Unikal şagird sayı</small>
                  </div>
                </div>

                <div className="online-summary-divider" />

                <strong className="online-summary-label">Seçim mənbələri</strong>

                <div className="online-summary-sources">
                  {selectedOnlineGroups.map((group, index) => (
                    <div key={group.id}>
                      <span className={`online-source-dot tone-${index % 4}`} />
                      <span>{group.name}</span>
                      <b>{group.studentIds.length} şagird</b>
                    </div>
                  ))}

                  {extraOnlineStudentIds.length > 0 && (
                    <div>
                      <span className="online-source-dot extra" />
                      <span>Digər şagirdlər</span>
                      <b>{extraOnlineStudentIds.length} şagird</b>
                    </div>
                  )}

                  {selectedOnlineGroups.length === 0 &&
                    extraOnlineStudentIds.length === 0 && (
                      <p className="online-summary-empty">
                        Hələ şagird seçilməyib.
                      </p>
                    )}
                </div>

                {duplicateOnlineStudentCount > 0 && (
                  <div className="online-duplicate-note">
                    <Info size={16} />
                    <span>
                      <strong>{duplicateOnlineStudentCount} şagird təkrar seçilib.</strong>
                      Sistem onları bir dəfə nəzərə alacaq.
                    </span>
                  </div>
                )}

                <div className="online-participation-note">
                  <Info size={16} />
                  <span>
                    Seçdiyiniz şagirdlərin hamısı sistemdə qeydiyyatdan keçmiş
                    olmalıdır.
                  </span>
                </div>
              </aside>
            </div>

            <div className="online-students-footer">
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setParametersLocked(false)
                  setPreparationStage('use-mode')
                }}
              >
                <ChevronLeft size={17} />
                Geri
              </button>

              <button
                className="primary-action"
                type="button"
                disabled={selectedOnlineStudents.length === 0}
                onClick={() => setPreparationStage('online-time')}
              >
                Davam et
                <ChevronRight size={17} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'online-time' && (
          <section className="builder-panel simplified-panel online-time-panel">
            <div className="online-flow-steps" aria-label="Onlayn test mərhələləri">
              {[
                'İstifadə formasının seçilməsi',
                'Şagirdlərin seçilməsi',
                'Zaman parametrləri',
                'Təqdim və hazırlıq',
                'Testin aktivləşməsi',
              ].map((label, index) => (
                <div
                  className={`online-flow-step ${index < 2 ? 'done' : ''} ${index === 2 ? 'active' : ''}`}
                  key={label}
                >
                  <span>{index < 2 ? <Check size={14} /> : index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>

            <div className="online-time-layout">
              <div className="online-time-main">
                <div className="online-time-heading">
                  <div className="online-time-heading-icon">
                    <CalendarDays size={23} />
                  </div>
                  <div>
                    <h2>Zaman parametrləri</h2>
                    <p>Onlayn testin nə zaman aktiv olacağını təyin edin.</p>
                  </div>
                </div>

                <div className="online-time-info">
                  <Info size={15} />
                  <span>
                    Test müddəti KSQ parametrlərindən avtomatik gətirilir və bu
                    mərhələdə dəyişdirilmir.
                  </span>
                </div>

                <div className="online-time-fields">
                  <label className="online-time-field">
                    <span className="online-time-field-icon date">
                      <CalendarDays size={18} />
                    </span>
                    <span className="online-time-field-copy">
                      <strong>İmtahan tarixi</strong>
                      <small>KSQ-nin keçiriləcəyi tarixi seçin.</small>
                    </span>
                    <div className="online-date-input-wrap">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="GG/AA/İİİİ"
                        value={onlineExamDateDisplay}
                        onChange={(event) => {
                          const formatted = formatDateInput(event.target.value)
                          setOnlineExamDateDisplay(formatted)

                          const isoValue = displayDateToIso(formatted)
                          if (isoValue) {
                            setOnlineExamDate(isoValue)
                          } else {
                            setOnlineExamDate('')
                          }
                        }}
                        aria-label="İmtahan tarixi, gün ay il"
                      />
                      <CalendarDays size={15} aria-hidden="true" />
                    </div>
                  </label>

                  <label className="online-time-field">
                    <span className="online-time-field-icon start">
                      <Clock3 size={18} />
                    </span>
                    <span className="online-time-field-copy">
                      <strong>İmtahanın başlama zamanı</strong>
                      <small>İmtahan bu zamandan etibarən aktiv olacaq.</small>
                    </span>
                    <input
                      type="time"
                      value={onlineStartTime}
                      onChange={(event) => setOnlineStartTime(event.target.value)}
                    />
                  </label>

                  <label className="online-time-field">
                    <span className="online-time-field-icon latest">
                      <TimerReset size={18} />
                    </span>
                    <span className="online-time-field-copy">
                      <strong>Sınağa ən gec başlama zamanı</strong>
                      <small>Şagirdlər bu zamana qədər testə başlaya bilərlər.</small>
                    </span>
                    <input
                      type="time"
                      value={onlineLatestStartTime}
                      onChange={(event) =>
                        setOnlineLatestStartTime(event.target.value)
                      }
                    />
                  </label>

                  <div className="online-time-field locked">
                    <span className="online-time-field-icon duration">
                      <Hourglass size={18} />
                    </span>
                    <span className="online-time-field-copy">
                      <strong>Test müddəti (KSQ)</strong>
                      <small>KSQ parametrlərindən avtomatik gətirilir.</small>
                    </span>
                    <div className="online-time-readonly">
                      <strong>{durationMinutes} dəqiqə</strong>
                    </div>
                  </div>

                  <div className="online-time-field calculated">
                    <span className="online-time-field-icon end">
                      <Clock3 size={18} />
                    </span>
                    <span className="online-time-field-copy">
                      <strong>İmtahanın bitmə zamanı</strong>
                      <small>Sistem tərəfindən avtomatik hesablanır.</small>
                    </span>
                    <div className="online-time-calculated-value">
                      <strong>{onlineEndTime}</strong>
                      <small>avtomatik hesablandı</small>
                    </div>
                  </div>
                </div>

                {onlineTimeSettingsValid ? (
                  <div className="online-time-validation success">
                    <CircleCheckBig size={17} />
                    <span>
                      <strong>Zaman parametrləri uyğundur.</strong>
                      {durationMinutes} dəqiqəlik test üçün ən gec başlama zamanı{' '}
                      {onlineLatestStartTime}, bitmə zamanı isə {onlineEndTime}
                      olacaq.
                    </span>
                  </div>
                ) : (
                  <div className="online-time-validation error">
                    <Info size={17} />
                    <span>
                      <strong>Zaman parametrlərini yoxlayın.</strong>
                      {!onlineDateValid
                        ? ' İmtahan tarixi bu gündən əvvəl ola bilməz.'
                        : ' Sınağa ən gec başlama zamanı imtahanın başlama zamanından əvvəl ola bilməz.'}
                    </span>
                  </div>
                )}
              </div>

              <aside className="online-time-summary">
                <div className="online-time-summary-title">
                  <span>
                    <CalendarDays size={21} />
                  </span>
                  <strong>Zaman xülasəsi</strong>
                </div>

                <div className="online-time-timeline">
                  <div className="start">
                    <span />
                    <p>İmtahanın başlama zamanı</p>
                    <strong>{onlineStartTime}</strong>
                  </div>
                  <div className="latest">
                    <span />
                    <p>Sınağa ən gec başlama zamanı</p>
                    <strong>{onlineLatestStartTime}</strong>
                  </div>
                  <div className="duration">
                    <span />
                    <p>Test müddəti</p>
                    <strong>{durationMinutes} dəqiqə</strong>
                  </div>
                  <div className="end">
                    <span />
                    <p>İmtahanın bitmə zamanı</p>
                    <strong>{onlineEndTime}</strong>
                  </div>
                </div>

                <div className="online-time-summary-row">
                  <CalendarDays size={15} />
                  <span>İmtahan tarixi</span>
                  <strong>{onlineExamDateLabel}</strong>
                </div>

                <div className="online-time-summary-row">
                  <Users size={15} />
                  <span>Seçilmiş şagird sayı</span>
                  <strong>{selectedOnlineStudents.length} şagird</strong>
                </div>

                <div className="online-time-summary-note">
                  <Info size={16} />
                  <span>
                    Son giriş {onlineLatestStartTime}-dir. Bu anda başlayan
                    şagirdin {durationMinutes} dəqiqəlik test müddəti{' '}
                    {onlineEndTime}-də başa çatacaq.
                  </span>
                </div>
              </aside>
            </div>

            <div className="online-students-footer online-time-footer">
              <button
                className="secondary-action"
                type="button"
                onClick={() => setPreparationStage('online-students')}
              >
                <ChevronLeft size={17} />
                Geri
              </button>

              <button
                className="primary-action"
                type="button"
                disabled={!onlineTimeSettingsValid}
                onClick={() => setPreparationStage('online-presentation')}
              >
                Davam et
                <ChevronRight size={17} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'online-presentation' && (
          <section className="builder-panel simplified-panel online-presentation-panel">
            <div className="online-flow-steps" aria-label="Onlayn test mərhələləri">
              {[
                'İstifadə formasının seçilməsi',
                'Şagirdlərin seçilməsi',
                'Zaman parametrləri',
                'Təqdim və hazırlıq',
                'Testin aktivləşməsi',
              ].map((label, index) => (
                <div
                  className={`online-flow-step ${index < 3 ? 'done' : ''} ${index === 3 ? 'active' : ''}`}
                  key={label}
                >
                  <span>{index < 3 ? <Check size={14} /> : index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>

            <div className="online-presentation-heading">
              <div>
                <span className="processing-eyebrow">4-cü mərhələ</span>
                <h2>Təqdim və hazırlıq</h2>
                <p>
                  Aşağıda imtahan parametrlərinin yekun xülasəsi göstərilir.
                  Məlumatları diqqətlə yoxlayın.
                </p>
              </div>
            </div>

            <div className="online-presentation-warning">
              <Info size={18} />
              <span>
                <strong>Diqqət!</strong>
                Bu mərhələdən sonra test parametrləri dəyişdirilə bilməyəcək.
                Aktivləşdirmədən əvvəl məlumatları diqqətlə yoxlayın.
              </span>
            </div>

            <div className="online-presentation-layout">
              <section className="online-presentation-summary-card">
                <div className="online-presentation-card-title">
                  <span><ClipboardList size={18} /></span>
                  <strong>İmtahan parametrləri</strong>
                </div>

                <div className="online-presentation-summary-list">
                  <div>
                    <span>Təyinat</span>
                    <strong>{onlinePurposeLabel}</strong>
                  </div>
                  <div>
                    <span>Sinif / Mövzu</span>
                    <strong>{onlineClassTopicLabel || '—'}</strong>
                  </div>
                  <div>
                    <span>Sual sayı</span>
                    <strong>{questionCount} sual</strong>
                  </div>
                  <div>
                    <span>Test müddəti</span>
                    <strong>{durationMinutes} dəqiqə</strong>
                  </div>
                  <div>
                    <span>Variant sayı</span>
                    <strong>{onlineVariantLabel}</strong>
                  </div>
                  <div>
                    <span>Seçilmiş şagird sayı</span>
                    <strong>{selectedOnlineStudents.length} şagird</strong>
                  </div>
                  <div>
                    <span>İmtahan tarixi</span>
                    <strong>{onlineExamDateLabel}</strong>
                  </div>
                  <div>
                    <span>Başlama zamanı</span>
                    <strong>{onlineStartTime}</strong>
                  </div>
                  <div>
                    <span>Sınağa ən gec başlama zamanı</span>
                    <strong>{onlineLatestStartTime}</strong>
                  </div>
                  <div>
                    <span>İmtahanın bitmə zamanı</span>
                    <strong>{onlineEndTime}</strong>
                  </div>
                </div>
              </section>

              <div className="online-presentation-side">
                <section className="online-system-notes-card">
                  <div className="online-system-notes-title">
                    <Info size={17} />
                    <strong>Sistem qeydləri</strong>
                  </div>

                  <div className="online-system-note-row">
                    <span className="online-system-note-icon green">
                      <Users size={16} />
                    </span>
                    <div>
                      <strong>Variantların paylanması</strong>
                      <p>
                        Sistem tərəfindən avtomatik və mümkün qədər bərabər.
                        Eyni sinif və ya qrup daxilində də balans qorunacaq.
                      </p>
                    </div>
                  </div>

                  <div className="online-system-note-row">
                    <span className="online-system-note-icon blue">
                      <CreditCard size={16} />
                    </span>
                    <div>
                      <strong>Şagird ödənişi</strong>
                      <p>Hər bir şagird fərdi şəkildə ödəniş edəcək.</p>
                    </div>
                  </div>

                  <div className="online-system-note-row">
                    <span className="online-system-note-icon violet">
                      <Bookmark size={16} />
                    </span>
                    <div>
                      <strong>Sualların görünməsi</strong>
                      <p>
                        Müəllim test suallarını imtahan bitdikdən sonra görə
                        biləcək.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="online-ai-readiness-card">
                  <div className="online-ai-readiness-title">
                    <Sparkles size={17} />
                    <strong>AI hazırlıq yoxlaması</strong>
                  </div>

                  <div className="online-readiness-list">
                    <div>
                      <CircleCheckBig size={15} />
                      <span>Seçilmiş şagirdlər mövcuddur</span>
                    </div>
                    <div>
                      <CircleCheckBig size={15} />
                      <span>Zaman parametrləri düzgündür</span>
                    </div>
                    <div>
                      <CircleCheckBig size={15} />
                      <span>
                        Variant sayı şagirdlərə balanslı şəkildə paylana bilər
                      </span>
                    </div>
                    <div>
                      <CircleCheckBig size={15} />
                      <span>Bütün əsas parametrlər tamamlanıb</span>
                    </div>
                  </div>

                  <div className="online-ready-banner">
                    <CircleCheckBig size={28} />
                    <div>
                      <strong>Test aktivləşdirməyə hazırdır</strong>
                      <span>Hər şey qaydasındadır.</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="online-presentation-footer">
              <button
                className="secondary-action online-presentation-back"
                type="button"
                onClick={() => setPreparationStage('online-time')}
              >
                <ChevronLeft size={17} />
                <span>
                  <strong>Geri</strong>
                  <small>Zaman parametrlərinə qayıt</small>
                </span>
              </button>

              <button
                className="primary-action online-presentation-confirm"
                type="button"
                disabled={!onlinePresentationReady}
                onClick={() => setPreparationStage('online-activation')}
              >
                <span>
                  <strong>Təsdiq et və davam et</strong>
                  <small>Testin aktivləşməsi mərhələsinə keç</small>
                </span>
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'online-activation' && (
          <section className="builder-panel simplified-panel online-activation-panel">
            {!onlineTestActivated && (
              <div className="online-flow-steps" aria-label="Onlayn test mərhələləri">
                {[
                  'İstifadə formasının seçilməsi',
                  'Şagirdlərin seçilməsi',
                  'Zaman parametrləri',
                  'Təqdim və hazırlıq',
                  'Testin aktivləşməsi',
                ].map((label, index) => (
                  <div
                    className={`online-flow-step ${index < 4 ? 'done' : ''} ${index === 4 ? 'active' : ''}`}
                    key={label}
                  >
                    <span>{index < 4 ? <Check size={14} /> : index + 1}</span>
                    <strong>{label}</strong>
                  </div>
                ))}
              </div>
            )}

            {!onlineTestActivated ? (
              <>
                <div className="online-activation-heading">
                  <span className="processing-eyebrow">5-ci mərhələ</span>
                  <h2>Testin aktivləşdirilməsi</h2>
                  <p>
                    Testi aktivləşdirərək seçilmiş şagirdlərə təyin edin. Test
                    təyin etdiyiniz tarix və zamanda avtomatik aktiv olacaq.
                  </p>
                </div>

                <section className="online-activation-main-card">
                  <div className="online-activation-hero">
                    <div className="online-activation-calendar">
                      <CalendarDays size={38} />
                      <CircleCheckBig size={20} />
                    </div>
                    <div className="online-activation-hero-copy">
                      <h3>Test aktivləşdirilməyə hazırdır</h3>
                      <p>
                        Test seçilmiş şagirdlərə təyin olunacaq və planlaşdırılan
                        zamanda avtomatik aktivləşəcək.
                      </p>
                    </div>
                  </div>

                  <div className="online-activation-time-strip">
                    <div>
                      <CalendarDays size={18} />
                      <span>İmtahan tarixi</span>
                      <strong>{onlineExamDateLabel.replace(/\./g, '/')}</strong>
                    </div>
                    <div>
                      <Clock3 size={18} />
                      <span>Başlama zamanı</span>
                      <strong>{onlineStartTime}</strong>
                    </div>
                    <div>
                      <TimerReset size={18} />
                      <span>Ən gec başlama</span>
                      <strong>{onlineLatestStartTime}</strong>
                    </div>
                    <div>
                      <Clock3 size={18} />
                      <span>Bitmə zamanı</span>
                      <strong>{onlineEndTime}</strong>
                    </div>
                  </div>

                  <div className="online-activation-notes-title">
                    Qeyd edəcəyiniz məqamlar
                  </div>

                  <div className="online-activation-note-grid">
                    <div>
                      <span className="green"><Users size={18} /></span>
                      <div>
                        <strong>Şagirdlərə təyin olunacaq</strong>
                        <p>Seçilmiş <b>{selectedOnlineStudents.length} şagirdə</b> bu test təyin ediləcək.</p>
                      </div>
                    </div>

                    <div>
                      <span className="blue"><CreditCard size={18} /></span>
                      <div>
                        <strong>Fərdi ödəniş</strong>
                        <p>Şagird testi işləmək üçün fərdi ödənişi öz hesabından edəcək.</p>
                      </div>
                    </div>

                    <div>
                      <span className="violet"><Sparkles size={18} /></span>
                      <div>
                        <strong>Avtomatik və balanslı variantlar</strong>
                        <p>Variantlar avtomatik və mümkün qədər bərabər, qrup daxilində də balanslı paylanacaq.</p>
                      </div>
                    </div>

                    <div>
                      <span className="orange"><Bookmark size={18} /></span>
                      <div>
                        <strong>Suallar imtahandan sonra</strong>
                        <p>Müəllim test suallarını imtahan bitdikdən sonra görə biləcək.</p>
                      </div>
                    </div>
                  </div>

                  <div className="online-activation-warning">
                    <Info size={18} />
                    <span>
                      <strong>Diqqət!</strong>
                      Test aktivləşdirildikdən sonra əsas parametrləri dəyişmək mümkün olmayacaq.
                    </span>
                  </div>
                </section>

                <div className="online-activation-action">
                  <button
                    className="primary-action online-activate-button"
                    type="button"
                    onClick={() => setOnlineTestActivated(true)}
                  >
                    <CircleCheckBig size={19} />
                    Testi aktivləşdir
                  </button>
                  <small>Aktivləşdirildikdən sonra parametrlər kilidlənəcək.</small>
                </div>

                <section className="online-activation-process">
                  <div className="online-activation-process-copy">
                    <CircleCheckBig size={25} />
                    <div>
                      <strong>Test aktivləşdirildikdən sonra proses belə davam edəcək:</strong>
                      <div className="online-activation-process-steps">
                        <span>Şagirdlərə test təyin olunur</span>
                        <ChevronRight size={14} />
                        <span>Şagirdlərə bildiriş göndərilir</span>
                        <ChevronRight size={14} />
                        <span>Təyin olunan zamanda test avtomatik aktiv olacaq</span>
                        <ChevronRight size={14} />
                        <span>Ödəniş edən şagirdlər testə daxil ola biləcək</span>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <section className="online-activation-success-card">
                <div className="online-activation-success-icon">
                  <CircleCheckBig size={42} />
                </div>
                <span className="processing-eyebrow">Uğurla tamamlandı</span>
                <h2>Onlayn KSQ uğurla planlaşdırıldı</h2>

                <div className="online-activation-success-actions">
                  <button
                    className="primary-action"
                    type="button"
                    onClick={onOpenOnlineTests}
                  >
                    Onlayn testlərimə keç
                    <ChevronRight size={17} />
                  </button>
                  <button className="secondary-action" type="button" onClick={onBack}>
                    Ana səhifəyə qayıt
                  </button>
                </div>
              </section>
            )}
          </section>
        )}

        {paymentOpen && (
          <div className="payment-modal-backdrop">
            <div className="payment-modal">
              <span className="processing-eyebrow">Ödəniş</span>
              <h2>Testi hazırlamaq üçün ödənişi tamamlayın</h2>
              <p>
                Seçilmiş variant sayı: <strong>{variantCount}</strong>. Ödəniş
                tamamlandıqdan sonra parametrlər kilidlənəcək və test variantları
                hazırlanmağa başlayacaq.
              </p>

              <div className="payment-modal-price">
                <span>1 variantın qiyməti</span>
                <strong>{paymentUnitPriceLabel}</strong>
              </div>

              <div className="payment-modal-price total">
                <span>Yekun məbləğ</span>
                <strong>{paymentTotalLabel}</strong>
              </div>

              <div className="payment-modal-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => {
                    setPaymentOpen(false)
                    setTestUsageMode(null)
                  }}
                >
                  Geri
                </button>
                <button
                  className="primary-action"
                  type="button"
                  onClick={completePayment}
                >
                  Ödənişə keç
                  <ChevronRight size={18} />
                </button>
              </div>

              <small>
                Bu mərhələdə ödəniş provayderi hələ qoşulmayıb; düymə prototip
                axınını davam etdirir.
              </small>
            </div>
          </div>
        )}

        {builderStep === 'review' && preparationStage === 'preview' && (
          <section className="builder-panel simplified-panel test-preview-panel">
            <div className="preview-header">
              <div>
                <span className="processing-eyebrow">İlkin test baxışı</span>
                <h2>KSQ layihəsi hazırdır</h2>
                <p>
                  Aşağıdakı suallar hələlik prototipdir. Real sual bazası və AI
                  qoşulduqda bu kartlarda faktiki suallar görünəcək.
                </p>
              </div>

              <div className="preview-summary">
                <span>{questionCount} sual</span>
                <span>100 bal</span>
                <span>{durationMinutes} dəq müəllim vaxtı</span>
                <span>{estimatedMinutes} dəq AI təxmini</span>
              </div>
            </div>

            {paymentCompleted && (
              <div className="payment-completed-note">
                <Check size={16} />
                Ödəniş mərhələsi tamamlandı. Parametrlər kilidlənib.
              </div>
            )}

            <div className="variant-preview-tabs">
              {variantLetters.map((letter, index) => (
                <button
                  type="button"
                  key={letter}
                  className={selectedVariantIndex === index ? 'active' : ''}
                  onClick={() => setSelectedVariantIndex(index)}
                >
                  {letter} variantı
                </button>
              ))}
            </div>

            <div className="quality-control-strip">
              <span><Check size={14} /> Cari testdə dublikat nəzarəti</span>
              <span><Check size={14} /> Həddindən artıq bənzərlik nəzarəti</span>
              <span><Check size={14} /> İstifadəçi tarixçəsi nəzarəti</span>
              <strong>
                İstəyə bağlı dəyişmə: {voluntaryChangeCount} / {voluntaryChangeLimit}
              </strong>
            </div>

            {previewMessage && (
              <div className="preview-message">{previewMessage}</div>
            )}

            <div className="preview-question-list">
              {mockQuestions.map((question) => {
                const alreadyVoluntarilyChanged =
                  voluntaryChangedQuestions.includes(question.id)
                const voluntaryLimitBlocksThisQuestion =
                  voluntaryChangeCount >= voluntaryChangeLimit &&
                  !alreadyVoluntarilyChanged

                const previousType =
                  question.id > 1 ? mockQuestions[question.id - 2]?.type : null
                const heading =
                  previousType !== question.type
                    ? typeHeading(question.type)
                    : null

                return (
                  <div className="preview-question-group" key={question.id}>
                    {heading && (
                      <div className="question-type-heading">{heading}</div>
                    )}
                  <article className="preview-question-card">
                    <div className="preview-question-card__top">
                      <div>
                        <span>Sual {question.id}</span>
                        <strong>
                          Müvəqqəti sual mətni
                          {question.variant > 1 ? ` · Variant ${question.variant}` : ''}
                        </strong>
                      </div>

                      <small className="question-code">
                        {question.questionCode}
                      </small>
                    </div>

                    <div className="question-placeholder">
                      {question.type === 'Situasiya'
                        ? `Bu sual situasiya blokunun ${((question.id - manualTypeSequence.findIndex((item) => item === 'Situasiya') - 1) % 3) + 1}-ci sualıdır. Real situasiya mətni və sual bazası qoşulduqda burada görünəcək.`
                        : `${activeVariantLetter} variantı üçün real, digər variantlarda təkrarlanmayan sual burada görünəcək.`}
                    </div>

                    <div className="question-meta-score-row">
                      <div className="question-meta">
                        <span>{question.topic}</span>
                        <span>{question.difficulty}</span>
                        <span>{question.type}</span>
                        <span>≈ {question.minute} dəq</span>
                      </div>

                      <div className="question-score-bottom-right">
                        <span>Bal</span>
                        <strong>{question.score} bal</strong>
                      </div>
                    </div>

                    <div className="question-actions">
                      <button
                        type="button"
                        disabled={voluntaryLimitBlocksThisQuestion}
                        onClick={() =>
                          registerVoluntaryChange(question.id, 'Redaktə et')
                        }
                      >
                        Redaktə et
                      </button>

                      <button
                        type="button"
                        disabled={voluntaryLimitBlocksThisQuestion}
                        onClick={() =>
                          registerVoluntaryChange(question.id, 'Sualı dəyiş')
                        }
                      >
                        Sualı dəyiş
                      </button>

                      <button
                        type="button"
                        disabled={voluntaryLimitBlocksThisQuestion}
                        onClick={() =>
                          registerVoluntaryChange(question.id, 'Oxşar sual')
                        }
                      >
                        Oxşar sual
                      </button>

                      <button
                        className="report-problem-button"
                        type="button"
                        onClick={() => openIssueReview(question.id)}
                      >
                        Problem bildir
                      </button>
                    </div>

                    {alreadyVoluntarilyChanged && (
                      <div className="counted-change-note">
                        Bu sual artıq 5-lik istəyə bağlı dəyişmə limitinə daxil edilib.
                      </div>
                    )}

                    {activeIssueQuestion === question.id && (
                      <div className="issue-review-box">
                        <div className="issue-review-box__head">
                          <div>
                            <strong>Problem araşdırması</strong>
                            <span>
                              AI müəllimin bildirişi ilə dərhal razılaşmır; əvvəl
                              müstəqil yoxlama aparır.
                            </span>
                          </div>

                          <button type="button" onClick={closeIssueReview}>
                            Bağla
                          </button>
                        </div>

                        {issueStage === 'reason' && (
                          <div className="issue-stage">
                            <label>
                              <span>Problemin səbəbini seçin</span>
                              <select
                                value={issueReason}
                                onChange={(event) =>
                                  setIssueReason(event.target.value)
                                }
                              >
                                <option value="">Səbəb seçin</option>
                                <option value="duplicate">Dublikatdır</option>
                                <option value="similar">
                                  Həddindən artıq bənzərdir
                                </option>
                                <option value="error">
                                  Sualda və ya cavabda səhv var
                                </option>
                                <option value="other">Digər problem</option>
                              </select>
                            </label>

                            <button
                              className="primary-action"
                              type="button"
                              disabled={!issueReason}
                              onClick={startIssueInvestigation}
                            >
                              AI yoxlasın
                              <Sparkles size={16} />
                            </button>
                          </div>
                        )}

                        {issueStage === 'explanation' && (
                          <div className="issue-stage">
                            <div className="ai-investigation-result">
                              <Sparkles size={18} />
                              <div>
                                <strong>
                                  İlkin yoxlamada problem avtomatik təsdiqlənmədi.
                                </strong>
                                <span>
                                  AI qərar verməzdən əvvəl müəllimin gördüyü
                                  konkret problemi izah etməsini istəyir.
                                </span>
                              </div>
                            </div>

                            <label>
                              <span>Problemi harada görürsünüz?</span>
                              <textarea
                                value={issueExplanation}
                                onChange={(event) =>
                                  setIssueExplanation(event.target.value)
                                }
                                placeholder="Məsələn: iki cavab variantı eyni nəticəni verir..."
                              />
                            </label>

                            <button
                              className="primary-action"
                              type="button"
                              disabled={!issueExplanation.trim()}
                              onClick={recheckWithTeacherExplanation}
                            >
                              İzahı nəzərə alıb yenidən araşdır
                              <Sparkles size={16} />
                            </button>
                          </div>
                        )}

                        {issueStage === 'recheck' && (
                          <div className="issue-stage">
                            <div className="ai-investigation-result pending">
                              <Sparkles size={18} />
                              <div>
                                <strong>
                                  İkinci araşdırma üçün məlumat hazırdır.
                                </strong>
                                <span>
                                  Real AI inteqrasiyası qoşulduqda sistem müəllimin
                                  izahını yeni dəlil kimi nəzərə alaraq sualı,
                                  cavabı, dublikatlığı və bənzərliyi yenidən
                                  müstəqil yoxlayacaq. Problem təsdiqlənərsə
                                  dəyişiklik 5-lik limitdən sayılmayacaq.
                                </span>
                              </div>
                            </div>

                            <div className="teacher-evidence">
                              <span>Müəllimin izahı</span>
                              <strong>{issueExplanation}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </article>
                  </div>
                )
              })}
            </div>

            <div className="preview-total-bar">
              <div>
                <span>Ümumi bal</span>
                <strong>100 / 100</strong>
              </div>

              <div>
                <span>Müəllimin vaxtı</span>
                <strong>{durationMinutes} dəqiqə</strong>
              </div>

              <div>
                <span>AI təxmini</span>
                <strong>{estimatedMinutes} dəqiqə</strong>
              </div>
            </div>

            <div className="builder-footer-actions">
              <button
                className="secondary-action back-left"
                type="button"
                onClick={() => setPreparationStage('review')}
              >
                <ChevronLeft size={18} />
                Yoxlamaya qayıt
              </button>

              <button
                className="primary-action"
                type="button"
                onClick={() => setPreparationStage('design')}
              >
                Müəllim təsdiqi
                <Check size={18} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'design' && (
          <section className="builder-panel simplified-panel print-design-panel">
            <div className="print-design-toolbar polished">
              <div className="print-design-intro">
                <span className="processing-eyebrow">Standart KSQ dizaynı</span>
                <h2>Çap / PDF görünüşü</h2>
                <p>
                  Sual və ona aid şəkil ayrılmır. Situasiyada əsas mətn və şəkil
                  birlikdə saxlanılır, ona aid 3 sual isə səhifələr arasında
                  davam edə bilər.
                </p>
              </div>

              <div className="print-design-options">
                <div className="design-controls polished">
                  <label className="page-count-control">
                    <span>Səhifə sayı</span>
                    <div className="page-count-select-row">
                      <select
                        value={selectedPageCount}
                        onChange={(event) =>
                          setSelectedPageCount(Number(event.target.value))
                        }
                      >
                        {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
                          <option key={count} value={count}>
                            {count} səhifə
                          </option>
                        ))}
                      </select>

                      <button
                        className="page-ai-apply"
                        type="button"
                        onClick={() => setSelectedPageCount(recommendedPageCount)}
                        title="AI tövsiyəsini tətbiq et"
                      >
                        <Sparkles size={13} />
                        AI
                      </button>
                    </div>
                    <small
                      className={`page-ai-message ${
                        selectedPageCount < recommendedPageCount
                          ? 'warning'
                          : selectedPageCount === recommendedPageCount
                            ? 'ok'
                            : 'info'
                      }`}
                    >
                      {pageCountAiMessage}
                    </small>
                  </label>

                  <label>
                    <span>Variant</span>
                    <select
                      value={selectedVariantIndex}
                      onChange={(event) =>
                        setSelectedVariantIndex(Number(event.target.value))
                      }
                    >
                      {variantLetters.map((letter, index) => (
                        <option key={letter} value={index}>
                          {letter} variantı
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="print-rule-badges polished">
                  <span className="ai-page-badge">
                    <Sparkles size={13} />
                    AI səhifə təklifi aktivdir
                  </span>
                  <span><Check size={13} /> A4</span>
                  <span><Check size={13} /> 2 sütun</span>
                  <span><Check size={13} /> Dinamik həll sahəsi</span>
                  <span><Check size={13} /> Şəkil + sual birlikdə</span>
                </div>
              </div>
            </div>

            <div className="print-pages" ref={printPagesRef}>
              {printPages.map((page, pageIndex) => (
                <article className="ksq-paper" key={pageIndex}>
                  <div className="ksq-watermark">
                    AI Riyaziyyat Platforması
                  </div>

                  {pageIndex === 0 ? (
                    <header className="ksq-paper-header">
                      <div className="ksq-header-side">
                        <label>Ad <span /></label>
                        <label>Soyad <span /></label>
                        <label>KSQ № <span /></label>
                      </div>

                      <div className="ksq-header-center">
                        <strong>{selectedClass}. Sinif Riyaziyyat</strong>
                        <span>{activeVariantLetter} variantı</span>
                      </div>

                      <div className="ksq-header-side right">
                        <label>Mövzu <span /></label>
                        <label>Tarix <span /></label>
                        <label>Topladığı bal <span /> / 100</label>
                      </div>
                    </header>
                  ) : (
                    <div className="ksq-continuation-top" />
                  )}

                  <div className={`ksq-columns ${pageIndex > 0 ? 'continuation-page' : ''}`}>
                    {[page.left, page.right].map((column, columnIndex) => (
                      <div className="ksq-column" key={columnIndex}>
                        {column.map((question, index) => {
                          const previousQuestion =
                            index > 0 ? column[index - 1] : null
                          const heading =
                            previousQuestion?.type !== question.type
                              ? typeHeading(question.type)
                              : null

                          const geometry = isGeometryQuestion(
                            question.id,
                            question.type,
                          )

                          const situationStart = isSituationStart(question.id)
                          const situationNo = situationBlockNumber(question.id)
                          const situationSubNo =
                            situationSubQuestionNumber(question.id)

                          return (
                            <div
                              className={`print-question-wrap ${
                                geometry ? 'with-geometry' : ''
                              }`}
                              data-question-type={question.type}
                              key={question.id}
                            >
                              {heading && (
                                <div className="print-type-heading">
                                  {heading}
                                </div>
                              )}

                              {situationStart && (
                                <div className="print-situation-context">
                                  <div>
                                    <strong>Situasiya {situationNo}</strong>
                                    <p>
                                      Situasiyanın əsas mətni burada yerləşir.
                                      Mətn və ona aid şəkil ayrılmaz vahid kimi
                                      eyni səhifədə saxlanılır.
                                    </p>
                                  </div>

                                  <div className="print-situation-image">
                                    Şəkil
                                  </div>
                                </div>
                              )}

                              <div className="print-question keep-together">
                                {geometry && (
                                  <div className="geometry-float">
                                    <div className="geometry-shape">
                                      <span>A</span>
                                      <span>B</span>
                                      <span>C</span>
                                    </div>
                                  </div>
                                )}

                                <div className="print-question-text">
                                  <strong>{question.id}.</strong>{' '}
                                  {question.type === 'Situasiya'
                                    ? `Situasiya ${situationNo}-ya aid ${situationSubNo}-ci sualın mətni burada yerləşəcək.`
                                    : 'Məsələnin mətni burada yerləşəcək. Sualın real məzmunu bazadan gəldikdə bu hissədə göstəriləcək.'}
                                </div>

                                {question.type === 'Qapalı' && (
                                  <div className="print-options">
                                    <span>A) ...</span>
                                    <span>B) ...</span>
                                    <span>C) ...</span>
                                    <span>D) ...</span>
                                    <span>E) ...</span>
                                  </div>
                                )}

                                <div
                                  className={`${solutionSpaceClass(question.type)} measured-solution-space`}
                                >
                                  <span>Həll üçün yer</span>
                                </div>

                                <div className="print-question-score">
                                  {question.score} bal
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  <footer className="ksq-paper-footer">
                    <span>AI Riyaziyyat Platforması</span>
                    <strong>{pageIndex + 1} / {printPages.length}</strong>
                  </footer>
                </article>
              ))}
            </div>

            <div className="print-layout-note">
              <strong>Səhifələmə qaydası</strong>
              <span>
                Hər sual bütöv blok kimi yerləşdirilir. Həndəsə şəkli sualın
                sağında qalır və mətn onun ətrafında yerləşə bilər. Sual səhifə
                və ya sütunun sonuna sığmırsa, sual və şəkil birlikdə növbəti
                sütuna keçirilir. Situasiya mətn+şəkil bloku birlikdə qalır;
                onun 3 sualı isə növbəti sütun və ya səhifədə davam edə bilər.
              </span>
            </div>

            <div className="builder-footer-actions">
              <button
                className="secondary-action back-left"
                type="button"
                onClick={() => setPreparationStage('preview')}
              >
                <ChevronLeft size={18} />
                İlkin baxışa qayıt
              </button>

              <button
                className="primary-action"
                type="button"
                onClick={approveDesign}
              >
                Dizaynı təsdiq et
                <Check size={18} />
              </button>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'final' && (
          <section className="builder-panel simplified-panel final-output-panel">
            <div className="final-output-hero">
              <div className="final-output-icon">
                <Check size={26} />
              </div>

              <div className="final-output-copy">
                <span className="processing-eyebrow">Dizayn təsdiqləndi</span>
                <h2>KSQ yekun hazırlanma mərhələsinə keçdi</h2>
                <p>
                  Parametrlər, sual dəsti və səhifə quruluşu təsdiqləndi.
                  Eyni dizayn qaydaları bütün variantlara tətbiq ediləcək.
                </p>
              </div>
            </div>

            <div className="final-output-layout">
              <div className="final-output-main">
                <div className="final-summary-card">
                  <div className="final-card-title">
                    <ClipboardList size={18} />
                    <strong>Yekun test məlumatları</strong>
                  </div>

                  <div className="final-summary-grid">
                    <div>
                      <span>Təyinat</span>
                      <strong>KSQ</strong>
                    </div>
                    <div>
                      <span>Sinif</span>
                      <strong>{selectedClass}-ci sinif</strong>
                    </div>
                    <div>
                      <span>Sual sayı</span>
                      <strong>{questionCount}</strong>
                    </div>
                    <div>
                      <span>Variant sayı</span>
                      <strong>{variantCount} ({variantLetters.join(', ')})</strong>
                    </div>
                    <div>
                      <span>Səhifə sayı</span>
                      <strong>{selectedPageCount}</strong>
                    </div>
                    <div>
                      <span>Ümumi bal</span>
                      <strong>100 bal</strong>
                    </div>
                  </div>
                </div>

                <div className="final-variants-card">
                  <div className="final-card-title">
                    <FilePlus2 size={18} />
                    <strong>Hazırlanacaq variantlar</strong>
                  </div>

                  <div className="final-variant-list">
                    {variantLetters.map((letter) => (
                      <div className="final-variant-item" key={letter}>
                        <div className="final-variant-letter">{letter}</div>
                        <div>
                          <strong>{letter} variantı</strong>
                          <span>
                            {questionCount} sual · {selectedPageCount} səhifə · 100 bal
                          </span>
                        </div>
                        <Check size={16} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="final-rules-card">
                  <div className="final-card-title">
                    <Sparkles size={18} />
                    <strong>Tətbiq olunan dizayn qaydaları</strong>
                  </div>

                  <div className="final-rule-grid">
                    <span><Check size={13} /> Sual ardıcıllığı qorunur</span>
                    <span><Check size={13} /> Sual + şəkil ayrılmır</span>
                    <span><Check size={13} /> Dinamik həll sahəsi</span>
                    <span><Check size={13} /> Situasiya mətni + şəkil birlikdə</span>
                    <span><Check size={13} /> Variantlarda sual təkrarı yoxdur</span>
                    <span><Check size={13} /> Eyni parametr strukturu</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="final-output-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={reopenDesign}
              >
                <ChevronLeft size={17} />
                Dizaynı yenidən aç
              </button>

              <button
                className="primary-action final-pdf-action"
                type="button"
                onClick={openFinalPdfStage}
              >
                <FilePlus2 size={17} />
                Yekun PDF-ni hazırla
              </button>
            </div>
          </section>
        )}

        {builderStep === 'review' && preparationStage === 'export' && (
          <section className="builder-panel simplified-panel pdf-export-panel">
            <div className="pdf-export-header no-print">
              <div>
                <span className="processing-eyebrow">Yekun PDF</span>
                <h2>PDF ixracı</h2>
                <p>
                  Variantı seçin, yekun görünüşü yoxlayın və PDF-i yükləyin və ya çap edin.
                </p>
              </div>

              <div className="pdf-export-status">
                <Check size={16} />
                Dizayn təsdiqlənib
              </div>
            </div>

            <div className="pdf-export-toolbar no-print">
              <div className="pdf-export-variants">
                <span>Variant</span>
                <div>
                  {variantLetters.map((letter, index) => (
                    <button
                      type="button"
                      key={letter}
                      className={selectedVariantIndex === index ? 'active' : ''}
                      onClick={() => setSelectedVariantIndex(index)}
                    >
                      {letter} variantı
                    </button>
                  ))}
                </div>
              </div>

              <div className="pdf-export-meta">
                <span>A4</span>
                <span>{selectedPageCount} səhifə</span>
                <span>{questionCount} sual</span>
                <span>100 bal</span>
              </div>

              <div className="pdf-export-actions">
                <button
                  className="primary-action pdf-download-button"
                  type="button"
                  onClick={downloadCurrentVariantPdf}
                  title="Brauzerin PDF saxlama pəncərəsini açır"
                >
                  <FilePlus2 size={17} />
                  PDF yüklə
                </button>

                <button
                  className="secondary-action pdf-print-button"
                  type="button"
                  onClick={printCurrentVariantPdf}
                >
                  Çap et
                </button>
              </div>
            </div>

            <div className="pdf-export-document">
              <div className="print-pages export-print-pages" ref={printPagesRef}>
                {printPages.map((page, pageIndex) => (
                  <article className="ksq-paper" key={pageIndex}>
                    <div className="ksq-watermark">
                      AI Riyaziyyat Platforması
                    </div>

                    {pageIndex === 0 ? (
                      <header className="ksq-paper-header">
                        <div className="ksq-header-side">
                          <label>Ad <span /></label>
                          <label>Soyad <span /></label>
                          <label>KSQ № <span /></label>
                        </div>

                        <div className="ksq-header-center">
                          <strong>{selectedClass}. Sinif Riyaziyyat</strong>
                          <span>{activeVariantLetter} variantı</span>
                        </div>

                        <div className="ksq-header-side right">
                          <label>Mövzu <span /></label>
                          <label>Tarix <span /></label>
                          <label>Topladığı bal <span /> / 100</label>
                        </div>
                      </header>
                    ) : (
                      <div className="ksq-continuation-top" />
                    )}

                    <div className={`ksq-columns ${pageIndex > 0 ? 'continuation-page' : ''}`}>
                      {[page.left, page.right].map((column, columnIndex) => (
                        <div className="ksq-column" key={columnIndex}>
                          {column.map((question, index) => {
                            const previousQuestion =
                              index > 0 ? column[index - 1] : null
                            const heading =
                              previousQuestion?.type !== question.type
                                ? typeHeading(question.type)
                                : null

                            const geometry = isGeometryQuestion(
                              question.id,
                              question.type,
                            )

                            const situationStart = isSituationStart(question.id)

                            return (
                              <div
                                className={`print-question-wrap ${
                                  geometry ? 'with-geometry' : ''
                                }`}
                                data-question-type={question.type}
                                key={question.id}
                              >
                                {heading && (
                                  <div className="print-type-heading">{heading}</div>
                                )}

                                {situationStart && (
                                  <div className="situation-context keep-together">
                                    <strong>Situasiya mətni</strong>
                                    <p>
                                      Real situasiya mətni və ona aid şəkil burada
                                      birlikdə yerləşəcək.
                                    </p>
                                    <div className="situation-image-placeholder">
                                      Situasiya şəkli
                                    </div>
                                  </div>
                                )}

                                <div className="print-question keep-together">
                                  <div className="print-question-main">
                                    <p>
                                      <strong>{question.id}.</strong>{' '}
                                      Məsələnin mətni burada yerləşəcək. Sualın real məzmunu bazadan gəldikdə bu hissədə göstəriləcək.
                                    </p>

                                    {question.type === 'Qapalı' && (
                                      <div className="print-options">
                                        <span>A)</span>
                                        <span>B)</span>
                                        <span>C)</span>
                                        <span>D)</span>
                                        <span>E)</span>
                                      </div>
                                    )}

                                    {geometry && (
                                      <div className="geometry-float">
                                        <div className="geometry-placeholder">
                                          <span className="geometry-line line-one" />
                                          <span className="geometry-line line-two" />
                                          <b className="geo-a">A</b>
                                          <b className="geo-b">B</b>
                                          <b className="geo-c">C</b>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div
                                    className={`${solutionSpaceClass(question.type)} measured-solution-space`}
                                  >
                                    <span>Həll üçün yer</span>
                                  </div>

                                  <div className="print-question-score">
                                    {question.score} bal
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>

                    <footer className="ksq-paper-footer">
                      <span>AI Riyaziyyat Platforması</span>
                      <strong>{pageIndex + 1} / {printPages.length}</strong>
                    </footer>
                  </article>
                ))}
              </div>
            </div>

            <div className="pdf-export-footer no-print">
              <button
                className="secondary-action"
                type="button"
                onClick={() => setPreparationStage('final')}
              >
                <ChevronLeft size={17} />
                Yekun mərhələyə qayıt
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [startInOnlineMode, setStartInOnlineMode] = useState(false)
  const [tokens, setTokens] = useState<TokenResponse | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null)

  const handleLoginSuccess = async (loginTokens: TokenResponse) => {
    try {
      const authenticatedUser = await getCurrentUser(loginTokens.access_token)
      setTokens(loginTokens)
      setCurrentUser(authenticatedUser)
    } catch (error) {
      setTokens(null)
      setCurrentUser(null)
      throw error
    }
  }

  if (tokens === null || currentUser === null) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />
  }

  const openDashboard = () => {
    setStartInOnlineMode(false)
    setScreen('dashboard')
  }

  const openTestBuilder = () => {
    setStartInOnlineMode(false)
    setScreen('test-builder')
  }

  const openOnlineTests = () => {
    setStartInOnlineMode(false)
    setScreen('online-tests')
  }

  const createOnlineTest = () => {
    setStartInOnlineMode(true)
    setScreen('test-builder')
  }

  const openOnlineTestDetails = () => setScreen('online-test-details')
  const openActiveTestDetails = () => setScreen('active-test-details')

  return (
    <div className="app-shell">
      <Sidebar
        screen={screen}
        onHome={openDashboard}
        onOpenOnlineTests={openOnlineTests}
        firstName={currentUser.first_name}
        lastName={currentUser.last_name}
        roleDisplayName={currentUser.active_role.display_name}
      />

      {screen === 'dashboard' && (
        <Dashboard
          onOpenTestBuilder={openTestBuilder}
          firstName={currentUser.first_name}
          roleDisplayName={currentUser.active_role.display_name}
        />
      )}

      {screen === 'online-tests' && (
        <OnlineTestsPage onCreateOnlineTest={createOnlineTest} onOpenDetails={openOnlineTestDetails} onOpenActiveDetails={openActiveTestDetails} />
      )}

      {screen === 'online-test-details' && (
        <PlannedOnlineTestDetails onBack={openOnlineTests} />
      )}

      {screen === 'active-test-details' && (
        <ActiveOnlineTestDetails onBack={openOnlineTests} />
      )}

      {screen === 'test-builder' && (
        <TestBuilder
          onBack={openDashboard}
          onOpenOnlineTests={openOnlineTests}
          startInOnlineMode={startInOnlineMode}
        />
      )}
    </div>
  )
}

export default App
