#!/bin/bash
# builds ../index.html from template + data/*.js (sorted), using a stub for missing sections
cd "$(dirname "$0")"
python3 - <<'PY'
import glob
t=open('template.html').read()
data='\n'.join(open(f).read() for f in sorted(glob.glob('data/*.js')))
open('../index.html','w').write(t.replace('/*DATA*/',data))
PY
node -e "
const h=require('fs').readFileSync('../index.html','utf8');const js=h.split('<script>')[1].split('</script>')[0];
const el={innerHTML:'',set oninput(v){},value:''};
global.document={getElementById:()=>el};global.window={addEventListener(){}};global.location={hash:''};global.scrollTo=()=>{};
eval(js.replace('const S=[];','var S=global.S=[];'));
const ids=global.S.map(s=>s.id);for(const s of global.S){location.hash='#'+s.id;}
let n=0;global.S.forEach(s=>s.topics.forEach(t=>{n++;if(!t.call)throw 'no call '+t.t}));
console.log('sections',ids.join(','),'topics',n,'bytes',h.length)"
