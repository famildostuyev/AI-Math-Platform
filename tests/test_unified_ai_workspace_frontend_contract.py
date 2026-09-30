from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class UnifiedAIWorkspaceContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        components = ROOT / 'frontend/src/components'
        cls.panel = (components / 'AIAuthoringPanel.tsx').read_text(encoding='utf-8').split('export default function AIAuthoringPanel', 1)[1].split('const warningLabels', 1)[0]
        cls.styles = (components / 'UniversalEditor.css').read_text(encoding='utf-8')
        cls.editor = (components / 'AdminQuestionEditor.tsx').read_text(encoding='utf-8')

    def test_single_compact_command_and_conditional_results(self):
        self.assertEqual(self.panel.count('<AICommandInput'), 1)
        for old in ('1 AI əmri', '2 Bənzər suallar', '3 AI cavabı'):
            self.assertNotIn(old, self.panel)
        self.assertIn("' is-expanded' : ' is-compact'", self.panel)
        self.assertIn('expanded && (history.length > 0 || pending)', self.panel)
        self.assertIn('expanded && similarDrafts.length > 0', self.panel)
        self.assertIn('onClick={() => onExpandedChange(!expanded)}', self.panel)
        self.assertIn('disabled={!canSubmit}', self.panel)
        self.assertIn('<Paperclip size={16}', self.panel)

    def test_contextual_tool_range_optional_condition_and_handler(self):
        self.assertIn('expanded && similarToolOpen &&', self.panel)
        self.assertIn("useState('3')", self.panel)
        self.assertIn('type="number" min="1" max="20" step="1"', self.panel)
        self.assertIn('Əlavə şərt (istəyə bağlı)', self.panel)
        self.assertIn('similarConstraints.trim() ||', self.panel)
        self.assertIn('onClick={() => void generateSimilarQuestions()}', self.panel)
        self.assertEqual(self.panel.count('generateAdminAISimilarQuestionDrafts(token'), 1)
        self.assertNotIn('required', self.panel)
        for label in ('Həllini izah et', 'Bənzər suallar tərtib et', 'Çətinlik səviyyəsini qiymətləndir', 'Statistik məlumatları göstər'):
            self.assertIn(label, self.panel)
        self.assertIn('Cari suala bənzər yeni suallar tərtib edin.', self.panel)
        self.assertIn('} Tərtib et', self.panel)

    def test_vertical_flow_and_persistent_session(self):
        self.assertIn('.ai-authoring-panel.is-expanded { display: flex; flex-direction: column;', self.styles)
        self.assertLess(self.panel.index('id="universal-ai-similar-tool"'), self.panel.index('className="universal-ai-similar-results"'))
        self.assertLess(self.panel.index('className="universal-ai-similar-results"'), self.panel.index('className="ai-authoring-messages universal-ai-response"'))
        self.assertIn('key={revision.revision_id}', self.editor)
        self.assertNotIn('key={expanded}', self.panel)
        self.assertNotIn('useEffect', self.panel)
        self.assertIn('value={instruction} onChange={setInstruction}', self.panel)
        self.assertIn('value={similarConstraints}', self.panel)
        self.assertIn('value={similarCount}', self.panel)


if __name__ == '__main__':
    unittest.main()
