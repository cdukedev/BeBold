import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const S = 'Reading long passages of text on a screen is hard when attention slides off the line.';
const html = `<body style="margin:0;padding:12px;font-family:Georgia,serif;background:#fff">
${[13,16,20,24,32].map((px,i)=>`
<div style="font-size:${px}px;margin:0 0 6px">
  <span style="font:10px ui-monospace;color:#999">${px}px clamped</span>
  <div id="c${i}">${S}</div>
</div>
<div style="font-size:${px}px;margin:0 0 14px">
  <span style="font:10px ui-monospace;color:#999">${px}px unclamped .028em</span>
  <div id="u${i}">${S}</div>
</div>`).join('')}
<div style="font-size:16px"><span style="font:10px ui-monospace;color:#999">16px control</span><div id="ctl">${S}</div></div>
</body>`;
const b = await chromium.launch({ channel:'chrome', headless:true });
const p = await (await b.newContext({ deviceScaleFactor:1 })).newPage();
await p.setContent(html);
const res = await p.evaluate(() => {
  const cut=(w)=>{const n=[...w].length;return n<=3?1:n===4?2:n<=7?3:n<=9?4:Math.ceil(n*0.4);};
  const mk=(el)=>{const t=el.firstChild,rs=[];let i=0;
    for(const s of new Intl.Segmenter('en',{granularity:'word'}).segment(t.data)){
      if(!s.isWordLike)continue;const c=cut(s.segment);
      rs.push(new StaticRange({startContainer:t,startOffset:s.index,endContainer:t,endOffset:s.index+c}));}
    return rs;};
  const st=document.createElement('style');
  const CL='clamp(0.30px, 0.028em, 0.55px)';
  let css='';
  [0,1,2,3,4].forEach(i=>{
    CSS.highlights.set('c'+i,new Highlight(...mk(document.getElementById('c'+i))));
    CSS.highlights.set('u'+i,new Highlight(...mk(document.getElementById('u'+i))));
    css+=`::highlight(c${i}){text-shadow:${CL} 0 0 currentColor, calc(-1 * ${CL}) 0 0 currentColor}\n`;
    css+=`::highlight(u${i}){text-shadow:.028em 0 0 currentColor,-.028em 0 0 currentColor}\n`;
  });
  st.textContent=css; document.head.appendChild(st);
  return { registered: CSS.highlights.size };
});
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(OUT,'clamp-check.png'), fullPage:true });
// does clamp actually paint? diff a clamped row against an unhighlighted control
const [a,c] = await Promise.all([p.locator('#c1').screenshot(), p.locator('#ctl').screenshot()]);
const ia=PNG.sync.read(a), ic=PNG.sync.read(c);
const n = (ia.width===ic.width&&ia.height===ic.height)
  ? pixelmatch(ia.data,ic.data,null,ia.width,ia.height,{threshold:0.08}) : -1;
console.log(JSON.stringify({...res, clampRendersVsControl:n, painted:n>0},null,1));
await b.close();
