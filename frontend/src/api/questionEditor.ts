import { requestJson } from './client'

export type UUID = string
export type IsoDateTime = string

export type QuestionRevisionStatus =
  | 'draft'
  | 'proposed'
  | 'approved'
  | 'rejected'

export type QuestionDifficulty = 'easy' | 'medium' | 'hard'
export type AnswerPolicy = 'option_single' | 'option_multiple'
  | 'accepted_answer' | 'none' | 'unsupported'

export type BoldMark = {
  type: 'bold'
}

export type ItalicMark = {
  type: 'italic'
}

export type UnderlineMark = {
  type: 'underline'
}

export type FontFamilyMark = {
  type: 'font_family'
  value: 'default' | 'serif' | 'sans' | 'math-compatible' | 'times-new-roman' | 'arial' | 'calibri' | 'cambria' | 'georgia' | 'verdana'
}

export type FontSizeMark = {
  type: 'font_size'
  value: 'small' | 'normal' | 'large' | 'x-large' | number
}

export type TextColorMark = { type: 'foreground_color' | 'background_color'; value: string }

export type TextMark =
  | BoldMark
  | ItalicMark
  | UnderlineMark
  | FontFamilyMark
  | FontSizeMark
  | TextColorMark

export type TextNode = {
  type: 'text'
  text: string
  marks: TextMark[]
}

export type InlineMathNode = {
  type: 'inline_math'
  latex: string
}

export type HardBreakNode = {
  type: 'hard_break'
}

export type InlineNode = TextNode | InlineMathNode | HardBreakNode

export type ParagraphAttrs = {
  alignment: 'start' | 'center' | 'end' | 'justify'
}

export type ParagraphNode = {
  type: 'paragraph'
  attrs: ParagraphAttrs | null
  content: InlineNode[]
}

export type ListItemNode = {
  type: 'list_item'
  content: ParagraphNode[]
}

export type BulletListNode = {
  type: 'bullet_list'
  content: ListItemNode[]
}

export type OrderedListNode = {
  type: 'ordered_list'
  content: ListItemNode[]
}

export type StructuredTextBlockNode =
  | ParagraphNode
  | BulletListNode
  | OrderedListNode

export type StructuredTextDocument = {
  type: 'document'
  content: StructuredTextBlockNode[]
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

export type { PersistedVisualPlacement } from '../components/visualPlacement'
import type { PersistedVisualPlacement } from '../components/visualPlacement'

export function updateVisualPlacement(accessToken: string, revisionId: UUID, blockId: UUID,
  visual_placement: PersistedVisualPlacement, expected_revision_updated_at: IsoDateTime): Promise<GeometryBlockRead | ImageBlockRead> {
  return requestJson(`/api/v1/question-editor/revisions/${encodeURIComponent(revisionId)}/blocks/${encodeURIComponent(blockId)}/visual-placement`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ visual_placement, expected_revision_updated_at }),
  })
}

export type GeometryViewportV1 = {
  min_x: number
  min_y: number
  width: number
  height: number
}

export type GeometryPointV1 = {
  id: string
  x: number
  y: number
  label: string | null
  role?: 'explicit' | 'implicit'
}

export type GeometrySegmentV1 = {
  id: string
  start_point_id: string
  end_point_id: string
}

export type GeometryPolygonV1 = {
  id: string
  point_ids: string[]
  template?: GeometryPolygonTemplate
}

// Creation identity only; free point editing does not imply maintained constraints.
export type GeometryPolygonTemplate = { kind: 'triangle' | 'right_triangle' | 'rectangle' | 'square' | 'parallelogram' | 'rhombus' | 'trapezoid' } | { kind: 'regular_polygon'; n: number }

export type GeometryLineV1 = GeometrySegmentV1 & { kind: 'line' | 'directed_line' | 'vector' }
export type GeometryPolylineV1 = { id: string; point_ids: string[] }
export type GeometryCircleV1 = { id: string; center_point_id: string; radius: number; kind: 'circle' | 'disk' }
export type GeometryArcV1 = Omit<GeometryCircleV1, 'kind'> & { kind: 'arc' | 'sector'; start_angle: number; sweep_angle: number }

export type GeometryTextV1 = {
  id: string
  x: number
  y: number
  content: string
  runs?: InlineNode[]
  layout_width?: number
  scale?: number
  rotation?: number
  attachment?: GeometryAnnotationAttachment
}

export type GeometryAnnotationAttachment = {
  target_kind: 'point' | 'segment' | 'circle' | 'arc' | 'shape'
  target_id: string
  anchor: 'point' | 'parameter' | 'center'
  parameter?: number
  offset: { x: number; y: number }
  orientation: 'follow_target' | 'keep_page'
}

