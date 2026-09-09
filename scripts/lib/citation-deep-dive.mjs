import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {extractPdfText} from './official-document.mjs';

export const doi = value => String(value || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').trim().toLowerCase();
const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const text = value => String(value).replace(/<[^>]+>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/\s+/g,' ').trim();
const attr = (tag,name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`,'i'))?.[1] || '';
const containsDoi = (value,wanted) => [...String(value).matchAll(/10\.\d{1,9}\/[^\s<>"']+/gi)].some(m=>doi(m[0].replace(/[.,;]+$/,''))===doi(wanted));
const referenceMatches = (body,target) => {
 if(!norm(target.title)||!norm(body).includes(norm(target.title)))return false;
 if(/10\.\d{1,9}\//.test(body))return containsDoi(body,target.doi);
 const b=target.bibliography;
 return b?.doiConfirmed===true&&Boolean(norm(b.firstAuthor))&&(' '+norm(body)+' ').includes(' '+norm(b.firstAuthor)+' ')&&(b.years||[]).some(y=>new RegExp('\\b'+y+'\\b').test(body));
};
export const pairKey = r => `${r.targetWork.id || doi(r.targetWork.doi)}|${r.citingWork.id || doi(r.citingWork.doi)}`;
const valid = c => c?.verified === true && c.contextAvailable === true && Boolean(c.excerpt?.trim()) && Boolean(c.sourceUrl);

// Accept only an explicit bibliography link after both document identities agree.
export function extractLinkedContexts(markup,row) {
 const head = markup.match(/<front\b[\s\S]*?<\/front>/i)?.[0] || markup.match(/<head\b[\s\S]*?<\/head>/i)?.[0] || '';
 const title = text(head.match(/<article-title\b[^>]*>([\s\S]*?)<\/article-title>/i)?.[1] || [...head.matchAll(/<meta\b[^>]*>/gi)].find(m=>attr(m[0],'name')==='citation_title')?.[0]?.match(/content=["']([^"']*)/i)?.[1] || '');
 const sourceDoi = head.match(/<article-id\b[^>]*pub-id-type=["']doi["'][^>]*>([^<]+)/i)?.[1] || [...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).filter(t=>attr(t,'name')==='citation_doi').map(t=>attr(t,'content'))[0];
 if(!row.citingWork.doi || doi(sourceDoi)!==doi(row.citingWork.doi) || norm(title)!==norm(row.citingWork.title)) return [];
 const ids=new Set();
 for(const m of markup.matchAll(/<(ref|li)(?=\s|>)([^>]*)>([\s\S]*?)<\/\1>/gi)) {
  const id=attr(m[2],'id'), body=text(m[3]);
  if(id && row.targetWork.doi && referenceMatches(body,row.targetWork)) ids.add(id);
 }
 if(!ids.size)return [];
 const body=(markup.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || markup).replace(/<(?:back|ref-list)\b[\s\S]*$/i,'').replace(/<li\b[^>]*>[\s\S]*?<\/li>/gi,'');
 const contexts=[];
 for(const p of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
  const linked=[...p[1].matchAll(/<(?:xref|a)\b[^>]*>/gi)].some(m=>{
   const rid=attr(m[0],'rid') || attr(m[0],'href').replace(/^.*#/, '');
   return rid.split(/\s+/).some(v=>ids.has(v));
  });
  if(!linked)continue;
  const before=body.slice(0,p.index);
  const headings=[...before.matchAll(/<(?:title|h[1-6])\b[^>]*>([\s\S]*?)<\/(?:title|h[1-6])>/gi)];
  contexts.push({excerpt:text(p[1]),location:text(headings.at(-1)?.[1] || '来源未提供章节/页码'),referenceIds:[...ids]});
 }
 return contexts;
}

export function extractPdfContexts(value,row) {
 const pages=String(value).split('\f'), first=pages[0];
 if(!norm(row.citingWork.title)||!norm(first).includes(norm(row.citingWork.title))||!containsDoi(first,row.citingWork.doi))return [];
 const heading=/(?:^|[\n\f])\s*(?:References|Bibliography)\s*(?=\n|$)/i.exec(value);if(!heading)return [];
 const refs=value.slice(heading.index),numbers=[];
 for(const m of refs.matchAll(/(?:^|\n)\s*\[(\d+)\]\s*([\s\S]*?)(?=\n\s*\[\d+\]|$)/g))if(referenceMatches(m[2],row.targetWork))numbers.push(m[1]);
 if(numbers.length!==1)return [];
 const result=[];
 for(const [i,p] of value.slice(0,heading.index).split('\f').entries())for(const paragraph of p.split(/\n\s*\n/)){
  if(new RegExp('\\['+numbers[0]+'\\]').test(paragraph))result.push({excerpt:paragraph.replace(/\s+/g,' ').trim(),location:`PDF 第 ${i+1} 页`,referenceIds:numbers});
 }
 return result;
}

export async function fetchCitationPages(targetDoi,request,{maxPages=100}={}) {
 const data=[],seen=new Set();let offset=0;
 try {
  for(let page=0;page<maxPages;page++) {
   if(seen.has(offset))throw Error('Repeated pagination offset');seen.add(offset);
   const url=`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent('DOI:'+doi(targetDoi))}/citations?fields=contexts,intents,isInfluential,title,externalIds&limit=1000&offset=${offset}`;
   const result=await request(url);if(!Array.isArray(result.data))throw Error('Invalid citation response');data.push(...result.data);
   if(result.next==null)return {data,complete:true};offset=result.next;
  }
  throw Error('Pagination limit reached');
 }catch(error){return {data,complete:false,error:String(error.message || error)};}
}

export async function runDeepDive({rows,goal=10,previous={},retrieve,onCheckpoint=async()=>{}}) {
 if(!Number.isInteger(goal)||goal<1)throw Error('Author goal must be a positive integer');
 const comments={...(previous.comments || {})},groups=new Map(),visited=new Set(),verifiedAuthors=new Set(),processed=[];
 for(const r of rows){if(!r.citingAuthor?.id)throw Error('Disambiguated author ID required');const list=groups.get(r.citingAuthor.id)||[];list.push(r);groups.set(r.citingAuthor.id,list);}
 const ranked=[...groups.entries()].sort((a,b)=>(b[1][0].citingAuthor.citedByCount||0)-(a[1][0].citingAuthor.citedByCount||0)||a[0].localeCompare(b[0]));
 const snapshot=()=>{
  const qualifying=rows.filter(r=>valid(comments[pairKey(r)]));
  return {generatedOn:new Date().toISOString(),comments,summary:{goal,verifiedAuthors:verifiedAuthors.size,goalMet:verifiedAuthors.size>=goal,shortfall:Math.max(0,goal-verifiedAuthors.size),attemptedAuthors:processed.length,qualifiedAuthors:groups.size,citingPapersWithEvidence:new Set(qualifying.map(r=>r.citingWork.id||doi(r.citingWork.doi))).size,contextsAvailable:new Set(qualifying.map(pairKey)).size,processedAuthorIds:processed,unresolvedPairs:[...visited].filter(k=>!valid(comments[k]))}};
 };
 for(const [id,list] of ranked){
  if(verifiedAuthors.size>=goal&&!verifiedAuthors.has(id))continue;processed.push(id);
  for(const r of list){const key=pairKey(r);if(visited.has(key))continue;visited.add(key);
   if(!valid(comments[key])){
    let next;try{next=await retrieve(r);}catch(e){next={status:'retrieval_error',error:String(e.message||e)};}
    const old=comments[key];
    comments[key]=old?.contextAvailable&&!valid(next)?{...old,lastAttempt:next}:{...next};
   }
   // Count shared-paper evidence only for authors who satisfy the input filter.
   for(const r2 of rows)if(valid(comments[pairKey(r2)]))verifiedAuthors.add(r2.citingAuthor.id);
   await onCheckpoint(snapshot());
  }
 }
 for(const r of rows)comments[pairKey(r)] ||= {contextAvailable:false,verified:false,status:'not_selected',excerpt:'',summaryZh:'本轮未深挖'};
 return snapshot();
}

export function createRetriever({cacheDir,fetchImpl=fetch,timeoutMs=20000,requestDelayMs=1100}) {
 const pages=new Map(),documents=new Map(),bibliographies=new Map();let lastRequest=0;
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const request=async url=>{
  if(!/^https?:\/\//i.test(url))throw Error('Only HTTP(S) source URLs supported');
  for(let attempt=0;attempt<3;attempt++){
   await new Promise(r=>setTimeout(r,Math.max(0,lastRequest+requestDelayMs-Date.now())));lastRequest=Date.now();
   const res=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),headers:{'user-agent':'who-cite-your-works/3.0',...(url.startsWith('https://api.semanticscholar.org/')&&process.env.SEMANTIC_SCHOLAR_API_KEY?{'x-api-key':process.env.SEMANTIC_SCHOLAR_API_KEY}:{})}});
   if(res.ok)return res;
   if([429,500,502,503,504].includes(res.status)&&attempt<2){await new Promise(r=>setTimeout(r,2000*(attempt+1)));continue;}
   throw Error(`HTTP ${res.status}`);
  }
 };
 const json=async url=>(await request(url)).json();
 const document=async url=>{
  if(documents.has(url))return documents.get(url);
  const job=(async()=>{
   await fs.mkdir(cacheDir,{recursive:true});const base=path.join(cacheDir,hash(url));
   try{return JSON.parse(await fs.readFile(base+'.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
   const res=await request(url),bytes=Buffer.from(await res.arrayBuffer());
   let data;
   if(bytes.subarray(0,5).toString()==='%PDF-'){
    await fs.writeFile(base+'.pdf',bytes);data={url:res.url||url,kind:'pdf',text:await extractPdfText({pdfPath:base+'.pdf'})};
   }else{
    const markup=bytes.toString('utf8');if(!/<(?:html|article)[\s>]/i.test(markup))throw Error('Unsupported or blocked full-text response');
    data={url:res.url||url,kind:'markup',text:markup};
   }
   await fs.writeFile(base+'.json',JSON.stringify(data));return data;
  })();documents.set(url,job);return job;
 };
 return async row=>{
  const attempts=[],queue=[row.citingWork.landingPageUrl,row.citingWork.doi,row.citingWork.pdfUrl,...(row.citingWork.fullTextUrls||[])].filter(Boolean),seen=new Set();
  let candidate;
  const crawl=async()=>{
   while(queue.length&&seen.size<12){const url=queue.shift();if(seen.has(url))continue;seen.add(url);
    try{
     const doc=await document(url);
     if(doc.kind==='markup'){
      const contexts=extractLinkedContexts(doc.text,row);
      if(contexts.length)return {verified:true,contextAvailable:true,status:'verified_linked_context',contexts,excerpt:contexts.map(c=>c.excerpt).join('\n\n'),location:contexts.map(c=>c.location).join(' • '),source:'Publisher/repository linked full text',sourceUrl:doc.url,verification:{method:'citing-doi-title-and-target-reference-link',targetDoi:doi(row.targetWork.doi),citingDoi:doi(row.citingWork.doi)},summaryZh:'已核对引文对应关系；中文解释与用途分类需结合原句审读。',attempts};
      for(const m of doc.text.matchAll(/<meta\b[^>]*>/gi))if(['citation_pdf_url','citation_fulltext_html_url'].includes(attr(m[0],'name'))&&attr(m[0],'content'))queue.push(new URL(attr(m[0],'content'),doc.url).href);
      attempts.push({url,status:'no_verified_reference_link'});
     }else{
      const contexts=extractPdfContexts(doc.text,row);
      if(contexts.length)return {verified:true,contextAvailable:true,status:'verified_numbered_pdf',contexts,excerpt:contexts.map(c=>c.excerpt).join('\n\n'),location:contexts.map(c=>c.location).join(' • '),source:'PDF numbered bibliography and body marker',sourceUrl:doc.url,verification:{method:'pdf-doi-title-numbered-reference',targetDoi:doi(row.targetWork.doi),citingDoi:doi(row.citingWork.doi)},summaryZh:'已核对引文对应关系；中文解释与用途分类需结合原句审读。',attempts};
      const t=doc.text;const idx=norm(t).indexOf(norm(row.targetWork.title));
      attempts.push({url,status:'pdf_requires_reference_review',documentCache:path.join(cacheDir,hash(url)+'.pdf')});
      if(idx>=0)candidate={status:'pdf_requires_reference_review',sourceUrl:doc.url,documentCache:path.join(cacheDir,hash(url)+'.pdf')};
     }
    }catch(e){attempts.push({url,status:'fetch_or_parse_error',error:String(e.message||e)});}
   }
  };
  let result=await crawl();if(result)return result;
  if(row.targetWork.doi){
   try{
    const target=doi(row.targetWork.doi);
    if(!bibliographies.has(target))bibliographies.set(target,json('https://api.crossref.org/works/'+encodeURIComponent(target)));
    const meta=(await bibliographies.get(target)).message;
    if(doi(meta.DOI)===target&&norm(meta.title?.[0])===norm(row.targetWork.title)){
     row={...row,targetWork:{...row.targetWork,bibliography:{doiConfirmed:true,firstAuthor:meta.author?.[0]?.family,years:[...new Set(['published','published-print','published-online','issued'].flatMap(k=>meta[k]?.['date-parts']?.[0]?.[0]?[String(meta[k]['date-parts'][0][0])]:[]))]}}};
     for(const url of seen)queue.push(url);seen.clear();result=await crawl();if(result)return result;
    }
   }catch(e){attempts.push({source:'Crossref reference identity',status:'fetch_error',error:String(e.message||e)});}
  }
  // Discover OA XML by the citing paper, not by the researcher's cited paper.
  try{
   if(row.citingWork.doi){const found=await json('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&query='+encodeURIComponent('DOI:"'+doi(row.citingWork.doi)+'"'));
    for(const hit of found.resultList?.result||[])if(hit.pmcid&&doi(hit.doi)===doi(row.citingWork.doi))queue.push(`https://www.ebi.ac.uk/europepmc/webservices/rest/${hit.pmcid}/fullTextXML`);
   }
  }catch(e){attempts.push({source:'Europe PMC discovery',status:'fetch_error',error:String(e.message||e)});}
  result=await crawl();if(result)return result;
  if(row.targetWork.doi){
   const target=doi(row.targetWork.doi);if(!pages.has(target))pages.set(target,fetchCitationPages(target,json));const payload=await pages.get(target);
   const match=payload.data.find(v=>doi(v.citingPaper?.externalIds?.DOI)===doi(row.citingWork.doi)&&doi(row.citingWork.doi)&&norm(v.citingPaper?.title)===norm(row.citingWork.title));
   const contexts=(match?.contexts||[]).filter(v=>String(v).trim());
   attempts.push({source:'Semantic Scholar',status:!payload.complete?'pagination_incomplete':!match?'citation_not_matched':contexts.length?'context_requires_review':'empty_context',error:payload.error});
   if(contexts.length)return {verified:false,contextAvailable:true,status:'context_requires_review',contexts:contexts.map(excerpt=>({excerpt})),excerpt:contexts.join('\n\n'),source:'Semantic Scholar short contexts',sourceUrl:`https://www.semanticscholar.org/paper/${match.citingPaper.paperId}`,summaryZh:'数据源提供的短上下文，尚需核验参考文献对应关系与中文解释。',attempts};
  }else attempts.push({status:'missing_target_doi'});
  return {verified:false,contextAvailable:false,excerpt:'',summaryZh:'引用关系已确认，但引用原因暂不可判定。',...candidate,status:candidate?.status||(attempts.some(a=>/error|incomplete/.test(a.status))?'retrieval_incomplete':'no_verified_context'),attempts};
 };
}
