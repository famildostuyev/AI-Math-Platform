import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileImage,
  FileText,
  FileUp,
  Info,
  Lightbulb,
  PencilLine,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import './AdminDashboard.css'

export type AdminDashboardQuickAction = {
  id: 'upload-source' | 'create-question' | 'create-test' | 'create-user'
  title: string
  description: string
  tone: 'violet' | 'blue' | 'green' | 'orange'
  icon: LucideIcon
  onSelect?: () => void
}

export type AdminDashboardApprovalItem = {
  id: string
  type: string
  title: string
  sender: string
  formattedDateTime: string
  onView?: () => void
}

export type AdminDashboardSourceProcessStatus =
  | 'uploaded'
  | 'pre_analysis'
  | 'ai_processing'
  | 'review'
  | 'completed'
  | 'failed'

export type AdminDashboardSourceProcessItem = {
  id: string
  fileName: string
  metadata: string
  fileType: 'pdf' | 'word' | 'image' | 'other'
  status: AdminDashboardSourceProcessStatus
  progress: number
  onOpen?: () => void
}

export type AdminDashboardAiInsight = {
  id: string
  severity: 'warning' | 'info' | 'recommendation' | 'success' | 'critical'
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export type AdminDashboardMetric = {
  id: string
  label: string
  value: string
  trend?: string
}

export type AdminDashboardProps = {
  adminName?: string
  formattedDateTime: string
  onUploadSource?: () => void
  onCreateQuestion?: () => void
  onCreateTest?: () => void
  onCreateUser?: () => void
  approvalItems?: AdminDashboardApprovalItem[]
  sourceProcessItems?: AdminDashboardSourceProcessItem[]
  aiInsights?: AdminDashboardAiInsight[]
  metrics?: AdminDashboardMetric[]
  onViewAllApprovals?: () => void
  onViewAllSources?: () => void
  onViewAllInsights?: () => void
  onViewDetailedReport?: () => void
}

const sourceStatusLabels: Record<AdminDashboardSourceProcessStatus, string> = {
  uploaded: 'Yükləndi',
  pre_analysis: 'Pre-analiz',
  ai_processing: 'AI emalı davam edir',
  review: 'Yoxlama mərhələsində',
  completed: 'Tamamlandı',
  failed: 'Emal xətası',
}

const sourceFileIcons: Record<AdminDashboardSourceProcessItem['fileType'], LucideIcon> = {
  pdf: FileText,
  word: FileText,
  image: FileImage,
  other: FileUp,
}

const insightIcons: Record<AdminDashboardAiInsight['severity'], LucideIcon> = {
  warning: AlertTriangle,
  info: Info,
  recommendation: Lightbulb,
  success: CheckCircle2,
  critical: AlertTriangle,
}

function SectionAction({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      className="admin-dashboard-section-action"
      type="button"
      onClick={onClick}
      disabled={!onClick}
    >
      {label}
    </button>
  )
}

export default function AdminDashboard({
  adminName = 'Admin',
  formattedDateTime,
  onUploadSource,
  onCreateQuestion,
  onCreateTest,
  onCreateUser,
  approvalItems = [],
  sourceProcessItems = [],
  aiInsights = [],
  metrics = [],
  onViewAllApprovals,
  onViewAllSources,
  onViewAllInsights,
  onViewDetailedReport,
}: AdminDashboardProps) {
  const quickActions: AdminDashboardQuickAction[] = [
    {
      id: 'upload-source',
      title: 'Mənbə yüklə',
      description: 'PDF, Word, şəkil və digər mənbələrdən suallar əlavə edin.',
      tone: 'violet',
      icon: FileUp,
      onSelect: onUploadSource,
    },
    {
      id: 'create-question',
      title: 'Yeni sual tərtib et',
      description: 'Sıfırdan yeni sual yaradın və bazaya əlavə edin.',
      tone: 'blue',
      icon: PencilLine,
      onSelect: onCreateQuestion,
    },
    {
      id: 'create-test',
      title: 'Test tərtib et',
      description: 'Yeni test və imtahan təşkil edin.',
      tone: 'green',
      icon: ClipboardCheck,
      onSelect: onCreateTest,
    },
    {
      id: 'create-user',
      title: 'İstifadəçi əlavə et',
      description: 'Yeni istifadəçi hesabı yaradın.',
      tone: 'orange',
      icon: UserPlus,
      onSelect: onCreateUser,
    },
  ]

  return (
    <main className="admin-dashboard-workspace">
      <div className="admin-dashboard-content">
        <header className="admin-dashboard-header">
          <div>
            <h1>Xoş gəlmisiniz, {adminName}!</h1>
            <p>Platformanın ümumi vəziyyətinə nəzər salın və sürətli əməliyyatlara başlayın.</p>
          </div>
          <div className="admin-dashboard-date" aria-label={`Tarix və vaxt: ${formattedDateTime}`}>
            <CalendarDays size={17} aria-hidden="true" />
            <time>{formattedDateTime}</time>
          </div>
        </header>

        <section className="admin-dashboard-panel admin-dashboard-quick-section" aria-labelledby="admin-dashboard-quick-title">
          <div className="admin-dashboard-section-header">
            <h2 id="admin-dashboard-quick-title">Sürətli əməliyyatlar</h2>
          </div>
          <div className="admin-dashboard-quick-grid">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  className={`admin-dashboard-quick-card admin-dashboard-quick-card--${action.tone}`}
                  type="button"
                  key={action.id}
                  onClick={action.onSelect}
                  disabled={!action.onSelect}
                >
                  <span className="admin-dashboard-quick-icon"><Icon size={28} aria-hidden="true" /></span>
                  <span className="admin-dashboard-quick-copy">
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                  <ArrowRight className="admin-dashboard-quick-arrow" size={19} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </section>

        <div className="admin-dashboard-main-grid">
          <section className="admin-dashboard-panel" aria-labelledby="admin-dashboard-approvals-title">
            <div className="admin-dashboard-section-header">
              <h2 id="admin-dashboard-approvals-title">Təsdiq gözləyənlər</h2>
              <SectionAction label="Hamısına bax" onClick={onViewAllApprovals} />
            </div>
            {approvalItems.length > 0 ? (
              <div className="admin-dashboard-approval-scroll">
                <table className="admin-dashboard-approval-table">
                  <thead><tr><th>Növ</th><th>Başlıq</th><th>Göndərən</th><th>Tarix</th><th><span className="admin-dashboard-visually-hidden">Əməliyyat</span></th></tr></thead>
                  <tbody>
                    {approvalItems.map((item) => (
                      <tr key={item.id}>
                        <td><span className="admin-dashboard-approval-type"><FileText size={16} aria-hidden="true" />{item.type}</span></td>
                        <td>{item.title}</td>
                        <td>{item.sender}</td>
                        <td><time>{item.formattedDateTime}</time></td>
                        <td><button type="button" onClick={item.onView} disabled={!item.onView}>Bax</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="admin-dashboard-empty">Təsdiq gözləyən element yoxdur.</p>}
            <footer className="admin-dashboard-panel-footer">Cəmi {approvalItems.length} element gözləyir</footer>
          </section>

          <section className="admin-dashboard-panel" aria-labelledby="admin-dashboard-sources-title">
            <div className="admin-dashboard-section-header">
              <h2 id="admin-dashboard-sources-title">Mənbələrin emal vəziyyəti</h2>
              <SectionAction label="Hamısına bax" onClick={onViewAllSources} />
            </div>
            {sourceProcessItems.length > 0 ? (
              <ul className="admin-dashboard-source-list">
                {sourceProcessItems.map((item) => {
                  const Icon = sourceFileIcons[item.fileType]
                  const progress = Math.max(0, Math.min(100, item.progress))
                  return (
                    <li key={item.id}>
                      <span className={`admin-dashboard-file-icon admin-dashboard-file-icon--${item.fileType}`}><Icon size={19} aria-hidden="true" /></span>
                      <span className="admin-dashboard-source-copy"><strong>{item.fileName}</strong><small>{item.metadata}</small></span>
                      <span className={`admin-dashboard-source-status admin-dashboard-source-status--${item.status}`}>{sourceStatusLabels[item.status]}</span>
                      <span className="admin-dashboard-progress-wrap">
                        <span className="admin-dashboard-progress" role="progressbar" aria-label={`${item.fileName}: ${progress}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                          <span style={{ width: `${progress}%` }} />
                        </span>
                        <small>{progress}%</small>
                      </span>
                      <button className="admin-dashboard-row-action" type="button" aria-label={`${item.fileName} mənbəsini aç`} onClick={item.onOpen} disabled={!item.onOpen}><ChevronRight size={18} /></button>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="admin-dashboard-empty">Emal olunan mənbə yoxdur.</p>}
            <footer className="admin-dashboard-panel-footer">Cəmi {sourceProcessItems.length} mənbə</footer>
          </section>
        </div>

        <div className="admin-dashboard-lower-grid">
          <section className="admin-dashboard-panel" aria-labelledby="admin-dashboard-ai-title">
            <div className="admin-dashboard-section-header">
              <h2 id="admin-dashboard-ai-title"><Sparkles size={19} aria-hidden="true" />AI köməkçi</h2>
              <SectionAction label="Hamısına bax" onClick={onViewAllInsights} />
            </div>
            {aiInsights.length > 0 ? (
              <div className="admin-dashboard-insight-grid">
                {aiInsights.map((item) => {
                  const Icon = insightIcons[item.severity]
                  return (
                    <article className={`admin-dashboard-insight admin-dashboard-insight--${item.severity}`} key={item.id}>
                      <Icon size={25} aria-hidden="true" />
                      <strong>{item.title}</strong>
                      {item.description && <p>{item.description}</p>}
                      {item.actionLabel && <button type="button" onClick={item.onAction} disabled={!item.onAction}>{item.actionLabel}<ArrowRight size={15} /></button>}
                    </article>
                  )
                })}
              </div>
            ) : <p className="admin-dashboard-empty">Diqqət tələb edən AI təklifi yoxdur.</p>}
          </section>

          <section className="admin-dashboard-panel" aria-labelledby="admin-dashboard-metrics-title">
            <div className="admin-dashboard-section-header">
              <h2 id="admin-dashboard-metrics-title">Ümumi statistika</h2>
              <SectionAction label="Ətraflı hesabat" onClick={onViewDetailedReport} />
            </div>
            {metrics.length > 0 ? (
              <div className="admin-dashboard-metric-grid">
                {metrics.map((metric) => (
                  <article className="admin-dashboard-metric" key={metric.id}>
                    <span>{metric.label}</span>
                    <div><strong>{metric.value}</strong>{metric.trend && <small>{metric.trend}</small>}</div>
                  </article>
                ))}
              </div>
            ) : <p className="admin-dashboard-empty">Statistika məlumatı mövcud deyil.</p>}
          </section>
        </div>
      </div>
    </main>
  )
}
