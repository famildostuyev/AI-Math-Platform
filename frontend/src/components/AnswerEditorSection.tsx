import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import {
  createAcceptedAnswer,
  createOption,
  deleteAcceptedAnswer,
  deleteOption,
  reorderAcceptedAnswers,
  reorderOptions,
  setCorrectOptions,
  updateAcceptedAnswer,
  updateOption,
  type QuestionRevisionEditorRead,
  type StructuredTextDocument,
} from '../api/questionEditor'

type Operation = (token: string, revision: QuestionRevisionEditorRead) => Promise<unknown>

type Props = {
  revision: QuestionRevisionEditorRead
  disabled: boolean
  runMutation: (operation: Operation, afterReload?: () => void, conflictMessage?: string) => void
}

const CORRECT_OPTION_DELETE_WARNING = 'Düzgün cavab kimi seçilmiş variantı əvvəlcə düzgün cavabdan çıxarın.'

function documentFor(text: string): StructuredTextDocument {
  return { type: 'document', content: [{ type: 'paragraph', attrs: null, content: text ? [{ type: 'text', text, marks: [] }] : [] }] }
}

export default function AnswerEditorSection({ revision, disabled, runMutation }: Props) {
  const [label, setLabel] = useState('')
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [editingText, setEditingText] = useState('')
  const [warning, setWarning] = useState<string | null>(null)
  const answerOptions = Array.isArray(revision.answer_options) ? revision.answer_options : []
  const acceptedAnswers = Array.isArray(revision.accepted_answers) ? revision.accepted_answers : []
  const answerPolicy = revision.answer_policy === 'option_single'
    || revision.answer_policy === 'option_multiple'
    || revision.answer_policy === 'accepted_answer'
    || revision.answer_policy === 'none'
    || revision.answer_policy === 'unsupported'
    ? revision.answer_policy
    : 'unsupported'
  const optionPolicy = answerPolicy === 'option_single' || answerPolicy === 'option_multiple'

  const move = (collection: 'option' | 'accepted', index: number, direction: -1 | 1) => {
    const records = collection === 'option' ? answerOptions : acceptedAnswers
    const target = index + direction
    if (target < 0 || target >= records.length) return
    const ids = records.map((item) => item.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    runMutation((token, current) => collection === 'option'
      ? reorderOptions(token, current.revision_id, { answer_ids: ids, expected_revision_updated_at: current.updated_at })
      : reorderAcceptedAnswers(token, current.revision_id, { answer_ids: ids, expected_revision_updated_at: current.updated_at }))
  }

  const toggleCorrect = (id: string, selected: boolean) => {
    const currentIds = answerOptions.filter((item) => item.is_correct).map((item) => item.id)
    const optionIds = answerPolicy === 'option_single'
      ? (selected ? [id] : [])
      : (selected ? [...new Set([...currentIds, id])] : currentIds.filter((itemId) => itemId !== id))
    runMutation((token, current) => setCorrectOptions(token, current.revision_id, { option_ids: optionIds, expected_revision_updated_at: current.updated_at }))
  }

  const removeOption = (id: string, isCorrect: boolean) => {
    if (isCorrect) {
      setWarning(CORRECT_OPTION_DELETE_WARNING)
      return
    }
    setWarning(null)
    runMutation((token, current) => deleteOption(token, current.revision_id, id, current.updated_at))
  }

  if (answerPolicy === 'none') {
    return <section className="admin-answer-editor"><h2>Cavab</h2><p>Bu sual tipi üçün ayrıca cavab bölməsi lazım deyil.</p></section>
  }
  if (answerPolicy === 'unsupported') {
    return <section className="admin-answer-editor"><h2>Cavab</h2><p>Bu sual tipi üçün cavab strukturu hələ dəstəklənmir.</p></section>
  }

  return <section className="admin-answer-editor" aria-labelledby="answer-editor-title">
    <div className="admin-editor-section-heading"><div><span>Canonical cavab strukturu</span><h2 id="answer-editor-title">{optionPolicy ? 'Cavab variantları' : 'Qəbul edilən cavablar'}</h2></div><b>{optionPolicy ? answerOptions.length : acceptedAnswers.length}</b></div>
    {warning && <div className="admin-editor-error" role="alert">{warning}</div>}

    {optionPolicy ? <>
      <form className="admin-answer-editor__form" onSubmit={(event) => { event.preventDefault(); if (!text.trim()) return; runMutation((token, current) => createOption(token, current.revision_id, { label: label.trim() || null, document: documentFor(text), format_version: 1, expected_revision_updated_at: current.updated_at }), () => { setLabel(''); setText('') }) }}>
        <label><span>Label</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="A" maxLength={50} disabled={disabled} /></label>
        <label><span>Variant mətni</span><textarea value={text} onChange={(event) => setText(event.target.value)} disabled={disabled} /></label>
        <button type="submit" disabled={disabled || !text.trim()}><Plus size={16} /> Əlavə et</button>
      </form>
      <div className="admin-answer-editor__list">{answerOptions.map((option, index) => <article key={option.id} className="admin-answer-editor__item">
        {editingId === option.id ? <div className="admin-answer-editor__edit"><input value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} maxLength={50} aria-label="Variant label-i" /><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} aria-label="Variant mətni" /><button type="button" onClick={() => runMutation((token, current) => updateOption(token, current.revision_id, option.id, { label: editingLabel.trim() || null, document: documentFor(editingText), format_version: 1, expected_revision_updated_at: current.updated_at }), () => setEditingId(null))} disabled={disabled || !editingText.trim()}><Save size={15} /> Saxla</button><button type="button" onClick={() => setEditingId(null)} disabled={disabled}><X size={15} /> Ləğv et</button></div> : <>
          <label className="admin-answer-editor__correct"><input type={answerPolicy === 'option_single' ? 'radio' : 'checkbox'} name={answerPolicy === 'option_single' ? 'correct-answer' : undefined} checked={option.is_correct} onChange={(event) => toggleCorrect(option.id, event.target.checked)} disabled={disabled} /><span>Düzgün</span></label>
          <div className="admin-answer-editor__content"><strong>{option.label ?? '—'}</strong><span>{option.source_text}</span></div>
          <div className="admin-answer-editor__actions"><button type="button" onClick={() => { setEditingId(option.id); setEditingLabel(option.label ?? ''); setEditingText(option.source_text) }} disabled={disabled}><Pencil size={15} /> Redaktə et</button><button type="button" onClick={() => move('option', index, -1)} disabled={disabled || index === 0}><ArrowUp size={15} /> Yuxarı</button><button type="button" onClick={() => move('option', index, 1)} disabled={disabled || index === answerOptions.length - 1}><ArrowDown size={15} /> Aşağı</button><button type="button" className="danger" onClick={() => removeOption(option.id, option.is_correct)} disabled={disabled}><Trash2 size={15} /> Sil</button></div>
        </>}
      </article>)}</div>
    </> : <>
      <form className="admin-answer-editor__form" onSubmit={(event) => { event.preventDefault(); if (!text.trim()) return; runMutation((token, current) => createAcceptedAnswer(token, current.revision_id, { document: documentFor(text), format_version: 1, expected_revision_updated_at: current.updated_at }), () => setText('')) }}>
        <label><span>Qəbul edilən cavab</span><textarea value={text} onChange={(event) => setText(event.target.value)} disabled={disabled} /></label><button type="submit" disabled={disabled || !text.trim()}><Plus size={16} /> Əlavə et</button>
      </form>
      <div className="admin-answer-editor__list">{acceptedAnswers.map((answer, index) => <article key={answer.id} className="admin-answer-editor__item">
        {editingId === answer.id ? <div className="admin-answer-editor__edit"><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} /><button type="button" onClick={() => runMutation((token, current) => updateAcceptedAnswer(token, current.revision_id, answer.id, { document: documentFor(editingText), format_version: 1, expected_revision_updated_at: current.updated_at }), () => setEditingId(null))} disabled={disabled || !editingText.trim()}><Save size={15} /> Saxla</button><button type="button" onClick={() => setEditingId(null)} disabled={disabled}><X size={15} /> Ləğv et</button></div> : <><div className="admin-answer-editor__content"><span>{answer.source_text}</span></div><div className="admin-answer-editor__actions"><button type="button" onClick={() => { setEditingId(answer.id); setEditingText(answer.source_text) }} disabled={disabled}><Pencil size={15} /> Redaktə et</button><button type="button" onClick={() => move('accepted', index, -1)} disabled={disabled || index === 0}><ArrowUp size={15} /> Yuxarı</button><button type="button" onClick={() => move('accepted', index, 1)} disabled={disabled || index === acceptedAnswers.length - 1}><ArrowDown size={15} /> Aşağı</button><button type="button" className="danger" onClick={() => runMutation((token, current) => deleteAcceptedAnswer(token, current.revision_id, answer.id, current.updated_at))} disabled={disabled}><Trash2 size={15} /> Sil</button></div></>}
      </article>)}</div>
    </>}
  </section>
}