export type GeometryLinearSourceV1 = { kind: 'line' | 'directed_line' | 'segment' | 'vector'; id: string }
export type GeometryMidpointConstructionV1 = { id: string; kind: 'midpoint'; source_point_ids: [string, string]; output_point_id: string }
export type GeometryLinearConstructionV1 = { id: string; kind: 'parallel' | 'perpendicular'; source: GeometryLinearSourceV1; through_point_id: string; output_line_id: string; support_point_id: string }
export type GeometryIntersectionConstructionV1 = { id: string; kind: 'intersection'; source_a: GeometryLinearSourceV1; source_b: GeometryLinearSourceV1; output_point_id: string }
export type GeometryAngleBisectorConstructionV1 = { id: string; kind: 'angle_bisector'; source_point_ids: [string, string, string]; output_line_id: string; support_point_id: string; intersection_point_id?: string }
export type GeometryAltitudeConstructionV1 = { id: string; kind: 'altitude'; source_point_ids: [string, string, string]; output_segment_id: string; foot_point_id: string }
export type GeometryMedianConstructionV1 = { id: string; kind: 'median'; vertex_point_id: string; midpoint_point_id: string; output_segment_id: string }
export type GeometryPointParent = { kind: 'segment'; segment_id: string } | { kind: 'polygon_edge'; polygon_id: string; start_point_id: string; end_point_id: string }
export type GeometryPointOnSegmentConstructionV1 = { id: string; kind: 'point_on_segment'; parent: GeometryPointParent; t: number; output_point_id: string }
export type GeometryConstructionV1 = GeometryMidpointConstructionV1 | GeometryLinearConstructionV1 | GeometryIntersectionConstructionV1 | GeometryAngleBisectorConstructionV1 | GeometryAltitudeConstructionV1 | GeometryMedianConstructionV1 | GeometryPointOnSegmentConstructionV1
export type GeometrySourceDataV1 = {
  constructions?: GeometryConstructionV1[]
  schema_version: 1
  viewport: GeometryViewportV1
  description: string
  points: GeometryPointV1[]
  segments: GeometrySegmentV1[]
  polygons: GeometryPolygonV1[]
  texts: GeometryTextV1[]
  lines?: GeometryLineV1[]
  polylines?: GeometryPolylineV1[]
  circles?: GeometryCircleV1[]
  arcs?: GeometryArcV1[]
}

export type QuestionDraftCreate = {
  question_type_id: UUID
  primary_topic_id?: UUID | null
  related_topic_ids?: UUID[]
  purpose_ids?: UUID[]
}

export type QuestionDraftRead = {
  question_family_id: UUID
  question_form_id: UUID
  revision_id: UUID
  revision_number: number
  status: QuestionRevisionStatus
  question_type_id: UUID
  source_id: UUID | null
  source_detail: string | null
  source_display_name: string | null
  primary_topic_id: UUID | null
  related_topic_ids: UUID[]
  purpose_ids: UUID[]
  difficulty: QuestionDifficulty | null
  updated_at: IsoDateTime
}

export type QuestionMetadataUpdate = {
  question_type_id?: UUID
  difficulty?: QuestionDifficulty | null
  expected_revision_updated_at: IsoDateTime
}

export type QuestionMetadataRead = Pick<QuestionDraftRead, 'revision_id' | 'question_type_id' | 'difficulty' | 'updated_at'> & {
  answer_policy: AnswerPolicy
}

