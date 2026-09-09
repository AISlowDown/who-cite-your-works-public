import fs from 'node:fs/promises';
import path from 'node:path';
import {runDeepDive,createRetriever} from './lib/citation-deep-dive.mjs';

const argv=process.argv.slice(2), flags={};
for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--'))flags[argv[i].slice(2)]=argv[++i];
const [slug,researcher,date=new Date().toISOString().slice(0,10)]=argv;
if(!flags.input&&(!slug||!researcher))throw Error('Usage: node scripts/collect-target-citation-comments.mjs <slug> <researcher> [date] OR --input candidates.json --output comments.json [--goal 10] [--previous comments.json] [--cache-dir path]');
const root=process.env.CITATION_RADAR_WORKSPACE||process.cwd();
const input=flags.input||path.join(root,'citation-radar','reports',date,slug+'-citation-candidates.json');
if(flags.input&&!flags.output)throw Error('--output required with --input');
const output=flags.output||path.join(path.dirname(input),slug+'-citation-comments.json');
const report=JSON.parse(await fs.readFile(input,'utf8'));
if(!Array.isArray(report.strictCandidates))throw Error('Input requires strictCandidates already screened for role, institution, citation threshold and identity');
let previous={};try{previous=JSON.parse(await fs.readFile(flags.previous||output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const targetId=String(report.scope?.targetAuthorId||'').split('/').at(-1);
const rows=report.strictCandidates.filter(r=>!r.citingWork?.isSelfCitation&&!(targetId&&(r.citingWork.authorIds||[]).some(id=>String(id).split('/').at(-1)===targetId)));
const save=async data=>{await fs.mkdir(path.dirname(output),{recursive:true});const tmp=output+'.tmp-'+process.pid;await fs.writeFile(tmp,JSON.stringify({...data,scope:report.scope},null,2)+'\n');await fs.rename(tmp,output);};
const result=await runDeepDive({rows,goal:Number(flags.goal||10),previous,retrieve:createRetriever({cacheDir:flags['cache-dir']||path.join(path.dirname(output),'fulltext-cache')}),onCheckpoint:save});
await save(result);console.log(JSON.stringify({output,...result.summary},null,2));
