import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PdfSection } from '../../ai/documents';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export async function extractPdf(data: Uint8Array, onProgress: (page: number, total: number) => void): Promise<PdfSection[]> {
  const task = pdfjs.getDocument({data});
  try {
    const pdf = await task.promise; const sections: PdfSection[] = [];
    if (pdf.numPages > 3000) throw new Error('PDF exceeds the 3,000-page import limit. Split the source.');
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo); const viewport = page.getViewport({scale:1}); const content = await page.getTextContent();
      const items = content.items.filter((i): i is Extract<typeof i, {str:string}> => 'str' in i).map(i => {
        const t = pdfjs.Util.transform(viewport.transform,i.transform); const h = Math.max(1,Math.hypot(t[2],t[3]));
        return {text:i.str,x:Math.max(0,t[4]/viewport.width),y:Math.max(0,(t[5]-h)/viewport.height),width:Math.min(1,i.width/viewport.width),height:Math.min(1,h/viewport.height),font:h};
      }).filter(i => i.text.trim());
      const median = [...items].sort((a,b) => a.font-b.font)[Math.floor(items.length/2)]?.font ?? 12;
      let group: typeof items = []; let title = `Page ${pageNo}`;
      const flush = () => {
        if (!group.length) return;
        const x = Math.min(...group.map(i => i.x)), y = Math.min(...group.map(i => i.y));
        const right = Math.min(1,Math.max(...group.map(i => i.x+i.width))), bottom = Math.min(1,Math.max(...group.map(i => i.y+i.height)));
        sections.push({id:`p${pageNo}s${sections.length}`,title,text:group.map(i => i.text).join('\n'),page:pageNo,bounds:[{page:pageNo,x:Math.min(1,x),y:Math.min(1,y),width:Math.max(0,right-x),height:Math.max(0,bottom-y)}]}); group=[];
      };
      // Keep PDF content order (often preserves columns), split at heading-font and large line gaps.
      for (const item of items) {
        const previous = group[group.length-1];
        if (group.length && (item.font > median*1.25 || group.reduce((n,i) => n+i.text.length,0)+item.text.length > 5500 || (previous && item.y-previous.y > .07 && group.length > 8))) flush();
        if (item.font > median*1.25) title = item.text;
        group.push(item);
      }
      flush(); page.cleanup(); onProgress(pageNo,pdf.numPages);
    }
    if (!sections.length) throw new Error('PDF has no extractable text. This may be a scanned PDF; supply an OCR text version. No OCR was run.');
    return sections;
  } catch (e) { throw new Error(`PDF extraction failed: ${(e as Error).message}`); }
  finally { await task.destroy(); }
}
