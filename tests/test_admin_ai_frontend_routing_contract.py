from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AdminAIFrontendRoutingContractTest(unittest.TestCase):
    def test_question_editor_mounts_universal_panel_as_default(self) -> None:
        editor = (ROOT / "frontend/src/components/AdminQuestionEditor.tsx").read_text(encoding="utf-8")
        self.assertIn("import AIAuthoringPanel from './AIAuthoringPanel'", editor)
        self.assertIn("<AIAuthoringPanel key={revision.revision_id}", editor)
        self.assertNotIn("<AIAuthoringMutationPanel", editor)

    def test_universal_panel_uses_admin_ai_query_not_legacy_proposal_submit(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        default_panel = panel.split("export default function AIAuthoringPanel", 1)[1].split(
            "const warningLabels", 1,
        )[0]
        self.assertIn("queryAdminAI", default_panel)
        self.assertNotIn("submitUserTurn", default_panel)
        api = (ROOT / "frontend/src/api/adminAI.ts").read_text(encoding="utf-8")
        self.assertIn("/api/v1/admin-ai/query", api)
        self.assertNotIn("ai-authoring/conversations", api)

    def test_universal_submit_has_synchronous_duplicate_request_guard(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        default_panel = panel.split("export default function AIAuthoringPanel", 1)[1].split(
            "const warningLabels", 1,
        )[0]
        self.assertIn("requestInFlight.current", default_panel)
        self.assertEqual(default_panel.count("queryAdminAI("), 1)
        self.assertNotIn("setTimeout", default_panel)

    def test_bounded_history_preserves_visible_draft_options_and_correct_label(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        self.assertIn("visibleGeneratedDraftContext", panel)
        self.assertIn("draft.answer_options", panel)
        self.assertIn("draft.correct_option_labels", panel)
        self.assertIn("draft.explanation?.segments", panel)
        self.assertIn("ADMIN_AI_HISTORY_TURN_CHAR_LIMIT", panel)

    def test_universal_pending_proposal_has_explicit_single_decision_boundary(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        default_panel = panel.split("export default function AIAuthoringPanel", 1)[1].split(
            "const warningLabels", 1,
        )[0]
        self.assertIn("item.result.proposal_id &&", default_panel)
        self.assertIn("acceptProposal(token, proposalId)", default_panel)
        self.assertIn("rejectProposal(token, proposalId)", default_panel)
        self.assertIn("proposalDecisionInFlight.current", default_panel)
        self.assertIn("await onAccepted()", default_panel)
        self.assertIn("Təsdiqlə və tətbiq et", default_panel)
        self.assertIn("Ləğv et", default_panel)
        self.assertIn("proposalPreview", panel)
        self.assertIn("item.result.proposal_id &&", default_panel)
        for mojibake in ("TÉ™sdiqlÉ™", "LÉ™ÄŸv", "TÃ", "tÉ™tbiq"):
            self.assertNotIn(mojibake, panel)


    def test_generated_draft_has_deterministic_replacement_proposal_action(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        default_panel = panel.split("export default function AIAuthoringPanel", 1)[1].split(
            "const warningLabels", 1,
        )[0]
        api = (ROOT / "frontend/src/api/adminAI.ts").read_text(encoding="utf-8")
        self.assertIn("/api/v1/admin-ai/replacement-proposals", api)
        self.assertIn("Cari sualla əvəz et", default_panel)
        self.assertIn("item.result.generated_draft && revisionId && !item.result.proposal_id", default_panel)
        self.assertIn("createAdminAIReplacementProposal(token", default_panel)
        self.assertIn("generated_draft: draft", default_panel)
        self.assertIn("proposal_id: proposal.proposal_id", default_panel)
        self.assertIn("proposal_status: proposal.proposal_status", default_panel)
        self.assertIn("replacementRequestsInFlight.current.has(item.id)", default_panel)
        self.assertIn("replacementRequestsInFlight.current.add(item.id)", default_panel)
        self.assertIn("disabled={pendingReplacementItemId === item.id}", default_panel)
        self.assertEqual(default_panel.count("queryAdminAI("), 1)

    def test_persistent_question_draft_promotion_contract_and_eligibility(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        default_panel = panel.split("export default function AIAuthoringPanel", 1)[1].split(
            "const warningLabels", 1,
        )[0]
        api = (ROOT / "frontend/src/api/adminAI.ts").read_text(encoding="utf-8")

        for field in (
            "persistent_draft_id: UUID | null",
            "persistent_draft_status: 'active' | 'promoted' | 'discarded' | null",
            "question_family_id: UUID",
            "question_form_id: UUID",
            "revision_id: UUID",
        ):
            self.assertIn(field, api)
        self.assertIn("/api/v1/admin-ai/question-drafts/${encodeURIComponent(draftId)}/promote", api)
        self.assertIn("method: 'POST'", api)

        eligibility = panel.split(
            "function canPromotePersistentQuestionDraft", 1,
        )[1].split("const ADMIN_AI_HISTORY_TURN_LIMIT", 1)[0]
        self.assertIn("result.generated_draft?.draft_kind === 'question'", eligibility)
        self.assertIn("result.persistent_draft_id !== null", eligibility)
        self.assertIn("result.persistent_draft_status === 'active'", eligibility)
        self.assertEqual(default_panel.count("Yeni sual kimi saxla"), 1)
        self.assertIn("canPromotePersistentQuestionDraft(item.result) &&", default_panel)

    def test_promotion_click_is_guarded_and_updates_only_after_success(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        default_panel = panel.split("export default function AIAuthoringPanel", 1)[1].split(
            "const warningLabels", 1,
        )[0]

        self.assertIn("promotionRequestsInFlight.current.has(item.id)", default_panel)
        self.assertIn("promotionRequestsInFlight.current.add(item.id)", default_panel)
        self.assertIn("promoteAdminAIQuestionDraft(token, draftId)", default_panel)
        self.assertEqual(default_panel.count("promoteAdminAIQuestionDraft(token, draftId)"), 1)
        self.assertIn("persistent_draft_status: promotion.draft_status", default_panel)
        self.assertIn("promotion,", default_panel)
        self.assertLess(
            default_panel.index("promoteAdminAIQuestionDraft(token, draftId)"),
            default_panel.index("persistent_draft_status: promotion.draft_status"),
        )
        self.assertIn("promotionRequestsInFlight.current.delete(item.id)", default_panel)
        self.assertIn("disabled={pendingPromotionItemId === item.id}", default_panel)
        self.assertIn("onOpenRevision(item.promotion!.revision_id)", default_panel)

    def test_promotion_keeps_replacement_flow_unchanged(self) -> None:
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        default_panel = panel.split("export default function AIAuthoringPanel", 1)[1].split(
            "const warningLabels", 1,
        )[0]
        self.assertIn("prepareReplacementProposal(item)", default_panel)
        self.assertIn("createAdminAIReplacementProposal(token", default_panel)
        self.assertIn("acceptProposal(token, proposalId)", default_panel)
        self.assertIn("rejectProposal(token, proposalId)", default_panel)


if __name__ == "__main__":
    unittest.main()
