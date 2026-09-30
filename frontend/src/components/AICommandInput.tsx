/** Controlled prompt boundary. The current API accepts plain text; no HTML is serialized. */
export default function AICommandInput({ value, onChange, disabled, expanded }: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  expanded: boolean
}) {
  return <textarea
    id="ai-authoring-instruction"
    aria-label="AI əmri"
    maxLength={10_000}
    rows={expanded ? 2 : 1}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder="AI-yə əmr yazın..."
    disabled={disabled}
  />
}
