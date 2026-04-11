import{u as w,r as h,j as a,W as v,bK as y}from"./main-BD6KAaO1.js";import{u as N}from"./useChainWorkspace-CeJIgLTH.js";import"./index-ViOKiGJB.js";function k(n){return typeof n=="object"&&n!==null&&!Array.isArray(n)?n:{}}function x(n){return Number.isInteger(n)?String(n):n.toFixed(2)}function B(n){return k(n.importSourceMetadata).currencies}function S(n,e){var t,c;const r=e==null?void 0:e[n];return((t=r==null?void 0:r.abbrev)==null?void 0:t.trim())||((c=r==null?void 0:r.name)==null?void 0:c.trim())||(n==="0"?"CP":n)}function C(n,e){return n.free||n.costModifier==="free"?"Free":`${x(n.purchaseValue)} ${S(n.currencyKey,B(e))}`}function D(n){const e=[n.years?`${n.years} year${n.years===1?"":"s"}`:null,n.months?`${n.months} month${n.months===1?"":"s"}`:null,n.days?`${n.days} day${n.days===1?"":"s"}`:null].filter(Boolean);return e.length>0?e.join(", "):"0 days"}function I(n,e){var t;return((t=(e.participantKind==="companion"?n.companions:n.jumpers).find(c=>c.id===e.participantId))==null?void 0:t.name)??"Participant"}function M(n){return Object.entries(n.origins).flatMap(([e,r])=>{const t=k(r),c=typeof t.label=="string"?t.label:e,d=typeof t.summary=="string"?t.summary:"",s=typeof t.description=="string"?t.description:"";return!d&&!s?[]:[`${c}: ${[d,s].filter(Boolean).join(" - ")}`]})}function P(n){return[["Accomplishments",n.narratives.accomplishments],["Challenges",n.narratives.challenges],["Goals",n.narratives.goals]].flatMap(([e,r])=>r.trim()?[`${e}: ${r}`]:[])}function b(n,e){return{title:n.title||n.summary||"Untitled selection",description:n.description,cost:C(n,e),tags:n.tags,rewards:(n.scenarioRewards??[]).map(r=>{const t=[r.amount!==void 0?x(r.amount):null,r.currencyKey].filter(Boolean).join(" ");return r.note??r.title??(t||r.type)})}}function A(n,e){return n.kind!=="participant"||e.participantId===n.participantId}function L(n,e){return n.kind!=="jump"||n.jumpId===e}function R(n,e){var t,c,d;const r=n.jumps.filter(s=>L(e,s.id)).map(s=>{const m=n.participations.filter(o=>o.jumpId===s.id&&A(e,o)).map(o=>({participantName:I(n,o),participantKind:o.participantKind,origins:M(o),purchases:o.purchases.map(l=>b(l,o)),drawbacks:o.drawbacks.map(l=>b(l,o)),retainedDrawbacks:o.retainedDrawbacks.map(l=>b(l,o)),notes:o.notes,narratives:P(o)}));return{title:s.title,duration:D(s.duration),participations:m}}).filter(s=>s.participations.length>0||e.kind!=="participant");return{chainTitle:n.chain.title,branchTitle:((t=n.activeBranch)==null?void 0:t.title)??"Branch",generatedAt:new Date().toISOString(),scopeLabel:e.kind==="branch"?"Active branch":e.kind==="jump"?((c=n.jumps.find(s=>s.id===e.jumpId))==null?void 0:c.title)??"Jump":((d=[...n.jumpers,...n.companions].find(s=>s.id===e.participantId))==null?void 0:d.name)??"Participant",jumps:r}}function u(n){return n.replace(/\s+\n/g,`
`).trim()}function g(n){const e=n.tags.length>0?` _${n.tags.join(", ")}_`:"",r=n.description.trim()?`
  ${n.description.trim().replace(/\n/g,`
  `)}`:"",t=n.rewards.length>0?`
  Rewards: ${n.rewards.join("; ")}`:"";return`- **${n.title}** (${n.cost})${e}${r}${t}`}function f(n){const e=n.tags.length>0?` [i]${n.tags.join(", ")}[/i]`:"",r=n.description.trim()?`
  ${n.description.trim().replace(/\n/g,`
  `)}`:"",t=n.rewards.length>0?`
  Rewards: ${n.rewards.join("; ")}`:"";return`[*][b]${n.title}[/b] (${n.cost})${e}${r}${t}`}function p(n,e){return e.length>0?`
### ${n}
${e.join(`
`)}
`:""}function $(n,e){return e.length>0?`
[b]${n}[/b]
[list]
${e.join(`
`)}
[/list]
`:""}function T(n){return u(`
## ${n.participantName}
${n.origins.length>0?`
### Beginnings
${n.origins.map(e=>`- ${e}`).join(`
`)}
`:""}
${p("Purchases",n.purchases.map(g))}
${p("Drawbacks",n.drawbacks.map(g))}
${p("Retained Drawbacks",n.retainedDrawbacks.map(g))}
${n.narratives.length>0?p("Narratives",n.narratives.map(e=>`- ${e}`)):""}
${n.notes.trim()?`
### Notes
${n.notes.trim()}
`:""}
`)}function E(n){return u(`
[h2]${n.participantName}[/h2]
${n.origins.length>0?`
[b]Beginnings[/b]
[list]
${n.origins.map(e=>`[*]${e}`).join(`
`)}
[/list]
`:""}
${$("Purchases",n.purchases.map(f))}
${$("Drawbacks",n.drawbacks.map(f))}
${$("Retained Drawbacks",n.retainedDrawbacks.map(f))}
${n.narratives.length>0?$("Narratives",n.narratives.map(e=>`[*]${e}`)):""}
${n.notes.trim()?`
[b]Notes[/b]
${n.notes.trim()}
`:""}
`)}function K(n){return u(`# ${n.chainTitle}

Branch: ${n.branchTitle}
Scope: ${n.scopeLabel}
Generated: ${n.generatedAt}

${n.jumps.map(e=>u(`## ${e.title}

Duration: ${e.duration}

${e.participations.map(T).join(`

`)}`)).join(`

`)}
`)+`
`}function F(n){return u(`[h1]${n.chainTitle}[/h1]

[b]Branch:[/b] ${n.branchTitle}
[b]Scope:[/b] ${n.scopeLabel}
[b]Generated:[/b] ${n.generatedAt}

${n.jumps.map(e=>u(`[h2]${e.title}[/h2]

[b]Duration:[/b] ${e.duration}

${e.participations.map(E).join(`

`)}`)).join(`

`)}
`)+`
`}function j(n){return n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")||"jumpchain-export"}function O(n){return n.kind==="branch"?"branch":`${n.kind}:${n.kind==="jump"?n.jumpId:n.participantId}`}function G(n,e){if(n==="branch")return{kind:"branch"};const[r,t]=n.split(":");return r==="jump"&&t?{kind:"jump",jumpId:t}:r==="participant"&&t?{kind:"participant",participantId:t}:e}function _(){const{simpleMode:n}=w(),{workspace:e}=N(),[r,t]=h.useState("markdown"),[c,d]=h.useState({kind:"branch"}),s=h.useMemo(()=>R(e,c),[c,e]),m=h.useMemo(()=>r==="markdown"?K(s):F(s),[r,s]),o=[...e.jumpers.map(i=>({id:i.id,label:i.name,kind:"jumper"})),...e.companions.map(i=>({id:i.id,label:i.name,kind:"companion"}))],l=r==="markdown"?"md":"txt";return a.jsxs("div",{className:"stack",children:[a.jsx(v,{title:"Share Export",description:n?"Create a readable copy of this branch for notes, forums, or review.":"Generate Markdown or BBCode from the active branch, a single participant, or a single jump.",badge:r==="markdown"?"Markdown":"BBCode"}),a.jsxs("section",{className:"card stack",children:[a.jsxs("div",{className:"field-grid field-grid--two",children:[a.jsxs("label",{className:"field",children:[a.jsx("span",{children:"Format"}),a.jsxs("select",{value:r,onChange:i=>t(i.target.value),children:[a.jsx("option",{value:"markdown",children:"Markdown"}),a.jsx("option",{value:"bbcode",children:"BBCode"})]})]}),a.jsxs("label",{className:"field",children:[a.jsx("span",{children:"Scope"}),a.jsxs("select",{value:O(c),onChange:i=>d(G(i.target.value,{kind:"branch"})),children:[a.jsx("option",{value:"branch",children:"Active branch"}),e.jumps.map(i=>a.jsxs("option",{value:`jump:${i.id}`,children:["Jump: ",i.title]},i.id)),o.map(i=>a.jsxs("option",{value:`participant:${i.id}`,children:[i.kind,": ",i.label]},i.id))]})]})]}),a.jsx("div",{className:"actions",children:a.jsxs("button",{className:"button",type:"button",onClick:()=>y(`${j(e.chain.title)}-${j(s.scopeLabel)}.${l}`,m),children:["Download ",r==="markdown"?"Markdown":"BBCode"]})})]}),a.jsxs("section",{className:"card stack",children:[a.jsxs("div",{className:"section-heading",children:[a.jsx("h3",{children:"Preview"}),a.jsxs("span",{className:"pill",children:[s.jumps.length," jumps"]})]}),a.jsx("textarea",{className:"json-editor",rows:28,readOnly:!0,value:m})]})]})}export{_ as ExportPage};
