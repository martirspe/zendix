import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function campaignSnapshot(tenantId:string,campaignId:string,subject:string,preheader:string,document:unknown,listIds:string[],contactIds:string[],scheduledAt?:string,variant?:{subjectVariant:string|null;variantPercent:number|null}):string{
 const snapshot=JSON.stringify({tenantId,campaignId,subject,preheader,document,listIds:[...listIds].sort(),contactIds:[...contactIds].sort(),...(scheduledAt?{scheduledAt}:{}),...(variant?.subjectVariant&&variant.variantPercent?{variant:{subjectVariant:variant.subjectVariant,variantPercent:variant.variantPercent}}:{})});
 return createHash('sha256').update(snapshot).digest('base64url');
}
export function signCampaignConfirmation(snapshot:string,tenantId:string,campaignId:string,key:Buffer,issuedAt=Date.now()):string{
 const issued=issuedAt.toString(36),identity=tenantId+':'+campaignId+':'+issued+':'+snapshot;
 return issued+'.'+snapshot+'.'+createHmac('sha256',key).update('campaign-send:'+identity).digest('base64url');
}
export function verifyCampaignConfirmation(token:string,snapshot:string,tenantId:string,campaignId:string,key:Buffer,now=Date.now()):boolean{
 const match=/^([a-z\d]{1,12})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token);
 if(!match||match[2]!==snapshot)return false;
 const issued=Number.parseInt(match[1]??'',36);
 if(!Number.isSafeInteger(issued)||issued>now+30000||now-issued>600000)return false;
 const expected=createHmac('sha256',key).update('campaign-send:'+tenantId+':'+campaignId+':'+match[1]+':'+snapshot).digest(),actual=Buffer.from(match[3]??'','base64url');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
