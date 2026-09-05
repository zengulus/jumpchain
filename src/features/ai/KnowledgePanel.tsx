import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExtractionSchema, extractedJumpDoc, importWorldbook, type Extraction, type PdfSection } from '../../ai/documents';
import { exportSillyTavernWorldbook } from '../../ai/sillyTavern';
import { WorldbookSchema, type Campaign, type Worldbook } from '../../ai/schema';
import type { NativeChainBundle } from '../../domain/save';
import { db } from '../../db/database';
import { createSnapshotForBranch } from '../../db/persistence';
import { createBlankJumpDoc } from '../workspace/records';
import { api } from './client';
import { JsonReview } from './editors';
import { downloadJson } from '../../utils/download';
const PdfViewer=lazy(()=>import('../jumpdocs/JumpDocPdfViewer').then(m=>({default:m.JumpDocPdfViewer})));
async function dataUrl(file:File) {return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Unable to read source file.'));reader.readAsDataURL(file);});}
export function KnowledgePanel({campaign,bundle,onSave,onOperation}:{campaign:Campaign;bundle:NativeChainBundle;onSave:(books:Worldbook[])=>Promise<void>;onOperation:(operation:string,body?:unknown)=>Promise<unknown>}) {
  const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [selected,setSelected]=useState('');
  const [title,setTitle]=useState('');const [setting,setSetting]=useState('');const [text,setText]=useState('');
  const [sections,setSections]=useState<PdfSection[]>([]);const [selectedSections,setSelectedSections]=useState<string[]>([]);const [pdfUrl,setPdfUrl]=useState('');const [pdfName,setPdfName]=useState('');const [page,setPage]=useState(1);
  const [draft,setDraft]=useState<Extraction|null>(null);const [extractionContext,setExtractionContext]=useState<unknown[]>([]);const [accepted,setAccepted]=useState('');
  const book=campaign.worldbooks.find(b=>b.id===selected);
  async function run(fn:()=>Promise<void>) {setBusy(true);setNotice('');try{await fn();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
  async function importFile(file:File) {
    if(file.size>45*1024*1024)throw new Error('Source exceeds 45 MB. Split it before importing.');
    if(/\.pdf$/i.test(file.name)) {
      setDraft(null);setAccepted('');setSections([]);setPdfName(file.name);setPdfUrl(await dataUrl(file));
      const {extractPdf}=await import('./pdf');
      const result=await extractPdf(new Uint8Array(await file.arrayBuffer()),(p,total)=>setNotice(`Reading PDF page ${p}/${total}…`));
      setSections(result);setSelectedSections(result.map(s=>s.id));setNotice(`Read ${result.length} layout sections. Review the source, then ingest as lore or extract JumpDoc options.`);
    } else {
      const next=importWorldbook(await file.text(),file.name,crypto.randomUUID(),setting);
      if(campaign.worldbooks.some(b=>b.id===next.id))throw new Error('A worldbook with this ID already exists. Edit it or change the imported ID.');
      await onSave([...campaign.worldbooks,next]);setSelected(next.id);
      if(next.interop?.sillyTavern)setNotice(`Imported SillyTavern lorebook: ${next.entries.length} entries. SillyTavern activation metadata was preserved for export; Jumpchain uses its own retrieval engine.`);
      else setNotice('Worldbook imported. Rebuild embeddings if configured.');
    }
  }
  return <section className="ai-panel stack"><h2>World knowledge & source documents</h2><p>Sources are portable campaign data. Search indexes can be rebuilt or deleted independently.</p>
    <fieldset disabled={busy}><legend>Import sources</legend><label>Setting<input value={setting} onChange={e=>setSetting(e.target.value)}/></label><label>Import text, Markdown, native or SillyTavern worldbook JSON, or PDF<input type="file" accept=".txt,.md,.json,.pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void run(()=>importFile(f));e.target.value='';}}/></label>
    <details><summary>Write a worldbook entry</summary><label>Title<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Source text<textarea rows={6} value={text} onChange={e=>setText(e.target.value)}/></label><button onClick={()=>void run(async()=>{const id=crypto.randomUUID();const next=WorldbookSchema.parse({id,title,setting,entries:[{id:crypto.randomUUID(),title,text,authority:'player-established',source:'Player-authored worldbook'}]});await onSave([...campaign.worldbooks,next]);setSelected(id);setText('');setTitle('');setNotice('Player-authored source saved.');})}>Add worldbook</button></details></fieldset>
    <div className="ai-actions"><button disabled={busy} onClick={()=>void run(async()=>{const result=await onOperation('rebuild-index');setNotice(`Index rebuilt: ${JSON.stringify(result)}`);})}>Rebuild embedding index</button><button disabled={busy} onClick={()=>void run(async()=>{await onOperation('delete-index');setNotice('Embedding index deleted. Source records remain; BM25 retrieval is available.');})}>Delete disposable index</button></div>
    {campaign.worldbooks.map(b=><div key={b.id} className="ai-source-row"><label><input type="checkbox" checked={b.enabled} disabled={busy} onChange={e=>void run(()=>onSave(campaign.worldbooks.map(w=>w.id===b.id?{...w,enabled:e.target.checked}:w)))}/>{b.title} · {b.setting||'Unspecified setting'} · {b.entries.length} entries</label><button onClick={()=>setSelected(b.id)}>Edit</button><button onClick={()=>downloadJson(`${b.title}.json`,b)}>Export Native</button><button onClick={()=>downloadJson(`${b.title}.sillytavern.json`,exportSillyTavernWorldbook(b))}>Export SillyTavern</button></div>)}
    {book&&<details open key={book.id}><summary>Edit {book.title}: entities, aliases, provenance, tags, and temporal filters</summary><JsonReview value={book} onSave={async raw=>{const next=WorldbookSchema.parse(raw);if(next.id!==book.id)throw new Error('Keep the worldbook ID stable.');await onSave(campaign.worldbooks.map(b=>b.id===book.id?next:b));setNotice('Worldbook updated.');}}/></details>}
    {sections.length>0&&<section className="stack"><h3>{pdfName}</h3><div className="ai-actions"><button disabled={busy} onClick={()=>setSelectedSections(sections.map(s=>s.id))}>Select all sections</button><button disabled={busy} onClick={()=>setSelectedSections([])}>Clear selection</button></div>
      <div className="ai-source-sections">{sections.map(s=><div key={s.id}><label><input type="checkbox" checked={selectedSections.includes(s.id)} disabled={busy} onChange={e=>setSelectedSections(e.target.checked?[...selectedSections,s.id]:selectedSections.filter(id=>id!==s.id))}/>{s.title} · p. {s.page} · {s.text.length} characters</label><button onClick={()=>setPage(s.page)}>View source</button><details><summary>Extracted text</summary><pre>{s.text}</pre></details></div>)}</div>
      <div className="ai-actions"><button disabled={busy||!selectedSections.length} onClick={()=>void run(async()=>{const id=crypto.randomUUID();const next=WorldbookSchema.parse({id,title:pdfName,setting,entries:sections.filter(s=>selectedSections.includes(s.id)).map(s=>({id:`${id}_${s.id}`,title:s.title,text:s.text,page:s.page,source:`${pdfName} page ${s.page}`,kind:'document'})),attachments:[{id:crypto.randomUUID(),name:pdfName,mimeType:'application/pdf',dataUrl:pdfUrl}]});await onSave([...campaign.worldbooks,next]);setNotice('PDF source text and attachment saved as world knowledge.');})}>Save selected sections as setting lore</button>
      <button disabled={busy||!selectedSections.length} onClick={()=>void run(async()=>{let next:Extraction=ExtractionSchema.parse({entries:[]});const contexts:unknown[]=[];const chosen=sections.filter(s=>selectedSections.includes(s.id));setDraft(next);for(let i=0;i<chosen.length;i++){setNotice(`Extracting options from section ${i+1}/${chosen.length}…`);const result=await api<{draft:Extraction;context:unknown}>('/extract',{sections:[chosen[i]]});next={...next,title:next.title||result.draft.title,author:next.author||result.draft.author,source:next.source||result.draft.source,currencies:{...next.currencies,...result.draft.currencies},entries:[...next.entries,...result.draft.entries],warnings:[...next.warnings,...result.draft.warnings]};contexts.push(result.context);setDraft(next);setExtractionContext([...contexts]);}setNotice('Extraction complete. Review every option, price, and source before accepting.');})}>Extract JumpDoc options with model</button></div>
      <Suspense fallback={<p>Loading PDF viewer…</p>}><PdfViewer source={pdfUrl} fileName={pdfName} initialPage={page} annotations={sections.filter(s=>selectedSections.includes(s.id)).flatMap(s=>s.bounds.map((b,i)=>({...b,id:`${s.id}_${i}`,label:s.title,notes:'Extraction source section',extractedText:s.text,exportKind:'note' as const,costAmount:null,currencyKey:'0'})))} onAnnotationsChange={()=>{}}/></Suspense>
    </section>}
    {draft&&<section className="stack"><h3>Review extracted JumpDoc</h3><p>{draft.entries.length} options. Bounds refer to the original source sections. Acceptance creates a new JumpDoc and a tracker snapshot.</p>
      {draft.warnings.map((w,i)=><p key={i} role="note">{w}</p>)}
      <div className="ai-source-sections">{draft.entries.map((entry,i)=><div key={i}><strong>{entry.title}</strong> · {entry.kind} · {entry.costs.map(c=>`${c.amount} ${c.currencyKey}`).join(', ')||'Cost unspecified'}<button onClick={()=>setPage(sections.find(s=>s.id===entry.sectionId)?.page??1)}>View original PDF page</button></div>)}</div>
      <JsonReview value={draft} label="Edit extraction draft (does not change the tracker)" onSave={async raw=>{setDraft(ExtractionSchema.parse(raw));setNotice('Draft validated. Review, then accept below.');}}/>
      <button disabled={busy||!!accepted} onClick={()=>void run(async()=>{const attachmentId=crypto.randomUUID();const base=createBlankJumpDoc(bundle.chain.id,campaign.branchId);base.title=pdfName;base.pdfAttachmentId=attachmentId;const doc=extractedJumpDoc(base,draft,sections);await createSnapshotForBranch(bundle.chain.id,campaign.branchId,'Before AI PDF import',`Review accepted for ${pdfName}`);const now=new Date().toISOString();await db.transaction('rw',[db.jumpDocs,db.attachments,db.chains],async()=>{await db.jumpDocs.add(doc);await db.attachments.add({id:attachmentId,chainId:bundle.chain.id,branchId:campaign.branchId,createdAt:now,updatedAt:now,scopeType:'branch',ownerEntityType:'branch',ownerEntityId:campaign.branchId,label:pdfName,fileName:pdfName,mimeType:'application/pdf',kind:'file',storage:'embedded',dataUrl:pdfUrl});await db.chains.update(bundle.chain.id,{updatedAt:now});});setAccepted(doc.id);setNotice('Reviewed JumpDoc and original PDF saved to the tracker.');})}>Accept reviewed extraction into tracker</button>
      {accepted&&<Link to={`/chains/${bundle.chain.id}/jumpdocs?jumpdoc=${accepted}&page=${page}`}>Open accepted JumpDoc at source page</Link>}
      <details><summary>Extraction context inspector</summary><pre>{JSON.stringify(extractionContext,null,2)}</pre></details>
    </section>}
    <p role="status">{notice}</p>
  </section>;
}