export function updateQuestionMetadata(accessToken: string, revisionId: UUID, request: QuestionMetadataUpdate): Promise<QuestionMetadataRead> {
  return requestJson<QuestionMetadataRead>(`/api/v1/question-editor/revisions/${encodeURIComponent(revisionId)}/metadata`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export type TextBlockPayloadRead = {
  source_text: string
  document: StructuredTextDocument
  format_version: 1
}

export type TextBlockWritePayload = {
  document: StructuredTextDocument
  format_version?: 1
}

export type TextBlockCreate = {
  block_type: 'text'
  payload: TextBlockWritePayload
  expected_revision_updated_at: IsoDateTime
}

export type TextBlockUpdate = {
  document: StructuredTextDocument
  format_version?: 1
  expected_revision_updated_at: IsoDateTime
}

export type FormulaBlockPayloadRead = {
  source_latex: string
  format_version: 1
}

export type FormulaBlockWritePayload = {
  source_latex: string
  format_version?: 1
}

export type FormulaBlockCreate = {
  block_type: 'formula'
  payload: FormulaBlockWritePayload
  expected_revision_updated_at: IsoDateTime
}

export type FormulaBlockUpdate = {
  source_latex: string
  format_version?: 1
  expected_revision_updated_at: IsoDateTime
}

export type ImageBlockPayloadRead = {
  media_asset_id: UUID
  alt_text: string | null
}

export type ImageBlockCreate = {
  block_type: 'image'
  payload: ImageBlockPayloadRead
  expected_revision_updated_at: IsoDateTime
}

export type ImageBlockUpdate = ImageBlockPayloadRead & {
  expected_revision_updated_at: IsoDateTime
}

export type GeometryBlockPayloadRead = {
  source_data: JsonObject
  format_version: 1
}

export type GeometryBlockWritePayload = {
  source_data: GeometrySourceDataV1
  format_version?: 1
}

export type GeometryBlockCreate = {
  visual_placement?: PersistedVisualPlacement
  block_type: 'geometry'
  payload: GeometryBlockWritePayload
  expected_revision_updated_at: IsoDateTime
}

export type GeometryBlockUpdate = {
  visual_placement?: PersistedVisualPlacement
  source_data: GeometrySourceDataV1
  format_version?: 1
  expected_revision_updated_at: IsoDateTime
}

export type BlockDeleteRequest = {
  expected_revision_updated_at: IsoDateTime
}

export type BlockOrderRequest = {
  block_ids: UUID[]
  expected_revision_updated_at: IsoDateTime
}

export type TextBlockRead = {
  id: UUID
  block_type: 'text'
  sort_order: number
  payload: TextBlockPayloadRead
}

export type FormulaBlockRead = {
  id: UUID
  block_type: 'formula'
  sort_order: number
  payload: FormulaBlockPayloadRead
}

export type ImageBlockRead = {
  visual_placement?: PersistedVisualPlacement | null
  id: UUID
  block_type: 'image'
  sort_order: number
  payload: ImageBlockPayloadRead
}

export type GeometryBlockRead = {
  visual_placement?: PersistedVisualPlacement | null
  id: UUID
  block_type: 'geometry'
  sort_order: number
  payload: GeometryBlockPayloadRead
}

export type ContentBlockRead =
  | TextBlockRead
  | FormulaBlockRead
  | ImageBlockRead
  | GeometryBlockRead

export type SolutionTextBlockRead = {
  id: UUID
  block_type: 'text'
  sort_order: number
  step_index: number | null
  presentation_role: SolutionPresentationRole
  source_text: string
  document: StructuredTextDocument
  format_version: 1
}

export type SolutionFormulaBlockRead = {
  id: UUID
  block_type: 'formula'
  sort_order: number
  step_index: number | null
  presentation_role: SolutionPresentationRole
  source_latex: string
  format_version: 1
}

export type SolutionBlockRead = SolutionTextBlockRead | SolutionFormulaBlockRead
export type SolutionPresentationRole = 'reasoning' | 'governing_formula' | 'result' | 'final_answer' | 'verification' | 'note' | 'property'
export type SolutionRead = { id: UUID; blocks: SolutionBlockRead[] }
export type SolutionMutationRequest = { expected_revision_updated_at: IsoDateTime }
export type SolutionTextBlockCreate = SolutionMutationRequest & {
  block_type: 'text'
  payload: TextBlockWritePayload
  step_index?: number | null
  presentation_role?: SolutionPresentationRole
}
export type SolutionTextBlockUpdate = SolutionMutationRequest & { payload: TextBlockWritePayload }
export type SolutionFormulaBlockCreate = SolutionMutationRequest & {
  block_type: 'formula'
  payload: FormulaBlockWritePayload
  step_index?: number | null
  presentation_role?: SolutionPresentationRole
}
export type SolutionFormulaBlockUpdate = SolutionMutationRequest & { payload: FormulaBlockWritePayload }
export type SolutionBlockOrderRequest = SolutionMutationRequest & { block_ids: UUID[] }

export type QuestionRevisionEditorRead = QuestionDraftRead & {
  blocks: ContentBlockRead[]
  answer_policy: AnswerPolicy
  answer_options: AnswerOptionRead[]
  accepted_answers: AcceptedAnswerRead[]
  solution: SolutionRead | null
}

export type AnswerOptionRead = {
  id: UUID
  label: string | null
  order_index: number
  source_text: string
  document: StructuredTextDocument
  format_version: 1
  is_correct: boolean
}

export type AcceptedAnswerRead = {
  id: UUID
  order_index: number
  source_text: string
  document: StructuredTextDocument
  format_version: 1
}

export type AnswerContentRequest = {
  document: StructuredTextDocument
  format_version?: 1
  expected_revision_updated_at: IsoDateTime
}

export type AnswerOptionRequest = AnswerContentRequest & { label?: string | null }
export type AnswerOrderRequest = { answer_ids: UUID[]; expected_revision_updated_at: IsoDateTime }
export type SetCorrectOptionsRequest = { option_ids: UUID[]; expected_revision_updated_at: IsoDateTime }

export function createQuestionDraft(
  accessToken: string,
  request: QuestionDraftCreate,
): Promise<QuestionDraftRead> {
  return requestJson<QuestionDraftRead>('/api/v1/question-editor/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
}

export function getQuestionRevisionForEditor(
  accessToken: string,
  revisionId: UUID,
): Promise<QuestionRevisionEditorRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)

  return requestJson<QuestionRevisionEditorRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}

export function createTextBlock(
  accessToken: string,
  revisionId: UUID,
  request: TextBlockCreate,
): Promise<TextBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)

  return requestJson<TextBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/text`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function updateTextBlock(
  accessToken: string,
  revisionId: UUID,
  blockId: UUID,
  request: TextBlockUpdate,
): Promise<TextBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)
  const encodedBlockId = encodeURIComponent(blockId)

  return requestJson<TextBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/`
      + `${encodedBlockId}/text`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function createFormulaBlock(
  accessToken: string,
  revisionId: UUID,
  request: FormulaBlockCreate,
): Promise<FormulaBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)

  return requestJson<FormulaBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/formula`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function updateFormulaBlock(
  accessToken: string,
  revisionId: UUID,
  blockId: UUID,
  request: FormulaBlockUpdate,
): Promise<FormulaBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)
  const encodedBlockId = encodeURIComponent(blockId)

  return requestJson<FormulaBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/`
      + `${encodedBlockId}/formula`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function createImageBlock(
  accessToken: string,
  revisionId: UUID,
  request: ImageBlockCreate,
): Promise<ImageBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)

  return requestJson<ImageBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/image`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function updateImageBlock(
  accessToken: string,
  revisionId: UUID,
  blockId: UUID,
  request: ImageBlockUpdate,
): Promise<ImageBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)
  const encodedBlockId = encodeURIComponent(blockId)

  return requestJson<ImageBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/`
      + `${encodedBlockId}/image`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function createGeometryBlock(
  accessToken: string,
  revisionId: UUID,
  request: GeometryBlockCreate,
): Promise<GeometryBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)

  return requestJson<GeometryBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/geometry`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function updateGeometryBlock(
  accessToken: string,
  revisionId: UUID,
  blockId: UUID,
  request: GeometryBlockUpdate,
): Promise<GeometryBlockRead> {
  const encodedRevisionId = encodeURIComponent(revisionId)
  const encodedBlockId = encodeURIComponent(blockId)

  return requestJson<GeometryBlockRead>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/`
      + `${encodedBlockId}/geometry`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

