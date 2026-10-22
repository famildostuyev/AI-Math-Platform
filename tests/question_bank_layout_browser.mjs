import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

/** Actual production DOM/computed-style audit; transport is the real local backend. */
export async function auditQuestionBankLayout({ send, evaluate, until, context, broken = false, phase = 'initial' }) {
  await until('document.querySelector(".admin-question-bank-table-wrap tbody tr")')
  const reports = []
  for (const width of [1440, 1280, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
    await evaluate('window.scrollTo(0,0);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const report = await evaluate(`(()=>{
      const box=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,classes:e.className,x:b.x,y:b.y,width:b.width,height:b.height,display:s.display,gridColumns:s.gridTemplateColumns,gridRows:s.gridTemplateRows,gridRow:s.gridRow,gridColumn:s.gridColumn,overflowX:s.overflowX,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth}};
      const shell=document.querySelector('.app-shell'),main=document.querySelector('.admin-question-bank-workspace'),sidebar=document.querySelector('.sidebar'),table=document.querySelector('.admin-question-bank-table-wrap table');
      const headers=[...table.querySelectorAll('th')].map(e=>({text:e.innerText,...box(e)}));
      const controls=[...document.querySelectorAll('.admin-question-bank-tools input,.admin-question-bank-tools select,.admin-question-bank-tools button')].map(box);
      const actions=[...table.querySelectorAll('button')].map(box);
      return {viewport:innerWidth,shell:box(shell),children:[...shell.children].map(box),main:box(main),sidebar:box(sidebar),table:box(table),headers,controls,actions,headerOverflow:headers.filter(h=>h.scrollWidth>h.clientWidth+1).map(h=>h.text)};
    })()`)
    reports.push(report)
    if (broken) {
      assert.equal(report.children.length, 3, 'reproduce the accidental third grid item')
      assert.ok(report.main.width <= report.sidebar.width + 1, 'reproduce narrow table in sidebar grid column')
      assert.ok(report.children[1].tag === 'BUTTON' && report.children[1].height >= 900, 'reproduce giant centered PDF control')
    } else {
      assert.equal(report.children.length, 2, 'sidebar and exactly one active workspace')
      assert.equal(report.children[1].tag, 'MAIN')
      assert.ok(Math.abs(report.main.x - report.sidebar.width) < 1)
      assert.ok(Math.abs(report.main.width - (report.shell.width - report.sidebar.width)) < 1)
      assert.ok(report.main.y < 1, 'workspace starts in first grid row')
      assert.ok(report.table.width > 850, `desktop table compressed: ${report.table.width}`)
      assert.deepEqual(report.headerOverflow, [], 'desktop headers must fit their cells')
      assert.ok(report.controls.every(c => c.width > 25), 'readable controls')
      assert.ok(report.actions.length && report.actions.every(c => c.scrollWidth <= c.clientWidth + 1), 'row action text must not clip')
      for (let i = 0; i < report.controls.length; i++) for (const other of report.controls.slice(i + 1)) {
        const control = report.controls[i]
        const overlapX = Math.min(control.x + control.width, other.x + other.width) - Math.max(control.x, other.x)
        const overlapY = Math.min(control.y + control.height, other.y + other.height) - Math.max(control.y, other.y)
        assert.ok(overlapX <= 1 || overlapY <= 1, 'search/filter controls must not overlap')
      }
      assert.ok(!report.children.some(child => child.tag === 'BUTTON'))
    }
    if (width === 1440) {
      const save = async suffix => {
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        const file = path.join(path.dirname(context.pdfPath), `question-bank-${broken ? 'before' : 'after'}-${phase}-${suffix}.png`)
        await fs.writeFile(file, Buffer.from(screenshot.result.data, 'base64')); console.log('Layout screenshot:', file)
      }
      await save('top')
      await evaluate('document.querySelector(".admin-question-bank-workspace").scrollIntoView({block:"start"})')
      await save('table')
    }
  }
  const file = path.join(path.dirname(context.pdfPath), `question-bank-${broken ? 'before' : 'after'}-${phase}-measurements.json`)
  await fs.writeFile(file, JSON.stringify(reports, null, 2))
  for (const r of reports) console.log(JSON.stringify({ phase, broken, viewport: r.viewport, gridColumns: r.shell.gridColumns, children: r.children.length, main: { x: r.main.x, y: r.main.y, width: r.main.width }, tableWidth: r.table.width, headerOverflow: r.headerOverflow }))
  console.log('Layout measurements:', file)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await evaluate('window.scrollTo(0,0)')
}
