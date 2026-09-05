import { createServer } from 'node:http';
// Deterministic OpenAI-compatible endpoint for integration and offline smoke tests.
export function createMockModel() {
  const requests: any[]=[]; let mode:'normal'|'malformed'|'truncated'|'slow'='normal';
  const server=createServer(async(req,res)=>{
    if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'mock-gm'},{id:'mock-embedding'}]}));return;}
    const data:Buffer[]=[];for await(const chunk of req)data.push(chunk);const body=JSON.parse(Buffer.concat(data).toString()||'{}');requests.push(body);
    if(req.url==='/v1/embeddings'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:body.input.map((text:string,index:number)=>({index,embedding:[text.toLowerCase().includes('hogwarts')?1:.1,.5,.2]}))}));return;}
    if(req.url==='/v1/rerank'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({results:body.documents.map((_:string,index:number)=>({index,relevance_score:1/(index+1)}))}));return;}
    if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return;}
    let content='The doors of Hogwarts open. Your companion waits beside you; nobody here yet knows your powers.';
    if(body.response_format){
      if(String(body.messages[0].content).includes('Extract Jumpchain')) {
        const sections=JSON.parse(body.messages[1].content);
        content=JSON.stringify({title:'Mock Jump',author:'Fixture Author',source:'Local PDF',currencies:{'0':{name:'Choice Points',abbrev:'CP',budget:1000,essential:true}},entries:[{kind:'perk',title:'Flight',description:sections[0].text,sectionId:sections[0].id,costs:[{amount:100,currencyKey:'0'}]}],warnings:[]});
      }else{
        const previous=JSON.parse(body.messages[1].content).previousState;
        content=JSON.stringify({rationale:'The player entered the hall.',changes:[{kind:'scene',value:{...previous.scene,location:'Great Hall',stamp:{...previous.scene.stamp,elapsedMinutes:previous.scene.stamp.elapsedMinutes+5}}}]});
      }
      if(mode==='malformed')content='{not JSON';
    }
    if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,1500));
    if(!body.stream){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}));return;}
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    // Deliberately split frames and UTF-8 input across writes.
    for(let i=0;i<content.length;i+=17){const frame=`data: ${JSON.stringify({choices:[{delta:{content:content.slice(i,i+17)},finish_reason:null}]})}\r\n\r\n`;res.write(frame.slice(0,11));res.write(frame.slice(11));}
    if(mode!=='truncated')res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    res.end();
  });
  return {server,requests,setMode:(value:typeof mode)=>{mode=value;}};
}