export function deleteBlock(
  accessToken: string,
  revisionId: UUID,
  blockId: UUID,
  request: BlockDeleteRequest,
): Promise<void> {
  const encodedRevisionId = encodeURIComponent(revisionId)
  const encodedBlockId = encodeURIComponent(blockId)
  const encodedTimestamp = encodeURIComponent(
    request.expected_revision_updated_at,
  )

  return requestJson<void>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/`
      + `${encodedBlockId}?expected_revision_updated_at=${encodedTimestamp}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}

export function reorderBlocks(
  accessToken: string,
  revisionId: UUID,
  request: BlockOrderRequest,
): Promise<void> {
  const encodedRevisionId = encodeURIComponent(revisionId)

  return requestJson<void>(
    `/api/v1/question-editor/revisions/${encodedRevisionId}/blocks/order`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )
}

function answerPath(revisionId: UUID, collection: 'answer-options' | 'accepted-answers'): string {
  return `/api/v1/question-editor/revisions/${encodeURIComponent(revisionId)}/${collection}`
}

export function createOption(accessToken: string, revisionId: UUID, request: AnswerOptionRequest): Promise<AnswerOptionRead> {
  return requestJson<AnswerOptionRead>(answerPath(revisionId, 'answer-options'), { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function updateOption(accessToken: string, revisionId: UUID, optionId: UUID, request: AnswerOptionRequest): Promise<AnswerOptionRead> {
  return requestJson<AnswerOptionRead>(`${answerPath(revisionId, 'answer-options')}/${encodeURIComponent(optionId)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function deleteOption(accessToken: string, revisionId: UUID, optionId: UUID, expectedAt: IsoDateTime): Promise<void> {
  return requestJson<void>(`${answerPath(revisionId, 'answer-options')}/${encodeURIComponent(optionId)}?expected_revision_updated_at=${encodeURIComponent(expectedAt)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
}

export function reorderOptions(accessToken: string, revisionId: UUID, request: AnswerOrderRequest): Promise<AnswerOptionRead[]> {
  return requestJson<AnswerOptionRead[]>(`${answerPath(revisionId, 'answer-options')}/actions/order`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function setCorrectOptions(accessToken: string, revisionId: UUID, request: SetCorrectOptionsRequest): Promise<AnswerOptionRead[]> {
  return requestJson<AnswerOptionRead[]>(`${answerPath(revisionId, 'answer-options')}/actions/correct`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function createAcceptedAnswer(accessToken: string, revisionId: UUID, request: AnswerContentRequest): Promise<AcceptedAnswerRead> {
  return requestJson<AcceptedAnswerRead>(answerPath(revisionId, 'accepted-answers'), { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function updateAcceptedAnswer(accessToken: string, revisionId: UUID, answerId: UUID, request: AnswerContentRequest): Promise<AcceptedAnswerRead> {
  return requestJson<AcceptedAnswerRead>(`${answerPath(revisionId, 'accepted-answers')}/${encodeURIComponent(answerId)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function deleteAcceptedAnswer(accessToken: string, revisionId: UUID, answerId: UUID, expectedAt: IsoDateTime): Promise<void> {
  return requestJson<void>(`${answerPath(revisionId, 'accepted-answers')}/${encodeURIComponent(answerId)}?expected_revision_updated_at=${encodeURIComponent(expectedAt)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
}

export function reorderAcceptedAnswers(accessToken: string, revisionId: UUID, request: AnswerOrderRequest): Promise<AcceptedAnswerRead[]> {
  return requestJson<AcceptedAnswerRead[]>(`${answerPath(revisionId, 'accepted-answers')}/actions/order`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

function solutionPath(revisionId: UUID): string {
  return `/api/v1/question-editor/revisions/${encodeURIComponent(revisionId)}/solution`
}

export function getSolution(accessToken: string, revisionId: UUID): Promise<SolutionRead | null> {
  return requestJson<SolutionRead | null>(solutionPath(revisionId), {
    method: 'GET', headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function createSolution(accessToken: string, revisionId: UUID, request: SolutionMutationRequest): Promise<SolutionRead> {
  return requestJson<SolutionRead>(solutionPath(revisionId), {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function deleteSolution(accessToken: string, revisionId: UUID, request: SolutionMutationRequest): Promise<void> {
  return requestJson<void>(solutionPath(revisionId), {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function createSolutionTextBlock(accessToken: string, revisionId: UUID, request: SolutionTextBlockCreate): Promise<SolutionTextBlockRead> {
  return requestJson<SolutionTextBlockRead>(`${solutionPath(revisionId)}/blocks/text`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function updateSolutionTextBlock(accessToken: string, revisionId: UUID, blockId: UUID, request: SolutionTextBlockUpdate): Promise<SolutionTextBlockRead> {
  return requestJson<SolutionTextBlockRead>(`${solutionPath(revisionId)}/blocks/${encodeURIComponent(blockId)}/text`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function createSolutionFormulaBlock(accessToken: string, revisionId: UUID, request: SolutionFormulaBlockCreate): Promise<SolutionFormulaBlockRead> {
  return requestJson<SolutionFormulaBlockRead>(`${solutionPath(revisionId)}/blocks/formula`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function updateSolutionFormulaBlock(accessToken: string, revisionId: UUID, blockId: UUID, request: SolutionFormulaBlockUpdate): Promise<SolutionFormulaBlockRead> {
  return requestJson<SolutionFormulaBlockRead>(`${solutionPath(revisionId)}/blocks/${encodeURIComponent(blockId)}/formula`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function deleteSolutionBlock(accessToken: string, revisionId: UUID, blockId: UUID, expectedAt: IsoDateTime): Promise<void> {
  return requestJson<void>(`${solutionPath(revisionId)}/blocks/${encodeURIComponent(blockId)}?expected_revision_updated_at=${encodeURIComponent(expectedAt)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function reorderSolutionBlocks(accessToken: string, revisionId: UUID, request: SolutionBlockOrderRequest): Promise<SolutionBlockRead[]> {
  return requestJson<SolutionBlockRead[]>(`${solutionPath(revisionId)}/blocks/actions/order`, {
    method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}
