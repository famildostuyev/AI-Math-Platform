from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class MathLiveRibbonMenuContractTest(unittest.TestCase):
    def test_more_visibility_and_copy_section_are_presentation_only(self):
        ribbon = (ROOT / 'frontend/src/components/UniversalEditorRibbon.tsx').read_text(encoding='utf-8')
        self.assertIn("      <details open={activeMenu === 'Daha çox'}>", ribbon)
        self.assertEqual(ribbon.count(">Daha çox ▾</summary>"), 1)
        self.assertIn('getMoreMathRibbonActions(mathActions)', ribbon)
        self.assertIn("trigger('Daha çox', !disabled)", ribbon)
        self.assertIn('const mathActions = getMathRibbonActions(activeMath)', ribbon)
        self.assertIn('action.run(session?.restoreMathTarget() ?? null)', ribbon)
        adapter = (ROOT / 'frontend/src/components/mathLiveRibbonMenu.ts').read_text(encoding='utf-8')
        for token in ('copy-latex', 'copy-ascii-math', 'copy-math-ml', 'Typst kimi köçür', 'active !== field'):
            self.assertIn(token, adapter)

    def test_stage_five_only_removes_editing_entries_and_style_nesting(self):
        ribbon = (ROOT / 'frontend/src/components/UniversalEditorRibbon.tsx').read_text(encoding='utf-8')
        more = ribbon.split("open={activeMenu === 'Daha çox'}", 1)[1].split('</details>', 1)[0]
        self.assertIn('Daha çox ▾', more)
        for label in ('Kopyala', 'Kəs', 'Yapışdır', 'Hamısını seç'):
            self.assertNotIn(label, more)
        self.assertIn('getMoreMathRibbonActions(mathActions)', more)
        style = ribbon.split('className="universal-editor-formula-style"', 1)[1].split('</details>', 1)[0]
        self.assertIn('<NativeFormulaActions ungrouped', style)
        self.assertIn("['variant-style-up', 'variant-style-bold', 'variant-style-italic']", style)
        self.assertIn('aria-pressed={action.checked}', ribbon)

    def test_matrix_panel_is_contextual_and_uses_shared_insertion(self):
        menu = (ROOT / 'frontend/src/components/MatrixMenu.tsx').read_text(encoding='utf-8')
        for token in ('[[2, 2], [3, 3], [3, 4]]', 'Matris əlavə et', 'Sətir sayı', 'Sütun sayı', '>Əlavə et</button>', '{custom && <form', 'session?.insertMath(latex)', '<MathContent', 'maxMatrixCols'):
            self.assertIn(token, menu)
        self.assertNotIn('<dialog', menu)

    def test_function_groups_single_labels_and_log_previews(self):
        ribbon = (ROOT / 'frontend/src/components/UniversalEditorRibbon.tsx').read_text(encoding='utf-8')
        for group in ('Triqonometrik funksiyalar', 'Tərs triqonometrik funksiyalar'):
            self.assertIn(group, ribbon)
        for name in ('sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'arcsin', 'arccos', 'arctan', 'arccot'):
            command = r'\\operatorname{' + name + '}' if name in ('cosec', 'arccot') else r'\\' + name
            self.assertIn("['" + name + "', '" + command + "(#0)']", ribbon)
        self.assertNotIn('<MenuPreview label={name}', ribbon)
        self.assertIn('session?.insertMath(latex); closeMenu() }}>{name}</button>', ribbon)
        self.assertIn(r"'Loqarifm': '\\log x', 'Əsaslı loqarifm': '\\log_a x'", ribbon)
        self.assertIn(r"['Loqarifm', '\\log(#0)']", ribbon)
        self.assertIn("action.id === 'insert-log-base'", ribbon)

    def test_stage_two_templates_and_scoped_native_filter(self):
        ribbon = (ROOT / 'frontend/src/components/UniversalEditorRibbon.tsx').read_text(encoding='utf-8')
        for template in (r"['Kvadrat', '#0^2']", r"['Qüvvət', '#0^{#?}']", r"['İndeks', '#0_{#?}']", r"['Qüvvət və indeks', '#0_{#?}^{#?}']", r"['Dairəvi mötərizə', '\\left(#0\\right)']", r"['Sol dairəvi, sağ kvadrat', '\\left(#0\\right]']", r"['Sol kvadrat, sağ dairəvi', '\\left[#0\\right)']", r"['Kvadrat mötərizə', '\\left[#0\\right]']", r"['Fiqurlu mötərizə', '\\left\\{#0\\right\\}']"):
            self.assertIn(template, ribbon)
        for preview in ('x^2', 'x^n', 'x_i', 'x_i^n', r'\\left(\\,\\right)', r'\\left(\\,\\right]', r'\\left[\\,\\right)', r'\\left[\\,\\right]', r'\\left\\{\\,\\right\\}', r'\\left|\\,\\right|'):
            self.assertIn(preview, ribbon)
        self.assertIn("label === 'Mötərizə' && action.id === 'insert-modulus'", ribbon)

    def test_stage_one_labels_previews_and_original_templates(self):
        ribbon = (ROOT / 'frontend/src/components/UniversalEditorRibbon.tsx').read_text(encoding='utf-8')
        for template in (r"['Böyük kəsr', '\\frac{#0}{#?}']", r"['Kiçik kəsr', '\\tfrac{#0}{#?}']", r"['Kvadrat kök', '\\sqrt{#0}']", r"['n-ci dərəcədən kök', '\\sqrt[#?]{#0}']", r"['Limit', '\\lim_{x\\to #?}#0']"):
            self.assertIn(template, ribbon)
        self.assertIn("label === 'Limit' ? null : label", ribbon)
        self.assertIn('<MathContent', ribbon)
        for preview in (r'\\displaystyle\\frac{a}{b}', r'\\tfrac{a}{b}', r'\\sqrt{x}', r'\\sqrt[n]{x}', r'\\sqrt[\\square]{\\square}'):
            self.assertIn(preview, ribbon)
        self.assertNotIn("'n-ci kök'", ribbon)

    def test_shared_ribbon_layout_and_inline_control_visibility(self):
        css = (ROOT / 'frontend/src/components/UniversalEditor.css').read_text(encoding='utf-8')
        ribbon_rule = css.split(':is(.universal-editor-math-ribbon, .universal-editor-geometry-ribbon) {', 1)[1].split('}', 1)[0]
        for declaration in ('display: flex', 'flex-direction: row', 'flex-wrap: wrap'):
            self.assertIn(declaration, ribbon_rule)
        for part in ('virtual-keyboard-toggle', 'menu-toggle'):
            rule = css.split(f'.universal-editor .structured-inline-math .mathlive-field::part({part})', 1)[1].split('}', 1)[0]
            self.assertIn('display: none', rule)
        browser = (ROOT / 'tests/mathlive_ribbon_browser.mjs').read_text(encoding='utf-8')
        self.assertIn('Desktop Algebra controls share one horizontal row', browser)
        self.assertIn('Native formula toggles occupy no space', browser)

    def test_installed_menu_coverage_and_exact_field_execution(self):
        script = r'''
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {getMathRibbonActions} from './frontend/src/components/mathLiveRibbonMenu.ts';
const source=fs.readFileSync('frontend/node_modules/mathlive/mathlive.mjs','utf8');
const native=source.slice(source.indexOf('// src/editor/default-menu.ts'),source.indexOf('// src/formats/atom-to-typst.ts'));
const colors=['red','orange','yellow','lime','green','teal','cyan','blue','indigo','purple','magenta','black','dark-grey','grey','light-grey','white'];
const context=vm.createContext({_MenuItemState:class{},BACKGROUND_COLORS:Object.fromEntries(colors.map(c=>[c,c])),FOREGROUND_COLORS:Object.fromEntries(colors.map(c=>[c,c])),contrast:()=>'',asHexColor:()=>'',MathfieldElement:{computeEngine:null}});
vm.runInContext(native,context);
const calls=[];
const nativeField={isSelectionEditable:true,hasEditableContent:true,options:{readOnly:false},model:{selectionIsCollapsed:true,parentEnvironment:{environmentName:'pmatrix',minRows:1,maxRows:10,minColumns:1,maxColumns:10,rows:[[1,2],[3,4]]},at:()=>({type:'array',environmentName:'pmatrix'})},insert:s=>calls.push(s)};
const items=context.getDefaultMenuItems(nativeField);
const expected=[];
function flatten(items,path=''){items.forEach((item,i)=>{const key=path+'/'+i;if(item.submenu)flatten(item.submenu,key);else if(item.onMenuSelect)expected.push([key,item.id]);});}
flatten(items);
// Force all availability branches to cover conditional native capabilities too.
function expose(items){for(const item of items){item.visible=true;item.enabled=true;item.checked=false;if(item.submenu)expose(item.submenu)}}
expose(items);
const field={isConnected:true,disabled:false,readOnly:false,menuItems:items,focus(){calls.push('focus')},dispatchEvent(){calls.push('input')}};
let actions=getMathRibbonActions(field);
assert.equal(actions.length,expected.length,'Every installed native command is mapped');
assert.equal(new Set(actions.map(a=>a.key)).size,expected.length);
assert.equal(actions.filter(a=>a.section==='Yeni matris').length,25);
assert.equal(actions.filter(a=>a.section==='Formula rəngi').length,16);
assert.equal(actions.filter(a=>a.section==='Formula fonu').length,16);
assert.ok(actions.some(a=>a.label==='Typst kimi köçür'));
assert.ok(actions.some(a=>a.label==='LaTeX kimi köçür'));
for(const [id,label] of [['insert-argument','Arqument'],['insert-real-part','Həqiqi hissə'],['insert-imaginary-part','Xəyali hissə'],['insert-conjugate','Qoşma kompleks ədəd']]){
 const action=actions.find(a=>a.id===id);assert.equal(action.label,label);assert.equal(action.group,'Funksiya');
}
const rootAction=actions.find(a=>a.id==='insert-nth-root');
for(const [id,label,template] of [
 ['insert-log-base','Əsaslı loqarifm','\\log_{#?}{#?}'],
 ['insert-derivative','Törəmə','\\dfrac{\\mathrm{d}}{\\mathrm{d}x}#?\\bigm|_{x=#?}'],
 ['insert-nth-derivative','n-ci tərtib törəmə','\\dfrac{\\mathrm{d}^#?}{\\mathrm{d}x^#?}#?\\bigm|_{x=#?}'],
 ['insert-argument','Arqument','\\arg(#?)'],['insert-real-part','Həqiqi hissə','\\Re(#?)'],
 ['insert-imaginary-part','Xəyali hissə','\\Im(#?)'],['insert-conjugate','Qoşma kompleks ədəd','\\overline{#?}'],
]){const action=actions.find(a=>a.id===id);assert.equal(action.label,label);assert.equal(action.group,'Funksiya');assert.equal(action.run(field),true);assert.deepEqual(calls,['focus',template,'input']);calls.length=0;}
assert.equal(rootAction.label,'n-ci dərəcədən kök şablonu');
assert.equal(rootAction.run(field),true);
assert.deepEqual(calls,['focus','\\sqrt[#?]{#?}','input']);
calls.length=0;
for(const [key,id] of expected){
 const group=actions.find(a=>a.key===key).group;
 if(id.startsWith('insert-matrix-')||id.startsWith('environment-')||/^(add|delete)-(row|column)/.test(id))assert.equal(group,'Matris');
 if(/^(color-|background-color-|variant-)/.test(id))assert.equal(group,'Mətn formatı');
 if(/^(accent-|decoration-)/.test(id))assert.equal(group,'Daha çox');
 if(/^(mode-|copy-|cut$|paste$|select-all$)/.test(id))assert.equal(group,'Daha çox');
}
const absolute=actions.find(a=>a.label==='Modul / mütləq qiymət');
assert.equal(absolute.run({...field}),false,'Never execute on another field');
assert.equal(calls.length,0);
assert.equal(absolute.run(field),true);
assert.deepEqual(calls,['focus','|#?|','input']);
field.isConnected=false;assert.equal(absolute.run(field),false);
field.isConnected=true;field.readOnly=true;assert.equal(getMathRibbonActions(field).length,0);
field.readOnly=false;field.disabled=true;assert.equal(absolute.run(field),false);
field.disabled=false;
const insert=items.find(x=>x.id==='insert');insert.enabled=false;
assert.equal(absolute.run(field),false,'Recheck parent availability at execution');
insert.enabled=true;insert.visible=false;
assert.ok(!getMathRibbonActions(field).some(a=>a.label==='Modul / mütləq qiymət'));
'''
        result = subprocess.run(
            ['node', '--experimental-strip-types', '--input-type=module', '-e', script],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def test_trace_removed_and_supported_parts_used(self):
        source = ROOT / 'frontend/src'
        for path in source.rglob('*'):
            if path.suffix in ('.ts', '.tsx', '.css'):
                self.assertNotIn('[math-keyboard-trace]', path.read_text(encoding='utf-8'), str(path))
        css = (source / 'components/UniversalEditor.css').read_text(encoding='utf-8')
        self.assertIn('::part(virtual-keyboard-toggle)', css)
        self.assertIn('::part(menu-toggle)', css)


if __name__ == '__main__':
    unittest.main()