(function(){
"use strict";
var S = window.SIM, K = S.kpis, C = S.comps, T = S.team, R = S.rounds;
var app = document.getElementById('app');
var st;

/* ---------- helpers ---------- */
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function add(t,s){if(!s)return t;for(var k in s){t[k]=(t[k]||0)+s[k];}return t;}
function scale(s,f){var o={};for(var k in (s||{})){o[k]=s[k]*f;}return o;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function kdef(id){for(var i=0;i<K.length;i++){if(K[i].id===id)return K[i];}return null;}
function fmt(k,v){
  if(k.unit==='%')return v.toFixed(k.d)+'%';
  if(k.unit==='aed'){var r=Math.round(v);return 'AED '+r+'m';}
  if(k.unit==='wks')return Math.round(v)+' wks';
  return String(Math.round(v));
}
function fmtD(k,d){
  var a=Math.abs(d), s;
  if(k.unit==='%')s=a.toFixed(k.d)+' pts';
  else if(k.unit==='aed')s='AED '+Math.round(a)+'m';
  else if(k.unit==='wks')s=Math.round(a)+' wks';
  else s=String(Math.round(a));
  if((k.unit==='%'&&a<Math.pow(10,-k.d)/2)||(k.unit!=='%'&&Math.round(a)===0))return '<span class="flat">no change</span>';
  var good=(d*k.dir)>0;
  return '<span class="'+(good?'up':'down')+'">'+(d>0?'+':'-')+s+'</span>';
}
function bound(k,v){ if(k.unit==='%'||k.unit==='idx')return clamp(v,0,100); if(k.unit==='wks')return clamp(v,2,52); return v; }
function qChip(q){var c=q>=80?'good':q>=60?'warn':'bad', l=q>=80?'Strong':q>=60?'Workable':'Weak';return '<span class="chip '+c+'">'+l+' · '+Math.round(q)+'</span>';}
function eq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(function(){t.classList.remove('on');},1800);}
function initials(n){return n.split(' ').map(function(x){return x[0];}).join('').slice(0,2);}

/* ---------- scoring ---------- */
function scoreChoice(def,id){var o=def.options.filter(function(x){return x.id===id;})[0];return {q:o.q,kpi:add({},o.kpi),comp:add({},o.comp),out:o.outcome?[o.outcome]:[],tags:[o.tag]};}
function scorePick(def,ids){
  var os=ids.map(function(id){return def.options.filter(function(x){return x.id===id;})[0];});
  var q=os.reduce(function(a,o){return a+o.q;},0)/os.length, kpi={}, comp={}, out=[];
  os.forEach(function(o){add(kpi,o.kpi);add(comp,o.comp);if(o.outcome)out.push(o.outcome);});
  (def.synergy||[]).forEach(function(s){if(s.ids.every(function(i){return ids.indexOf(i)>-1;})){q+=s.q;add(kpi,s.kpi);out.push(s.text);}});
  return {q:clamp(q,0,100),kpi:kpi,comp:comp,out:out,tags:os.map(function(o){return o.tag;})};
}
function band(o,q){return q>=80?o.high:q>=60?o.mid:o.low;}
function scoreAlloc(def,a){
  var dev=0,kpi={},top=null,tv=-1;
  def.items.forEach(function(it){var sh=(a[it.id]||0)/def.total;dev+=Math.abs(sh-it.ideal/def.total);for(var k in it.kpi){kpi[k]=(kpi[k]||0)+it.kpi[k]*sh;}if(sh>tv){tv=sh;top=it;}});
  var q=clamp(100-dev*110,5,100);
  return {q:q,kpi:kpi,comp:scale(def.comp,q/100),out:[band(def.outcomes,q)],tags:[top.tag]};
}
function scoreRank(def,order){
  var f=0,n=order.length;order.forEach(function(id,i){f+=Math.abs(i-def.expert.indexOf(id));});
  var q=clamp(100-f/Math.floor(n*n/2)*100,0,100);
  var first=def.items.filter(function(i){return i.id===order[0];})[0];
  return {q:q,kpi:scale(def.kpi,(q-40)/60),comp:scale(def.comp,q/100),out:[band(def.outcomes,q)],tags:[first.tag]};
}
function scoreMulti(def,arr){
  var qs=0,ws=0,kpi={},comp={},out=[],tags=[];
  def.parts.forEach(function(p,i){var r=p.type==='pick'?scorePick(p,arr[i]):scoreChoice(p,arr[i]);var w=p.w||1;qs+=r.q*w;ws+=w;add(kpi,r.kpi);add(comp,r.comp);out=out.concat(r.out);tags=tags.concat(r.tags);});
  return {q:qs/ws,kpi:kpi,comp:comp,out:out,tags:tags};
}
function score(def,ans){return ({choice:scoreChoice,pick:scorePick,allocate:scoreAlloc,rank:scoreRank,multi:scoreMulti})[def.type](def,ans);}

/* ---------- team aggregation ---------- */
function optQ(def,id){var o=def.options.filter(function(x){return x.id===id;})[0];return o?o.q:0;}
function aggChoice(def,ans){var c={},best=null;ans.forEach(function(a){c[a]=(c[a]||0)+1;});ans.forEach(function(a){if(best===null||c[a]>c[best])best=a;});return best;}
function aggPick(def,ans){var c={};ans.forEach(function(l){l.forEach(function(a){c[a]=(c[a]||0)+1;});});return Object.keys(c).sort(function(x,y){return (c[y]-c[x])||(optQ(def,y)-optQ(def,x));}).slice(0,def.k);}
function fixSum(def,o){var s=0,mx=null;def.items.forEach(function(it){s+=o[it.id];if(mx===null||o[it.id]>o[mx])mx=it.id;});o[mx]+=def.total-s;return o;}
function aggAlloc(def,ans){var o={};def.items.forEach(function(it){var m=ans.reduce(function(s,a){return s+(a[it.id]||0);},0)/ans.length;o[it.id]=Math.round(m/def.step)*def.step;});return fixSum(def,o);}
function aggRank(def,ans){var p={};ans.forEach(function(o){o.forEach(function(id,i){p[id]=(p[id]||0)+(o.length-i);});});return def.items.map(function(i){return i.id;}).sort(function(a,b){return p[b]-p[a];});}
function teamAnswer(def){
  var ans=T.map(function(t){return def.team[t.id].a;});
  if(def.type==='choice')return aggChoice(def,ans);
  if(def.type==='pick')return aggPick(def,ans);
  if(def.type==='allocate')return aggAlloc(def,ans);
  if(def.type==='rank')return aggRank(def,ans);
  return def.parts.map(function(p,i){var pa=ans.map(function(a){return a[i];});return p.type==='pick'?aggPick(p,pa):aggChoice(p,pa);});
}
function combos(arr,k){var out=[];(function go(s,c){if(c.length===k){out.push(c.slice());return;}for(var i=s;i<arr.length;i++){c.push(arr[i]);go(i+1,c);c.pop();}})(0,[]);return out;}
function bestPick(def){var b=null,bq=-1;combos(def.options.map(function(o){return o.id;}),def.k).forEach(function(c){var q=scorePick(def,c).q;if(q>bq){bq=q;b=c;}});return b;}
function bestChoice(def){return def.options.slice().sort(function(a,b){return b.q-a.q;})[0].id;}
function bestAnswer(def){
  if(def.type==='choice')return bestChoice(def);
  if(def.type==='pick')return bestPick(def);
  if(def.type==='allocate'){var o={};def.items.forEach(function(it){o[it.id]=it.ideal;});return o;}
  if(def.type==='rank')return def.expert.slice();
  return def.parts.map(function(p){return p.type==='pick'?bestPick(p):bestChoice(p);});
}
function secondChoice(def){return def.options.slice().sort(function(a,b){return b.q-a.q;})[1].id;}
function evenAlloc(def){var o={},n=def.items.length;def.items.forEach(function(it){o[it.id]=Math.round(def.total/n/def.step)*def.step;});return fixSum(def,o);}
function initialAnswer(def){
  if(def.type==='choice')return null;
  if(def.type==='pick')return [];
  if(def.type==='allocate')return evenAlloc(def);
  if(def.type==='rank')return def.items.map(function(i){return i.id;});
  return def.parts.map(function(p){return p.type==='pick'?[]:null;});
}
function complete(def,a){
  if(def.type==='choice')return a!==null;
  if(def.type==='pick')return a.length===def.k;
  if(def.type==='allocate')return sumAlloc(a)===def.total;
  if(def.type==='rank')return true;
  return def.parts.every(function(p,i){return p.type==='pick'?a[i].length===p.k:a[i]!==null;});
}
function sumAlloc(a){var s=0;for(var k in a)s+=a[k];return s;}
function labelOf(def,id){var o=def.options.filter(function(x){return x.id===id;})[0];return o?o.label:id;}
function describe(def,a){
  if(def.type==='choice')return labelOf(def,a);
  if(def.type==='pick')return a.map(function(id){return labelOf(def,id);}).join(' · ');
  if(def.type==='allocate')return def.items.filter(function(it){return a[it.id]>0;}).sort(function(x,y){return a[y.id]-a[x.id];}).map(function(it){return it.short+' '+Math.round(a[it.id]/def.total*100)+'%';}).join(' · ');
  if(def.type==='rank')return a.map(function(id,i){return (i+1)+'. '+def.items.filter(function(x){return x.id===id;})[0].short;}).join('  ');
  return def.parts.map(function(p,i){return p.type==='pick'?a[i].map(function(id){return labelOf(p,id);}).join(' + '):labelOf(p,a[i]);}).join(' | ');
}

/* ---------- benchmark path ---------- */
var BENCH=(function(){
  var v={};K.forEach(function(k){v[k.id]=k.start;});var hist=[Object.assign({},v)],comp={};
  R.forEach(function(r){if(r.event)applyK(v,r.event.kpi);var s=score(r,bestAnswer(r));applyK(v,s.kpi);add(comp,s.comp);hist.push(Object.assign({},v));});
  return {hist:hist,comp:comp};
})();
function applyK(v,d){for(var id in (d||{})){var k=kdef(id);if(k)v[id]=bound(k,v[id]+d[id]);}}

/* ---------- state ---------- */
function reset(){
  var v={};K.forEach(function(k){v[k.id]=k.start;});
  st={screen:'intro',r:0,phase:'brief',draft:null,kpi:v,hist:[Object.assign({},v)],log:[],refl:[],tab:'me',impactK:K[0].id,plan:null,evented:{}};
}
reset();

/* ---------- chrome ---------- */
function setRibbon(k){[].forEach.call(document.querySelectorAll('#ribbon span'),function(s){s.classList.toggle('on',s.getAttribute('data-k')===k);});}
function renderSteps(){
  var items=[{n:'0',l:'Case'}].concat(R.map(function(r,i){return {n:String(i+1),l:'Day '+(i+1)};})).concat([{n:'✓',l:'Reports'}]);
  var cur=st.screen==='intro'?0:st.screen==='round'?st.r+1:R.length+1;
  document.getElementById('steps').innerHTML=items.map(function(it,i){var c=i<cur?'done':i===cur?'now':'';return '<span class="s '+c+'"'+(i===cur?' aria-current="step"':'')+'><i>'+it.n+'</i>'+it.l+'</span>';}).join('');
  document.getElementById('tl-title').textContent='Program '+S.letter+' · Project '+S.code;
}
function rail(prev){
  return '<div class="rail">'+K.map(function(k){var v=st.kpi[k.id],d=v-k.start;return '<div class="kpi"><div class="l" title="'+esc(k.label)+'">'+esc(k.short)+'</div><div class="v">'+fmt(k,v)+'</div><div class="d">'+(st.r===0&&st.phase==='brief'&&!prev?'<span class="flat">baseline</span>':fmtD(k,d)+' <span class="flat">vs start</span>')+'</div></div>';}).join('')+'</div>';
}
function go(screen){st.screen=screen;render();window.scrollTo({top:0,behavior:'auto'});}
function render(){
  renderSteps();
  if(st.screen==='intro'){setRibbon('10');renderIntro();}
  else if(st.screen==='round'){setRibbon('20');renderRound();}
  else {setRibbon(st.tab==='work'?'70':'20');renderReports();}
}

/* ---------- intro ---------- */
function renderIntro(){
  app.innerHTML='<section class="hero fade">'+
   '<div><div class="eyebrow">Program '+S.letter+' · '+esc(S.program)+'</div>'+
   '<h1>Project <em>'+S.code+'</em></h1>'+
   '<p class="lead">'+esc(S.caseLead)+'</p>'+
   S.caseParas.map(function(p){return '<p class="sub">'+esc(p)+'</p>';}).join('')+
   '<dl class="facts">'+S.facts.map(function(f){return '<div><dt>'+esc(f[0])+'</dt><dd class="num">'+esc(f[1])+'</dd></div>';}).join('')+'</dl></div>'+
   '<aside class="seat"><div class="eyebrow">Your seat</div><h3 style="margin-top:6px">'+esc(S.entity)+'</h3><p class="muted" style="font-size:14px">'+esc(S.role)+'</p>'+
   '<div class="mates"><div class="mate"><div class="av me">You</div><div><b>You</b><span>'+esc(S.myRole)+'</span></div></div>'+
   T.map(function(t){return '<div class="mate"><div class="av">'+initials(t.name)+'</div><div><b>'+esc(t.name)+'</b><span>'+esc(t.role)+' · '+esc(t.style)+'</span></div></div>';}).join('')+
   '</div><div class="actions" style="margin-top:20px"><button class="btn primary" id="start">Start Day 1</button><button class="btn ghost" id="sample">See a sample run</button></div></aside>'+
   '</section>'+
   '<section class="how fade"><div><b>Learn the idea</b><p>Each day opens with the one theory your trainer has just taught, applied to this case.</p></div><div><b>Decide alone</b><p>Read the brief and the data, then make your call with real trade-offs. No right answers on show.</p></div><div><b>Huddle with your team</b><p>See how four teammates called it and why. Hold your position or adopt theirs.</p></div><div><b>See the impact</b><p>Six business KPIs move with every decision. Finish with your individual report, the team dashboard and a 90-day plan for your real job.</p></div></section>'+
   '<p class="note">'+esc(S.note)+'</p>';
  document.getElementById('start').onclick=function(){st.r=0;st.phase='brief';st.draft=initialAnswer(R[0]);go('round');};
  document.getElementById('sample').onclick=sampleRun;
}

/* ---------- round ---------- */
function renderRound(){
  var r=R[st.r];
  if(r.event&&!st.evented[st.r]){applyK(st.kpi,r.event.kpi);st.evented[st.r]=true;}
  var h='<div class="fade">'+rail();
  h+='<div class="day"><div style="min-width:0"><div class="dayhead"><div class="eyebrow">Day '+(st.r+1)+' of '+R.length+' · '+esc(r.day)+'</div><h2>'+esc(r.title)+'</h2></div>';
  h+='<div class="theory"><span class="tag">10% LEARN</span><div><b>'+esc(r.theory.name)+'.</b> '+esc(r.theory.line)+'</div></div>';
  if(r.event)h+='<div class="event"><div class="eyebrow">Live event</div><b>'+esc(r.event.title)+'</b><p style="font-size:14px;margin-top:2px">'+esc(r.event.text)+'</p></div>';
  if(st.phase==='brief')h+=briefBody(r);
  else if(st.phase==='huddle')h+=huddleBody(r);
  else h+=resultBody(r);
  h+='</div><aside class="side"><div class="datacard"><h4>Case data</h4><dl>'+r.data.map(function(d){return '<div><dt>'+esc(d[0])+'</dt><dd>'+esc(d[1])+'</dd></div>';}).join('')+'</dl></div>'+
     '<div class="datacard" style="margin-top:12px"><h4>Your team</h4><div class="mates" style="margin-top:4px">'+T.map(function(t){return '<div class="mate"><div class="av">'+initials(t.name)+'</div><div><b>'+esc(t.name)+'</b><span>'+esc(t.role)+'</span></div></div>';}).join('')+'</div></div></aside></div></div>';
  app.innerHTML=h;
  bindRound(r);
}
function briefBody(r){
  var h='<p class="brief">'+esc(r.brief)+'</p>';
  if(r.type==='multi'){h+='<p class="prompt">Build your answer in three moves.</p>';r.parts.forEach(function(p,i){h+='<div class="parttitle"><i>MOVE '+(i+1)+'</i>'+esc(p.title)+'</div>'+optsHTML(p,'p'+i,st.draft[i]);});}
  else{h+='<p class="prompt">'+esc(r.prompt)+'</p>';
    if(r.type==='choice'||r.type==='pick')h+=optsHTML(r,'m',st.draft);
    if(r.type==='allocate')h+=allocHTML(r);
    if(r.type==='rank')h+=rankHTML(r);}
  h+='<div class="actions"><button class="btn primary" id="lock" '+(complete(r,st.draft)?'':'disabled')+'>Lock in my decision</button><span class="muted" style="font-size:13px" id="lockhint">'+(complete(r,st.draft)?'You can still change your mind before you lock.':hint(r))+'</span></div>';
  return h;
}
function hint(r){
  if(r.type==='pick')return 'Choose '+r.k+'.';
  if(r.type==='allocate')return 'Allocate the full '+r.total+' '+r.unitLabel+'.';
  if(r.type==='multi')return 'Complete all three moves.';
  return 'Choose one option.';
}
function optsHTML(def,key,cur){
  var multi=def.type==='pick';
  var two=def.options.length>=5&&!def.options.some(function(o){return o.detail&&o.detail.length>70;});
  var h='<div class="opts'+(two?' two':'')+'" role="'+(multi?'group':'radiogroup')+'">'+def.options.map(function(o){
    var on=multi?(cur||[]).indexOf(o.id)>-1:cur===o.id;
    return '<button type="button" class="opt'+(multi?' sq':'')+'" data-key="'+key+'" data-id="'+o.id+'" aria-pressed="'+on+'"><span class="mk"></span><span><span class="t">'+esc(o.label)+'</span>'+(o.detail?'<span class="x">'+esc(o.detail)+'</span>':'')+'</span></button>';
  }).join('')+'</div>';
  if(multi)h+='<p class="counter" data-counter="'+key+'">'+(cur||[]).length+' of '+def.k+' selected</p>';
  return h;
}
function allocHTML(r){
  var a=st.draft;
  return '<div class="alloc">'+r.items.map(function(it){return '<div class="ai"><div class="h"><b>'+esc(it.label)+'</b><span data-v="'+it.id+'">'+amt(r,a[it.id])+'</span></div><div class="x">'+esc(it.detail)+'</div><input type="range" id="rg-'+it.id+'" data-id="'+it.id+'" min="0" max="'+r.total+'" step="'+r.step+'" value="'+a[it.id]+'" aria-label="'+esc(it.label)+'"></div>';}).join('')+'</div>'+
    '<div class="budget" id="budget"><span class="num" id="btxt"></span><div class="bar"><i id="bbar"></i></div></div>';
}
function amt(r,v){return (r.pre||'')+v+(r.post||'')+' · '+Math.round(v/r.total*100)+'%';}
function rankHTML(r){
  var a=st.draft;
  return '<ol class="rank">'+a.map(function(id,i){var it=r.items.filter(function(x){return x.id===id;})[0];return '<li><span class="pos">'+(i+1)+'</span><div class="tx"><b>'+esc(it.label)+'</b><span>'+esc(it.detail)+'</span></div><div class="mv"><button type="button" data-up="'+i+'" aria-label="Move up" '+(i===0?'disabled':'')+'>▲</button><button type="button" data-dn="'+i+'" aria-label="Move down" '+(i===a.length-1?'disabled':'')+'>▼</button></div></li>';}).join('')+'</ol>';
}
function refreshLock(r){
  var b=document.getElementById('lock'),h=document.getElementById('lockhint');if(!b)return;
  var ok=complete(r,st.draft);b.disabled=!ok;h.textContent=ok?'You can still change your mind before you lock.':hint(r);
}
function bindRound(r){
  if(st.phase==='brief'){
    [].forEach.call(app.querySelectorAll('.opt'),function(btn){btn.onclick=function(){
      var key=btn.getAttribute('data-key'),id=btn.getAttribute('data-id');
      var def=key==='m'?r:r.parts[+key.slice(1)];
      var cur=key==='m'?st.draft:st.draft[+key.slice(1)];
      if(def.type==='pick'){var i=cur.indexOf(id);if(i>-1)cur.splice(i,1);else{if(cur.length>=def.k){toast('You can choose '+def.k+'. Unselect one first.');return;}cur.push(id);}}
      else{cur=id;if(key==='m')st.draft=cur;else st.draft[+key.slice(1)]=cur;}
      [].forEach.call(app.querySelectorAll('.opt[data-key="'+key+'"]'),function(o){var oid=o.getAttribute('data-id');o.setAttribute('aria-pressed',def.type==='pick'?String(cur.indexOf(oid)>-1):String(cur===oid));});
      var c=app.querySelector('[data-counter="'+key+'"]');if(c)c.textContent=cur.length+' of '+def.k+' selected';
      refreshLock(r);
    };});
    if(r.type==='allocate'){
      var upd=function(){var s=sumAlloc(st.draft);document.getElementById('btxt').textContent='Allocated '+s+' of '+r.total+' '+r.unitLabel;document.getElementById('bbar').style.width=(s/r.total*100)+'%';document.getElementById('budget').classList.toggle('full',s===r.total);
        r.items.forEach(function(it){var e=app.querySelector('[data-v="'+it.id+'"]');e.textContent=amt(r,st.draft[it.id]);});refreshLock(r);};
      [].forEach.call(app.querySelectorAll('input[type=range]'),function(inp){inp.oninput=function(){var id=inp.getAttribute('data-id'),v=+inp.value,others=sumAlloc(st.draft)-st.draft[id];if(others+v>r.total){v=r.total-others;inp.value=v;}st.draft[id]=v;upd();};});
      upd();
    }
    if(r.type==='rank'){
      [].forEach.call(app.querySelectorAll('[data-up],[data-dn]'),function(b){b.onclick=function(){var up=b.hasAttribute('data-up'),i=+(up?b.getAttribute('data-up'):b.getAttribute('data-dn')),j=up?i-1:i+1,a=st.draft,t=a[i];a[i]=a[j];a[j]=t;renderRound();var f=app.querySelector(up?'[data-up="'+j+'"]':'[data-dn="'+j+'"]');if(f&&!f.disabled)f.focus();};});
    }
    document.getElementById('lock').onclick=function(){
      st.own=JSON.parse(JSON.stringify(st.draft));st.team=teamAnswer(r);
      var o=score(r,st.own),t=score(r,st.team);
      st.aligned=eq(st.own,st.team)||Math.abs(o.q-t.q)<3;
      st.phase='huddle';renderRound();window.scrollTo({top:0});
    };
  }
  else if(st.phase==='huddle'){
    var hold=document.getElementById('hold'),adopt=document.getElementById('adopt'),cont=document.getElementById('cont');
    if(hold)hold.onclick=function(){finalize(r,'held');};
    if(adopt)adopt.onclick=function(){finalize(r,'adopted');};
    if(cont)cont.onclick=function(){finalize(r,'aligned');};
  }
  else{
    var ta=document.getElementById('refl');
    document.getElementById('next').onclick=function(){
      st.refl[st.r]=ta.value.trim();
      if(st.r<R.length-1){st.r++;st.phase='brief';st.draft=initialAnswer(R[st.r]);window.scrollTo({top:0});renderRound();renderSteps();}
      else{st.tab='me';go('reports');}
    };
  }
}
function memberLine(r,t){
  var a=r.team[t.id].a;
  return describe(r,a);
}
function huddleBody(r){
  var h='<p class="prompt">Team huddle</p><p class="muted">Your call is locked. Here is how your team called it.</p><div class="huddle">';
  h+='<div class="hc mine"><div class="av me">You</div><div class="body"><div class="who"><b>Your call</b></div><div class="pick"><b>'+esc(describe(r,st.own))+'</b></div></div></div>';
  T.forEach(function(t){h+='<div class="hc"><div class="av">'+initials(t.name)+'</div><div class="body"><div class="who"><b>'+esc(t.name)+'</b> <span>'+esc(t.role)+'</span></div><p class="says">“'+esc(r.team[t.id].says)+'”</p><div class="pick">Calls: <b>'+esc(memberLine(r,t))+'</b></div></div></div>';});
  h+='</div>';
  if(st.aligned){
    h+='<div class="verdict"><span class="chip good">Aligned</span><span>Your team lands where you did. You go into the decision with one voice.</span></div><div class="actions"><button class="btn primary" id="cont">See what happens</button></div>';
  } else {
    h+='<div class="verdict"><span class="chip warn">Split</span><span>The team’s combined view is <b>'+esc(describe(r,st.team))+'</b>. It differs from yours. You chair this decision: which call goes forward?</span></div>'+
       '<div class="split"><button class="splitbtn" id="hold"><b>Hold my call</b><span>Make the case for your position and take it forward.</span></button><button class="splitbtn" id="adopt"><b>Adopt the team’s call</b><span>Go with the combined view of your team.</span></button></div>';
  }
  return h;
}
function finalize(r,how){
  var o=score(r,st.own),t=score(r,st.team),fin=how==='adopted'?st.team:st.own,f=score(r,fin);
  var kind='aligned';
  if(how==='held')kind=o.q>=t.q?'conviction':'anchored';
  if(how==='adopted')kind=t.q>o.q?'open':'yielded';
  applyK(st.kpi,f.kpi);
  st.hist.push(Object.assign({},st.kpi));
  st.log[st.r]={own:st.own,team:st.team,fin:fin,oq:o.q,tq:t.q,fq:f.q,kind:kind,comp:o.comp,tags:o.tags,kpi:f.kpi,out:f.out};
  st.phase='result';renderRound();window.scrollTo({top:0});
}
var SOCIAL={conviction:['Held a stronger call','You backed your position when it was the better one. That is conviction, not stubbornness.'],anchored:['Held a weaker call','The team saw something you did not. Ask what would have to be true for them to be right.'],open:['Adopted a stronger call','You let a better argument win. That is how strong teams outperform strong individuals.'],yielded:['Gave up a stronger call','Your first call was better. Under pressure, the case for it did not get made.'],aligned:['Aligned with the team','You and the team saw it the same way.']};
function resultBody(r){
  var L=st.log[st.r],b=bestAnswer(r),bq=score(r,b).q;
  var h='<p class="prompt">What happened</p><div class="outcome">'+L.out.map(function(o){return '<p>'+esc(o)+'</p>';}).join('')+'</div>';
  var ch=K.filter(function(k){return Math.abs(L.kpi[k.id]||0)>=0.05;});
  if(ch.length)h+='<div class="deltas">'+ch.map(function(k){return '<div class="kpi"><div class="l">'+esc(k.short)+'</div><div class="v">'+fmt(k,st.kpi[k.id])+'</div><div class="d">'+fmtD(k,L.kpi[k.id])+' <span class="flat">today</span></div></div>';}).join('')+'</div>';
  h+='<div class="qrow"><div class="qbox"><div class="l">Your call</div>'+qChip(L.oq)+'</div><div class="qbox"><div class="l">Team’s combined view</div>'+qChip(L.tq)+'</div><div class="qbox"><div class="l">Call taken forward</div>'+qChip(L.fq)+'</div></div>';
  h+='<p class="social"><b>'+SOCIAL[L.kind][0]+'.</b> '+SOCIAL[L.kind][1]+'</p>';
  h+='<div class="insight"><div class="eyebrow">What strong leaders did</div><p style="font-weight:600">'+esc(describe(r,b))+'</p><p class="muted" style="margin-top:6px;font-size:14px">'+esc(r.insight)+'</p></div>';
  h+='<label class="q" for="refl">Debrief: '+esc(r.debrief)+'</label><textarea id="refl" placeholder="A few lines for your report. Your trainer uses these in the group debrief.">'+esc(st.refl[st.r]||'')+'</textarea>';
  h+='<div class="actions"><button class="btn primary" id="next">'+(st.r<R.length-1?'Go to Day '+(st.r+2):'See my reports')+'</button></div>';
  return h;
}

/* ---------- sample run ---------- */
function sampleRun(){
  reset();
  R.forEach(function(r,i){
    st.r=i;if(r.event){applyK(st.kpi,r.event.kpi);st.evented[i]=true;}
    var own;
    if(i%2===0)own=bestAnswer(r);
    else if(r.type==='choice')own=secondChoice(r);
    else if(r.type==='allocate')own=evenAlloc(r);
    else if(r.type==='multi')own=r.parts.map(function(p){return p.type==='pick'?bestPick(p):secondChoice(p);});
    else own=teamAnswer(r);
    st.own=own;st.team=teamAnswer(r);
    var o=score(r,own),t=score(r,st.team);st.aligned=eq(own,st.team)||Math.abs(o.q-t.q)<3;
    finalize(r,st.aligned?'aligned':(t.q>o.q?'adopted':'held'));
    st.refl[i]='';
  });
  st.sample=true;st.tab='me';go('reports');
}

/* ---------- analytics ---------- */
function compScores(){
  var own={};st.log.forEach(function(L){add(own,L.comp);});
  return C.map(function(c){var mx=BENCH.comp[c.id]||1,v=own[c.id]||0;return {id:c.id,label:c.label,v:Math.round(clamp(30+65*v/mx,10,98))};});
}
function level(v){return v>=82?'Role model':v>=65?'Strong':v>=45?'Developing':'Emerging';}
var ARCH={bold:['Growth Driver','You back the upside and move fast. Your edge is momentum. Watch that cash, capacity and people keep pace with your ambition.'],prudent:['Value Guardian','You protect the downside and keep the business safe. Your edge is discipline. Watch for moments where caution costs you the window.'],people:['Talent Champion','You lead through people and their growth. Your edge is trust. Watch that care for people is matched by hard calls on performance.'],data:['Evidence Builder','You decide on facts and test assumptions. Your edge is rigor. Watch that analysis does not slow the moments that need speed.'],collab:['Coalition Builder','You build ownership across the table. Your edge is alignment. Watch that consensus never replaces a clear call.']};
function archetype(){var c={};st.log.forEach(function(L){L.tags.forEach(function(t){c[t]=(c[t]||0)+1;});});var ks=Object.keys(c).sort(function(a,b){return c[b]-c[a];});return {top:ks[0],second:ks[1]};}
function socialScore(){var s=60;st.log.forEach(function(L){s+={conviction:9,open:9,anchored:-10,yielded:-12,aligned:2}[L.kind];});return clamp(s,10,98);}
function avgQ(key){return st.log.reduce(function(a,L){return a+L[key];},0)/st.log.length;}
function status(k,v){var gap=k.target-k.start;if((v-k.target)*k.dir>=0)return ['good','On target'];if(((v-k.start)/gap)>=0.6)return ['warn','Close'];return ['bad','Off track'];}

/* ---------- charts ---------- */
function radar(cs){
  var W=320,H=300,cx=160,cy=150,R0=105,n=cs.length;
  function pt(i,r){var a=-Math.PI/2+i*2*Math.PI/n;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];}
  var g='';[25,50,75,100].forEach(function(l){g+='<polygon points="'+cs.map(function(c,i){return pt(i,R0*l/100).join(',');}).join(' ')+'" fill="none" stroke="var(--line)" stroke-width="1"/>';});
  cs.forEach(function(c,i){var p=pt(i,R0);g+='<line x1="'+cx+'" y1="'+cy+'" x2="'+p[0]+'" y2="'+p[1]+'" stroke="var(--line)"/>';});
  var poly=cs.map(function(c,i){return pt(i,R0*c.v/100).join(',');}).join(' ');
  g+='<polygon points="'+poly+'" fill="var(--teal)" fill-opacity=".18" stroke="var(--teal)" stroke-width="2"/>';
  cs.forEach(function(c,i){var p=pt(i,R0*c.v/100);g+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.5" fill="var(--teal)"/>';var q=pt(i,R0+22),anc=Math.abs(q[0]-cx)<10?'middle':q[0]>cx?'start':'end';g+='<text x="'+q[0]+'" y="'+(q[1]+4)+'" text-anchor="'+anc+'" font-size="11.5" fill="var(--muted)">'+esc(c.label)+'</text>';});
  return '<div style="overflow-x:auto"><svg viewBox="-110 -4 540 308" width="100%" style="max-width:520px;min-width:340px;display:block;margin:0 auto" role="img" aria-label="Competency radar">'+g+'</svg></div>';
}
function lineChart(kid){
  var k=kdef(kid),a=st.hist.map(function(v){return v[kid];}),b=BENCH.hist.map(function(v){return v[kid];});
  var all=a.concat(b,[k.target,k.start]),mn=Math.min.apply(null,all),mx=Math.max.apply(null,all),pad=(mx-mn)*0.15||1;mn-=pad;mx+=pad;
  var W=640,H=260,L=56,Rr=16,Tp=16,B=34,n=a.length;
  function x(i){return L+i*(W-L-Rr)/(n-1);} function y(v){return Tp+(mx-v)/(mx-mn)*(H-Tp-B);}
  var g='',ticks=4;for(var i=0;i<=ticks;i++){var v=mn+(mx-mn)*i/ticks;g+='<line x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)"/><text x="'+(L-8)+'" y="'+(y(v)+4)+'" text-anchor="end" font-size="11" fill="var(--muted)">'+fmt(k,v)+'</text>';}
  ['Start','D1','D2','D3','D4','D5'].slice(0,n).forEach(function(l,i){g+='<text x="'+x(i)+'" y="'+(H-10)+'" text-anchor="middle" font-size="11" fill="var(--muted)">'+l+'</text>';});
  g+='<line x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y(k.target)+'" y2="'+y(k.target)+'" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="'+(W-Rr)+'" y="'+(y(k.target)-6)+'" text-anchor="end" font-size="11" fill="var(--gold-ink)">Target '+fmt(k,k.target)+'</text>';
  function path(arr){return arr.map(function(v,i){return (i?'L':'M')+x(i)+','+y(v);}).join(' ');}
  g+='<path d="'+path(b)+'" fill="none" stroke="var(--faint)" stroke-width="2" stroke-dasharray="2 4"/>';
  g+='<path d="'+path(a)+' L'+x(n-1)+','+(H-B)+' L'+x(0)+','+(H-B)+' Z" fill="var(--teal)" fill-opacity=".08"/>';
  g+='<path d="'+path(a)+'" fill="none" stroke="var(--teal)" stroke-width="2.5"/>';
  a.forEach(function(v,i){g+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="'+(i===n-1?5:3)+'" fill="var(--teal)"/>';});
  var ly=y(a[n-1])-10;if(Math.abs(ly-(y(k.target)-6))<16)ly=y(a[n-1])+20;
  g+='<text x="'+(x(n-1)-8)+'" y="'+ly+'" text-anchor="end" font-size="12" font-weight="600" fill="var(--ink)">'+fmt(k,a[n-1])+'</text>';
  return '<div style="overflow-x:auto"><svg viewBox="0 0 '+W+' '+H+'" width="100%" style="min-width:420px;display:block" role="img" aria-label="'+esc(k.label)+' over five days">'+g+'</svg></div><div class="legend"><span><i style="background:var(--teal)"></i>Your team</span><span><i style="background:var(--faint)"></i>Expert path</span><span><i style="background:var(--gold)"></i>Target</span></div>';
}

/* ---------- reports ---------- */
function renderReports(){
  var tabs=[['me','My report'],['team','Team dashboard'],['impact','Business impact'],['work','Back at work · 70%']];
  var h='<div class="fade"><div class="eyebrow">Project '+S.code+' · Debrief'+(st.sample?' · Sample run':'')+'</div><h2 style="font-size:clamp(26px,3.4vw,36px);margin-top:6px">Your results</h2>'+
    '<div class="tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" data-tab="'+t[0]+'" aria-selected="'+(st.tab===t[0])+'">'+t[1]+'</button>';}).join('')+'</div><div class="panel">';
  if(st.tab==='me')h+=tabMe();else if(st.tab==='team')h+=tabTeam();else if(st.tab==='impact')h+=tabImpact();else h+=tabWork();
  h+='</div><div class="actions" style="margin-top:28px"><button class="btn ghost" id="again">Restart the simulation</button></div></div>';
  app.innerHTML=h;
  [].forEach.call(app.querySelectorAll('[data-tab]'),function(b){b.onclick=function(){st.tab=b.getAttribute('data-tab');setRibbon(st.tab==='work'?'70':'20');renderReports();};});
  [].forEach.call(app.querySelectorAll('[data-k]'),function(b){if(b.closest('.chips'))b.onclick=function(){st.impactK=b.getAttribute('data-k');renderReports();};});
  document.getElementById('again').onclick=function(){reset();go('intro');};
  if(st.tab==='work')bindWork();
}
function tabMe(){
  var cs=compScores(),ar=archetype(),A=ARCH[ar.top],A2=ar.second?ARCH[ar.second]:null,soc=socialScore();
  var sorted=cs.slice().sort(function(a,b){return b.v-a.v;}),top=sorted[0],low=sorted[sorted.length-1];
  var play=S.plays.filter(function(p){return p.comp===low.id;})[0];
  var h='<div class="grid2"><div class="card"><div class="arch"><div class="badge">'+A[0].split(' ').map(function(w){return w[0];}).join('')+'</div><div><div class="eyebrow">Your decision style</div><h2>'+A[0]+'</h2>'+(A2?'<div class="sub">with a '+A2[0]+' streak</div>':'')+'</div></div><p style="margin-top:14px;font-size:14.5px">'+A[1]+'</p>'+
    '<div class="bars">'+cs.map(function(c){return '<div class="bar"><div class="h"><b>'+esc(c.label)+'</b><span>'+c.v+' · '+level(c.v)+'</span></div><div class="t"><i style="width:'+c.v+'%"></i></div></div>';}).join('')+'</div></div>'+
    '<div class="card"><h3>Leadership competencies</h3><div class="sub">Scored from your own calls, before the team huddle</div>'+radar(cs)+'</div></div>';
  h+='<div class="grid2" style="margin-top:16px"><div class="card"><div class="eyebrow" style="color:var(--good)">Lead with</div><h3 style="margin-top:4px">'+esc(top.label)+'</h3><p class="sub" style="font-size:14px">Your strongest calls came here. Use this strength to coach others on your team.</p></div>'+
    '<div class="card"><div class="eyebrow">Develop next</div><h3 style="margin-top:4px">'+esc(low.label)+'</h3><p class="sub" style="font-size:14px">Your 70% workplace play: <b style="color:var(--ink)">'+esc(play.title)+'.</b> '+esc(play.how)+'</p></div></div>';
  h+='<div class="card" style="margin-top:16px"><div class="row" style="justify-content:space-between"><div><h3>Decisions under team pressure</h3><div class="sub">How you handled the huddle when your view and the team’s differed</div></div><div class="big">'+soc+'<span class="muted" style="font-size:14px;font-weight:500"> /100</span></div></div>'+
    '<div class="tbl" style="margin-top:12px"><table><thead><tr><th>Day</th><th>Your call</th><th>Quality</th><th>In the huddle</th></tr></thead><tbody>'+st.log.map(function(L,i){return '<tr><td>'+(i+1)+'. '+esc(R[i].title)+'</td><td style="min-width:220px">'+esc(describe(R[i],L.own))+'</td><td>'+qChip(L.oq)+'</td><td>'+SOCIAL[L.kind][0]+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  var rf=st.refl.map(function(t,i){return t?'<div><span>Day '+(i+1)+' · '+esc(R[i].debrief)+'</span>'+esc(t)+'</div>':'';}).join('');
  h+='<div class="card" style="margin-top:16px"><h3>Your reflections</h3>'+(rf?'<div class="reflect">'+rf+'</div>':'<p class="sub" style="margin-top:6px">'+(st.sample?'The sample run skips reflections. In a live run they feed the group debrief.':'You skipped the debrief notes. In the live program, your trainer uses them in the group debrief.')+'</p>')+'</div>';
  return h;
}
function tabTeam(){
  var aligned=st.log.filter(function(L){return eq(L.own,L.team)||Math.abs(L.oq-L.tq)<3;}).length;
  var fq=avgQ('fq'),tq=avgQ('tq');
  var voice=T.map(function(t){var n=0;st.log.forEach(function(L,i){var r=R[i],q=score(r,r.team[t.id].a).q;if(eq(r.team[t.id].a,L.fin)||Math.abs(q-L.fq)<3)n++;});return {t:t,n:n};});
  var h='<div class="stat"><div class="card"><div class="sub">Final decision quality</div><div class="big">'+Math.round(fq)+'</div><div class="sub">average of the five calls taken forward</div></div>'+
    '<div class="card"><div class="sub">Team alignment</div><div class="big">'+aligned+'<span class="muted" style="font-size:16px"> of 5 days</span></div><div class="sub">your first call matched the team’s view</div></div>'+
    '<div class="card"><div class="sub">Lift from your leadership</div><div class="big '+(fq-tq>=0?'up':'down')+'">'+(fq-tq>=0?'+':'')+Math.round(fq-tq)+'</div><div class="sub">final calls vs the team’s view alone</div></div></div>';
  h+='<div class="card" style="margin-top:16px"><h3>KPI scorecard</h3><div class="sub">Where the business ended after five days</div><div class="tbl" style="margin-top:8px"><table><thead><tr><th>KPI</th><th class="n">Start</th><th class="n">Final</th><th class="n">Target</th><th class="n">Expert path</th><th>Status</th></tr></thead><tbody>'+
    K.map(function(k){var v=st.kpi[k.id],s=status(k,v);return '<tr><td>'+esc(k.label)+'</td><td class="n">'+fmt(k,k.start)+'</td><td class="n"><b>'+fmt(k,v)+'</b></td><td class="n">'+fmt(k,k.target)+'</td><td class="n muted">'+fmt(k,BENCH.hist[BENCH.hist.length-1][k.id])+'</td><td><span class="chip '+s[0]+'">'+s[1]+'</span></td></tr>';}).join('')+'</tbody></table></div></div>';
  h+='<div class="grid2" style="margin-top:16px"><div class="card"><h3>Decision quality by day</h3><div class="sub">You, the team’s view and the call taken forward</div><div class="tbl" style="margin-top:8px"><table><thead><tr><th>Day</th><th>You</th><th>Team</th><th>Final</th></tr></thead><tbody>'+
    st.log.map(function(L,i){return '<tr><td>'+(i+1)+'</td><td>'+qChip(L.oq)+'</td><td>'+qChip(L.tq)+'</td><td>'+qChip(L.fq)+'</td></tr>';}).join('')+'</tbody></table></div></div>'+
    '<div class="card"><h3>Whose voice carried</h3><div class="sub">Days each teammate’s view matched the call taken forward</div><div class="bars">'+voice.map(function(v){return '<div class="bar"><div class="h"><b>'+esc(v.t.name)+' <span class="muted" style="font-weight:400">· '+esc(v.t.role)+'</span></b><span>'+v.n+' of 5</span></div><div class="t"><i style="width:'+(v.n/5*100)+'%;background:var(--gold)"></i></div></div>';}).join('')+'</div>'+
    '<p class="sub" style="margin-top:14px">In the live program, five or six real participants play each team, and this dashboard combines their individual reports for the trainer and the sponsor.</p></div></div>';
  return h;
}
function tabImpact(){
  var fq=avgQ('fq'),v=fq>=80?['good','high']:fq>=65?['warn','mid']:['bad','low'];
  var title={high:'Approved',mid:'Approved with conditions',low:'Sent back for rework'}[v[1]];
  var movers=K.map(function(k){return {k:k,d:(st.kpi[k.id]-k.start)*k.dir/Math.abs(k.target-k.start)};}).sort(function(a,b){return b.d-a.d;});
  var h='<div class="exco '+v[0]+'"><div class="eyebrow" style="color:inherit;opacity:.8">'+esc(S.gate)+' decision</div><h2>'+title+'</h2><p style="margin-top:6px;max-width:70ch">'+esc(S.verdicts[v[1]])+'</p></div>';
  h+='<div class="card" style="margin-top:16px"><h3>How the business moved</h3><div class="sub">Pick a KPI to compare your team’s path with the expert path</div><div class="chips">'+K.map(function(k){return '<button data-k="'+k.id+'" aria-pressed="'+(st.impactK===k.id)+'">'+esc(k.short)+'</button>';}).join('')+'</div><div style="margin-top:12px">'+lineChart(st.impactK)+'</div></div>';
  h+='<div class="grid2" style="margin-top:16px"><div class="card"><div class="eyebrow" style="color:var(--good)">Biggest gain</div><h3 style="margin-top:4px">'+esc(movers[0].k.label)+'</h3><p class="sub" style="font-size:14px">'+fmt(movers[0].k,movers[0].k.start)+' to '+fmt(movers[0].k,st.kpi[movers[0].k.id])+' against a target of '+fmt(movers[0].k,movers[0].k.target)+'.</p></div>'+
    '<div class="card"><div class="eyebrow">Most exposed</div><h3 style="margin-top:4px">'+esc(movers[movers.length-1].k.label)+'</h3><p class="sub" style="font-size:14px">'+fmt(movers[movers.length-1].k,movers[movers.length-1].k.start)+' to '+fmt(movers[movers.length-1].k,st.kpi[movers[movers.length-1].k.id])+'. This is the line '+esc(S.gate)+' will probe first.</p></div></div>';
  return h;
}
function tabWork(){
  var cs=compScores(),low=cs.slice().sort(function(a,b){return a.v-b.v;})[0];
  var p=st.plan||{play:low.id,challenge:'',first:'',d30:'',d60:'',d90:'',buddy:'',metric:''};
  var h='<div class="card"><div class="eyebrow">The 70% · Apply it to your real work</div><h3 style="margin-top:6px;font-size:20px">Turn the simulation into a 90-day workplace project</h3><p class="sub" style="font-size:14.5px;max-width:72ch;margin-top:6px">The simulation is practice. The change happens back at work, on a live challenge you own. Pick the play you will use, name the result you will measure and the colleague who will hold you to it.</p>'+
    '<div class="timeline"><div><b>Week 1</b>First action, agreed with your manager</div><div><b>Day 30</b>Coach check-in on progress and blockers</div><div><b>Day 60</b>Manager review against your metric</div><div><b>Day 90</b>Impact showcase to EDGE sponsors</div></div></div>';
  h+='<form class="card form" id="wf" style="margin-top:16px" novalidate>'+
    '<div class="full"><label for="w-play">The play I will use</label><select id="w-play">'+S.plays.map(function(pl){return '<option value="'+pl.comp+'"'+(pl.comp===p.play?' selected':'')+'>'+esc(pl.title)+(pl.comp===low.id?' (recommended for you)':'')+'</option>';}).join('')+'</select><p class="sub" id="w-how" style="margin-top:6px"></p></div>'+
    '<div class="full"><label for="w-ch">My real workplace challenge</label><textarea id="w-ch" placeholder="e.g. Our unit’s delivery plan for next year competes with three other priorities for the same engineers.">'+esc(p.challenge)+'</textarea></div>'+
    '<div class="full"><label for="w-first">My first action in the next 7 days</label><input type="text" id="w-first" value="'+esc(p.first)+'" placeholder="e.g. Book 30 minutes with my director to agree the top three priorities"></div>'+
    '<div><label for="w-30">By day 30</label><input type="text" id="w-30" value="'+esc(p.d30)+'" placeholder="Milestone"></div><div><label for="w-60">By day 60</label><input type="text" id="w-60" value="'+esc(p.d60)+'" placeholder="Milestone"></div>'+
    '<div><label for="w-90">By day 90</label><input type="text" id="w-90" value="'+esc(p.d90)+'" placeholder="Result you will show"></div><div><label for="w-m">The metric that proves it</label><input type="text" id="w-m" value="'+esc(p.metric)+'" placeholder="e.g. On-time delivery from 78% to 85%"></div>'+
    '<div class="full"><label for="w-b">My accountability buddy</label><input type="text" id="w-b" value="'+esc(p.buddy)+'" placeholder="A colleague from this cohort who checks in every two weeks"></div>'+
    '<div class="full actions"><button class="btn gold" type="submit">Build my 90-day plan</button></div></form>';
  if(st.plan&&st.plan.built)h+='<div style="margin-top:16px">'+planCard(st.plan)+'<div class="actions"><button class="btn" id="copy">Copy my plan</button></div></div>';
  return h;
}
function planText(p){
  var pl=S.plays.filter(function(x){return x.comp===p.play;})[0];
  return 'MY 90-DAY WORKPLACE PLAN · Project '+S.code+'\n\nPlay: '+pl.title+'\n'+pl.how+'\n\nChallenge: '+(p.challenge||'-')+'\nFirst action (7 days): '+(p.first||'-')+'\nDay 30: '+(p.d30||'-')+'\nDay 60: '+(p.d60||'-')+'\nDay 90: '+(p.d90||'-')+'\nMetric: '+(p.metric||'-')+'\nAccountability buddy: '+(p.buddy||'-');
}
function planCard(p){var t=planText(p).split('\n');return '<div class="plan"><h3>'+esc(t[0])+'</h3>'+esc(t.slice(2).join('\n'))+'</div>';}
function bindWork(){
  var sel=document.getElementById('w-play'),how=document.getElementById('w-how');
  function sh(){var pl=S.plays.filter(function(x){return x.comp===sel.value;})[0];how.textContent=pl.how;}
  sel.onchange=sh;sh();
  document.getElementById('wf').onsubmit=function(e){e.preventDefault();
    st.plan={play:sel.value,challenge:document.getElementById('w-ch').value.trim(),first:document.getElementById('w-first').value.trim(),d30:document.getElementById('w-30').value.trim(),d60:document.getElementById('w-60').value.trim(),d90:document.getElementById('w-90').value.trim(),metric:document.getElementById('w-m').value.trim(),buddy:document.getElementById('w-b').value.trim(),built:true};
    renderReports();var c=document.getElementById('copy');if(c&&c.scrollIntoView)c.scrollIntoView({behavior:'smooth',block:'center'});
  };
  var c=document.getElementById('copy');
  if(c)c.onclick=function(){var t=planText(st.plan);
    var fallback=function(){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Plan copied');}catch(e){toast('Select the plan text to copy it');}ta.remove();};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){toast('Plan copied');},fallback);}else fallback();};
}

render();
})();
