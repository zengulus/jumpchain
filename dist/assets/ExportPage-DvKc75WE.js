import{u as w,r as h,j as a,W as v,bL as y}from"./main-DGbbqbeH.js";import{u as N}from"./useChainWorkspace-BmI36C1l.js";import"./index-knDckc-S.js";function k(n){return typeof n=="object"&&n!==null&&!Array.isArray(n)?n:{}}function x(n){return Number.isInteger(n)?String(n):n.toFixed(2)}function B(n){return k(n.importSourceMetadata).currencies}function S(n,e){var r,d;const t=e==null?void 0:e[n];return((r=t==null?void 0:t.abbrev)==null?void 0:r.trim())||((d=t==null?void 0:t.name)==null?void 0:d.trim())||(n==="0"?"CP":n)}function C(n,e){return n.free||n.costModifier==="free"?"Free":`${x(n.purchaseValue)} ${S(n.currencyKey,B(e))}`}function M(n){const e=[n.years?`${n.years} year${n.years===1?"":"s"}`:null,n.months?`${n.months} month${n.months===1?"":"s"}`:null,n.days?`${n.days} day${n.days===1?"":"s"}`:null].filter(Boolean);return e.length>0?e.join(", "):"0 days"}function D(n,e){var r;return((r=(e.participantKind==="companion"?n.companions:n.jumpers).find(d=>d.id===e.participantId))==null?void 0:r.name)??"Participant"}function I(n){return Object.entries(n.origins).flatMap(([e,t])=>{const r=k(t),d=typeof r.label=="string"?r.label:e,l=typeof r.summary=="string"?r.summary:"",s=typeof r.description=="string"?r.description:"";return!l&&!s?[]:[`${d}: ${[l,s].filter(Boolean).join(" - ")}`]})}function P(n){return[["Accomplishments",n.narratives.accomplishments],["Challenges",n.narratives.challenges],["Goals",n.narratives.goals]].flatMap(([e,t])=>t.trim()?[`${e}: ${t}`]:[])}function b(n,e){const t=n.mergedFrom&&n.mergedFrom.length>0?`Merged From: ${n.mergedFrom.map(r=>r.title).join(", ")}`:"";return{title:n.title||n.summary||"Untitled selection",description:[n.description,t].filter(Boolean).join(`
`),cost:C(n,e),tags:n.tags,rewards:(n.scenarioRewards??[]).map(r=>{const d=[r.amount!==void 0?x(r.amount):null,r.currencyKey].filter(Boolean).join(" ");return r.note??r.title??(d||r.type)})}}function F(n){return n.hidden===!0}function L(n,e){return n.kind!=="participant"||e.participantId===n.participantId}function A(n,e){return n.kind!=="jump"||n.jumpId===e}function R(n,e){var r,d,l;const t=n.jumps.filter(s=>A(e,s.id)).map(s=>{const u=n.participations.filter(o=>o.jumpId===s.id&&L(e,o)).map(o=>({participantName:D(n,o),participantKind:o.participantKind,origins:I(o),purchases:o.purchases.filter(c=>!F(c)).map(c=>b(c,o)),drawbacks:o.drawbacks.map(c=>b(c,o)),retainedDrawbacks:o.retainedDrawbacks.map(c=>b(c,o)),notes:o.notes,narratives:P(o)}));return{title:s.title,duration:M(s.duration),participations:u}}).filter(s=>s.participations.length>0||e.kind!=="participant");return{chainTitle:n.chain.title,branchTitle:((r=n.activeBranch)==null?void 0:r.title)??"Branch",generatedAt:new Date().toISOString(),scopeLabel:e.kind==="branch"?"Active branch":e.kind==="jump"?((d=n.jumps.find(s=>s.id===e.jumpId))==null?void 0:d.title)??"Jump":((l=[...n.jumpers,...n.companions].find(s=>s.id===e.participantId))==null?void 0:l.name)??"Participant",jumps:t}}function m(n){return n.replace(/\s+\n/g,`
`).trim()}function g(n){const e=n.tags.length>0?` _${n.tags.join(", ")}_`:"",t=n.description.trim()?`
  ${n.description.trim().replace(/\n/g,`
  `)}`:"",r=n.rewards.length>0?`
  Rewards: ${n.rewards.join("; ")}`:"";return`- **${n.title}** (${n.cost})${e}${t}${r}`}function f(n){const e=n.tags.length>0?` [i]${n.tags.join(", ")}[/i]`:"",t=n.description.trim()?`
  ${n.description.trim().replace(/\n/g,`
  `)}`:"",r=n.rewards.length>0?`
  Rewards: ${n.rewards.join("; ")}`:"";return`[*][b]${n.title}[/b] (${n.cost})${e}${t}${r}`}function p(n,e){return e.length>0?`
### ${n}
${e.join(`
`)}
`:""}function $(n,e){return e.length>0?`
[b]${n}[/b]
[list]
${e.join(`
`)}
[/list]
`:""}function T(n){return m(`
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
`)}function E(n){return m(`
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
`)}function K(n){return m(`# ${n.chainTitle}

Branch: ${n.branchTitle}
Scope: ${n.scopeLabel}
Generated: ${n.generatedAt}

${n.jumps.map(e=>m(`## ${e.title}

Duration: ${e.duration}

${e.participations.map(T).join(`

`)}`)).join(`

`)}
`)+`
`}function O(n){return m(`[h1]${n.chainTitle}[/h1]

[b]Branch:[/b] ${n.branchTitle}
[b]Scope:[/b] ${n.scopeLabel}
[b]Generated:[/b] ${n.generatedAt}

${n.jumps.map(e=>m(`[h2]${e.title}[/h2]

[b]Duration:[/b] ${e.duration}

${e.participations.map(E).join(`

`)}`)).join(`

`)}
`)+`
`}function j(n){return n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")||"jumpchain-export"}function G(n){return n.kind==="branch"?"branch":`${n.kind}:${n.kind==="jump"?n.jumpId:n.participantId}`}function J(n,e){if(n==="branch")return{kind:"branch"};const[t,r]=n.split(":");return t==="jump"&&r?{kind:"jump",jumpId:r}:t==="participant"&&r?{kind:"participant",participantId:r}:e}function _(){const{simpleMode:n}=w(),{workspace:e}=N(),[t,r]=h.useState("markdown"),[d,l]=h.useState({kind:"branch"}),s=h.useMemo(()=>R(e,d),[d,e]),u=h.useMemo(()=>t==="markdown"?K(s):O(s),[t,s]),o=[...e.jumpers.map(i=>({id:i.id,label:i.name,kind:"jumper"})),...e.companions.map(i=>({id:i.id,label:i.name,kind:"companion"}))],c=t==="markdown"?"md":"txt";return a.jsxs("div",{className:"stack",children:[a.jsx(v,{title:"Share Export",description:n?"Create a readable copy of this branch for notes, forums, or review.":"Generate Markdown or BBCode from the active branch, a single participant, or a single jump.",badge:t==="markdown"?"Markdown":"BBCode"}),a.jsxs("section",{className:"card stack",children:[a.jsxs("div",{className:"field-grid field-grid--two",children:[a.jsxs("label",{className:"field",children:[a.jsx("span",{children:"Format"}),a.jsxs("select",{value:t,onChange:i=>r(i.target.value),children:[a.jsx("option",{value:"markdown",children:"Markdown"}),a.jsx("option",{value:"bbcode",children:"BBCode"})]})]}),a.jsxs("label",{className:"field",children:[a.jsx("span",{children:"Scope"}),a.jsxs("select",{value:G(d),onChange:i=>l(J(i.target.value,{kind:"branch"})),children:[a.jsx("option",{value:"branch",children:"Active branch"}),e.jumps.map(i=>a.jsxs("option",{value:`jump:${i.id}`,children:["Jump: ",i.title]},i.id)),o.map(i=>a.jsxs("option",{value:`participant:${i.id}`,children:[i.kind,": ",i.label]},i.id))]})]})]}),a.jsx("div",{className:"actions",children:a.jsxs("button",{className:"button",type:"button",onClick:()=>y(`${j(e.chain.title)}-${j(s.scopeLabel)}.${c}`,u),children:["Download ",t==="markdown"?"Markdown":"BBCode"]})})]}),a.jsxs("section",{className:"card stack",children:[a.jsxs("div",{className:"section-heading",children:[a.jsx("h3",{children:"Preview"}),a.jsxs("span",{className:"pill",children:[s.jumps.length," jumps"]})]}),a.jsx("textarea",{className:"json-editor",rows:28,readOnly:!0,value:u})]})]})}export{_ as ExportPage};
