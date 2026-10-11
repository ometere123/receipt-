/** Verify an immutable, bounded GitHub evidence snapshot without relying on a database. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [owner,repo,sha,doc,source,claim]=process.argv.slice(2);
if(!owner||!repo||!sha||!doc||!source||!claim){console.error('Usage: node tools/source-audit.mjs owner repo full40SHA doc.md code.py "Exact claim"');process.exit(2);}
const ownerOk=/^[A-Za-z0-9-]{1,39}$/.test(owner)&&!owner.startsWith('-')&&!owner.endsWith('-');
const repoOk=/^[A-Za-z0-9_.-]{1,90}$/.test(repo)&&repo!=='.'&&repo!=='..';
const pathOk=p=>p.length<=140&&/^[A-Za-z0-9._/+\-]+$/.test(p)&&p.split('/').every(x=>x!=='.'&&x!=='..'&&x!=='');
if(!ownerOk||!repoOk||!/^[0-9a-f]{40}$/.test(sha)||!pathOk(doc)||!pathOk(source))throw Error('Invalid pinned Git file identifiers');
const digest=b=>createHash('sha256').update(b).digest('hex');
async function get(path,max) {
 const url=`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`;
 const resp=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!resp.ok)throw Error(`${resp.status} ${path}`);
 const b=Buffer.from(await resp.arrayBuffer());if(b.length>max)throw Error(`${path} exceeds size limit`);
 return {text:new TextDecoder('utf-8',{fatal:true}).decode(b),sha256:digest(b),bytes:b.length,url};
}
const [d,s]=await Promise.all([get(doc,18000),get(source,20000)]);
if(!d.text.includes(claim))throw Error('Claim does not appear verbatim in frozen documentation');
console.log(JSON.stringify({owner,repo,commit:sha,doc:{path:doc,...d,text:undefined},source:{path:source,...s,text:undefined},claim},null,2));
