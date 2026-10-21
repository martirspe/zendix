export async function validateSpfBudget(value:string,resolve:(hostname:string)=>Promise<string[]>):Promise<number> {
 let lookups=0;
 const visit=async(record:string,path:Set<string>):Promise<void>=>{
  const terms=record.trim().split(/\s+/);if(terms.shift()?.toLowerCase()!=='v=spf1')throw new Error('INVALID_SPF');
  for(const raw of terms){
   const term=raw.replace(/^[+?~-]/,'');
   if(term.toLowerCase()==='all')break;
   const reference=/^(?:include:|redirect=)(.+)$/i.exec(term);
   if(reference){
    const hostname=reference[1]?.toLowerCase()??'';
    if(!/^[a-z0-9_.-]+$/.test(hostname)||path.has(hostname))throw new Error('SPF_DYNAMIC_OR_CYCLIC');
    if(++lookups>10)throw new Error('SPF_LOOKUP_LIMIT');
    const records=(await resolve(hostname)).filter(item=>/^v=spf1(?:\s|$)/i.test(item));
    if(records.length!==1)throw new Error('SPF_REFERENCE_INVALID');
    await visit(records[0]??'',new Set([...path,hostname]));
   }else if(/^(a|mx|exists|ptr)(:|\/|$)/i.test(term)){if(++lookups>10)throw new Error('SPF_LOOKUP_LIMIT');}
  }
 };
 await visit(value,new Set());return lookups;
}
