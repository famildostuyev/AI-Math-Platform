from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class UniversalEditorHistoryContractTest(unittest.TestCase):
    def test_real_prosemirror_history_provider(self):
        script = r'''
import assert from 'node:assert/strict';
import {Schema} from './frontend/node_modules/@tiptap/pm/dist/model/index.js';
import {EditorState} from './frontend/node_modules/@tiptap/pm/dist/state/index.js';
import {history,closeHistory} from './frontend/node_modules/@tiptap/pm/dist/history/index.js';
import {getStructuredEditorHistory} from './frontend/src/components/structuredEditorHistory.ts';
const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'inline*'},text:{group:'inline'},inline_math:{inline:true,group:'inline',atom:true,attrs:{latex:{default:''}}}}});
const listeners=new Map();let notifications=0;
const editor={isDestroyed:false,isEditable:true,
 state:EditorState.create({schema,plugins:[history()],doc:schema.node('doc',null,[schema.node('paragraph',null,[schema.text('start'),schema.node('inline_math',{latex:'x'})])])}),
 on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
 off(name,fn){listeners.get(name)?.delete(fn)},
 view:{dom:{contains:()=>false},dispatch(tr){editor.state=editor.state.apply(tr);for(const fn of listeners.get('transaction')??[])fn()}}};
globalThis.document={activeElement:null};
const provider=getStructuredEditorHistory(editor);
assert.equal(getStructuredEditorHistory(editor),provider,'Same editor has one provider');
const unsubscribe=provider.subscribe(()=>notifications++);
assert.equal(provider.getSnapshot(),0);
assert.equal(provider.undo(),false);
editor.view.dispatch(editor.state.tr.insertText('!',1));
assert.equal(provider.getSnapshot(),1);
assert.equal(provider.undo(),true);assert.equal(editor.state.doc.textContent,'start');assert.equal(provider.getSnapshot(),2);
assert.equal(provider.redo(),true);assert.equal(editor.state.doc.textContent,'!start');
provider.undo();editor.view.dispatch(editor.state.tr.insertText('?',1));assert.equal(provider.getSnapshot(),1);assert.equal(provider.redo(),false);
editor.view.dispatch(closeHistory(editor.state.tr));
const atomPosition=7;
editor.view.dispatch(editor.state.tr.setNodeMarkup(atomPosition,undefined,{latex:'x^2'}));
assert.equal(editor.state.doc.nodeAt(atomPosition).attrs.latex,'x^2');
provider.undo();assert.equal(editor.state.doc.nodeAt(atomPosition).attrs.latex,'x');
provider.redo();assert.equal(editor.state.doc.nodeAt(atomPosition).attrs.latex,'x^2');
const before=provider.getSnapshot();editor.view.dispatch(editor.state.tr);assert.equal(provider.getSnapshot(),before,'No-op/focus transaction creates no history');
editor.isEditable=false;assert.equal(provider.getSnapshot(),0);assert.equal(provider.undo(),false);
editor.isEditable=true;editor.isDestroyed=true;assert.equal(provider.getSnapshot(),0);assert.equal(provider.redo(),false);
assert.ok(notifications>0);unsubscribe();assert.equal(listeners.get('transaction').size,0);
'''
        result = subprocess.run(['node', '--experimental-strip-types', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def test_header_placement_accessibility_and_no_save(self):
        components = ROOT / 'frontend/src/components'
        admin = (components / 'AdminQuestionEditor.tsx').read_text(encoding='utf-8')
        controls = (components / 'UniversalEditorHistoryControls.tsx').read_text(encoding='utf-8')
        header = admin.split('<header className="admin-editor-header">', 1)[1].split('</header>', 1)[0]
        self.assertIn('<UniversalEditorHistoryControls', header)
        for label in ('Geri al', 'Yenidən et'):
            self.assertIn(f'aria-label="{label}"', controls)
            self.assertIn(f'title="{label}"', controls)
        self.assertIn('!session?.history.canUndo', controls)
        self.assertIn('!session?.history.canRedo', controls)
        self.assertIn('data-editor-ribbon', controls)
        for name in ('UniversalEditorHistoryControls.tsx', 'universalEditorHistory.ts', 'structuredEditorHistory.ts'):
            source = (components / name).read_text(encoding='utf-8')
            for forbidden in ('fetch(', 'save.current', '../api/', 'createRevision'):
                self.assertNotIn(forbidden, source)


if __name__ == '__main__':
    unittest.main()
