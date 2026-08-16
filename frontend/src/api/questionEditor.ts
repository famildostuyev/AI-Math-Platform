import { requestJson } from './client'

export type UUID = string
export type IsoDateTime = string

export type QuestionRevisionStatus =
  | 'draft'
  | 'proposed'
  | 'approved'
  | 'rejected'

export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

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
  value: 'default' | 'serif' | 'sans' | 'math-compatible'
}

export type FontSizeMark = {
  type: 'font_size'
  value: 'small' | 'normal' | 'large' | 'x-large'
}

export type TextMark =
  | BoldMark
  | ItalicMark
  | UnderlineMark
  | FontFamilyMark
  | FontSizeMark

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
  primary_topic_id: UUID | null
  related_topic_ids: UUID[]
  purpose_ids: UUID[]
  difficulty: QuestionDifficulty | null
  updated_at: IsoDateTime
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
  source_data: JsonObject
  format_version?: 1
}

export type GeometryBlockCreate = {
  block_type: 'geometry'
  payload: GeometryBlockWritePayload
  expected_revision_updated_at: IsoDateTime
}

export type GeometryBlockUpdate = {
  source_data: JsonObject
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
  id: UUID
  block_type: 'image'
  sort_order: number
  payload: ImageBlockPayloadRead
}

export type GeometryBlockRead = {
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

export type QuestionRevisionEditorRead = QuestionDraftRead & {
  blocks: ContentBlockRead[]
}

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
