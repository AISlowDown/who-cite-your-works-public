import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../scripts/lib/citation-deep-dive.mjs').catch(()=>({}));
const row=(a,c='C'+a)=>({citingAuthor:{id:a,name:a,citedByCount:10000-Number(a),roles:['通讯作者']},citingWork:{id:c,doi:'10.1/'+c,title:'Citing study'},targetWork:{id:'T',doi:'10.1/target',title:'Target study'}});
test('counts distinct authors and backfills failures while completing all papers for selected authors',async()=>{
 assert.equal(typeof mod.runDeepDive,'function');
 const rows=[...Array.from({length:12},(_,i)=>row(String(i+1))),row('2','extra')];
 const attempted=[];
 const out=await mod.runDeepDive({rows,goal:10,retrieve:async r=>{attempted.push(r.citingWork.id);return r.citingAuthor.id==='1'?{status:'no_context'}:{verified:true,contextAvailable:true,excerpt:'Evidence',sourceUrl:'https://example.org'};}});
 assert.equal(out.summary.verifiedAuthors,10);assert.equal(out.summary.goalMet,true);
 assert.ok(attempted.includes('C11'));assert.ok(attempted.includes('extra'));assert.ok(!attempted.includes('C12'));
 assert.equal(out.comments['T|C12'].status,'not_selected');
});
test('preserves older evidence on empty refresh and does not count unverified cache',async()=>{
 assert.equal(typeof mod.runDeepDive,'function');
 const previous={comments:{'T|C1':{contextAvailable:true,excerpt:'Old real context',sourceUrl:'https://example.org'}}};
 const out=await mod.runDeepDive({rows:[row('1')],previous,retrieve:async()=>({status:'http_error',error:'403'}),goal:10});
 assert.equal(out.comments['T|C1'].excerpt,'Old real context');assert.equal(out.summary.verifiedAuthors,0);assert.equal(out.summary.goalMet,false);
});
test('structured reference mapping extracts all body paragraphs but rejects wrong reference and citing identity',()=>{
 assert.equal(typeof mod.extractLinkedContexts,'function');
 const xml='<article><front><article-title>Citing study</article-title><article-id pub-id-type="doi">10.1/C1</article-id></front><body><sec><title>Discussion</title><p>Useful method <xref ref-type="bibr" rid="r1">1</xref>.</p><p>Other method <xref ref-type="bibr" rid="r2">2</xref>.</p><p>Also useful <xref ref-type="bibr" rid="r1">1</xref>.</p></sec></body><back><ref-list><ref id="r1">Target study <pub-id>10.1/target</pub-id></ref><ref id="r2">Different study 10.1/other</ref></ref-list></back></article>';
 const found=mod.extractLinkedContexts(xml,row('1'));
 assert.equal(found.length,2);assert.match(found[0].excerpt,/Useful method/);assert.equal(found[0].location,'Discussion');
 assert.equal(mod.extractLinkedContexts(xml.replace('10.1/C1','10.1/WRONG'),row('1')).length,0);
 assert.equal(mod.extractLinkedContexts(xml.replace('10.1/target','10.1/wrong'),row('1')).length,0);
});
test('semantic pagination follows next and retains all context strings without truncation',async()=>{
 assert.equal(typeof mod.fetchCitationPages,'function');
 const out=await mod.fetchCitationPages('10.1/t',async url=>new URL(url).searchParams.get('offset')==='0'?{data:[{contexts:['x'.repeat(700)]}],next:1}:{data:[{contexts:['second']} ]});
 assert.equal(out.data.length,2);assert.equal(out.data[0].contexts[0].length,700);assert.equal(out.complete,true);
});
test('partial pagination retains earlier pages with a failure reason',async()=>{
 assert.equal(typeof mod.fetchCitationPages,'function');
 const out=await mod.fetchCitationPages('10.1/t',async url=>{if(new URL(url).searchParams.get('offset')==='0')return {data:[{contexts:['first']}],next:1};throw Error('429');});
 assert.equal(out.data.length,1);assert.equal(out.complete,false);assert.match(out.error,/429/);
});
test('same paper is retrieved once but counts two qualifying authors and one unique paper',async()=>{
 assert.equal(typeof mod.runDeepDive,'function');let calls=0;
 const out=await mod.runDeepDive({rows:[row('1','shared'),row('2','shared')],goal:2,retrieve:async()=>{calls++;return {verified:true,contextAvailable:true,excerpt:'shared',sourceUrl:'https://example.org'};}});
 assert.equal(calls,1);assert.equal(out.summary.verifiedAuthors,2);assert.equal(out.summary.citingPapersWithEvidence,1);
});
test('PDF extraction requires document identity, exact numbered reference and matching body marker',()=>{
 assert.equal(typeof mod.extractPdfContexts,'function');
 const pdf='Citing study\n10.1/C1\nIntroduction\nWe used this useful method [7].\n\nOther work [8].\fReferences\n[7] Author. Target study. 10.1/target\n[8] Other study. 10.1/other';
 const found=mod.extractPdfContexts(pdf,row('1'));assert.equal(found.length,1);assert.match(found[0].excerpt,/useful method \[7\]/);assert.match(found[0].location,/1/);
 assert.equal(mod.extractPdfContexts(pdf.replace('10.1/target','10.1/target-extra'),row('1')).length,0);
 assert.equal(mod.extractPdfContexts(pdf.replace('[7].','[8].'),row('1')).length,0);
});
test('retriever follows publisher fulltext metadata and verifies linked context',async()=>{
 assert.equal(typeof mod.createRetriever,'function');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'citation-test-'));
 const html='<html><head><meta name="citation_doi" content="10.1/C1"><meta name="citation_title" content="Citing study"></head><body><p>A method <a href="#r1">1</a>.</p><li id="r1">Target study 10.1/target</li></body></html>';
 try{const retrieve=mod.createRetriever({cacheDir:dir,requestDelayMs:0,fetchImpl:async url=>new Response(url==='https://example.org/landing'?'<html><head><meta name="citation_fulltext_html_url" content="https://example.org/full"></head></html>':html,{headers:{'content-type':'text/html'}})});
 const r=row('1');r.citingWork.landingPageUrl='https://example.org/landing';const result=await retrieve(r);assert.equal(result.verified,true);assert.match(result.excerpt,/A method/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('reference without printed DOI needs corroborating DOI-resolved author and year',()=>{
 const r=row('1');const xml='<article><front><article-title>Citing study</article-title><article-id pub-id-type="doi">10.1/C1</article-id></front><body><p>Evidence <xref rid="r1">1</xref>.</p></body><back><ref id="r1">Example Target study 2023</ref></back></article>';
 assert.equal(mod.extractLinkedContexts(xml,r).length,0);
 r.targetWork.bibliography={firstAuthor:'Example',years:['2023'],doiConfirmed:true};
 assert.equal(mod.extractLinkedContexts(xml,r).length,1);
 assert.equal(mod.extractLinkedContexts(xml.replace('2023','2021'),r).length,0);
});
test('shared evidence does not skip other papers by the second selected author',async()=>{
 const attempted=[];const out=await mod.runDeepDive({rows:[row('1','shared'),row('2','shared'),row('2','extra')],goal:2,retrieve:async r=>{attempted.push(r.citingWork.id);return {verified:true,contextAvailable:true,excerpt:'e',sourceUrl:'https://example.org'};}});
 assert.equal(out.summary.verifiedAuthors,2);assert.ok(attempted.includes('extra'));
});
test('CLI resumes verified cache, writes summary atomically and excludes target self-citation',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {promisify}=await import('node:util'),{execFile}=await import('node:child_process');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'citation-cli-'));
 try{
  const self=row('2');self.citingWork.authorIds=['https://openalex.org/SELF'];
  await fs.writeFile(path.join(dir,'input.json'),JSON.stringify({scope:{targetAuthorId:'SELF'},strictCandidates:[row('1'),self]}));
  await fs.writeFile(path.join(dir,'previous.json'),JSON.stringify({comments:{'T|C1':{verified:true,contextAvailable:true,excerpt:'Cached evidence',sourceUrl:'https://example.org/full'}}}));
  await promisify(execFile)(process.execPath,['scripts/collect-target-citation-comments.mjs','--input',path.join(dir,'input.json'),'--output',path.join(dir,'output.json'),'--previous',path.join(dir,'previous.json'),'--goal','1']);
  const out=JSON.parse(await fs.readFile(path.join(dir,'output.json'),'utf8'));assert.equal(out.summary.goalMet,true);assert.equal(out.summary.qualifiedAuthors,1);assert.equal(out.comments['T|C1'].excerpt,'Cached evidence');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('legacy refresh preserves original source and counts retained contexts when remote has none',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {promisify}=await import('node:util'),{execFile}=await import('node:child_process');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'citation-refresh-'));
 try{
  const report=path.join(dir,'records.json'),md=path.join(dir,'report.md');
  await fs.writeFile(report,JSON.stringify({records:[{userWork:{doi:'10.1/t'},citingWork:{doi:'10.1/c',title:'Citing study'},citationComment:{verified:true,contextAvailable:true,excerpt:'Original PDF context',source:'Publisher PDF'}}]}));await fs.writeFile(md,'');
  const preload='globalThis.fetch=async()=>({ok:true,json:async()=>({data:[{citingPaper:{paperId:"P",title:"Citing study",externalIds:{DOI:"10.1/c"}},contexts:[]}]})});';
  await promisify(execFile)(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(preload),'scripts/refresh-citation-comments.mjs',report,md]);
  const out=JSON.parse(await fs.readFile(report,'utf8'));assert.equal(out.records[0].citationComment.excerpt,'Original PDF context');assert.equal(out.records[0].citationComment.source,'Publisher PDF');assert.equal(out.metadata.commentRetrieval.contextsAvailable,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
