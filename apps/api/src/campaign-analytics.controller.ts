import { Controller, Get, Inject, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { TenantGuard, TenantRequest } from './tenant.guard';

interface EventSummary { type:string; events:bigint; recipients:bigint; }
interface LinkSummary { url:string|null; clicks:bigint; recipients:bigint; }
interface SubjectSummary { subject:string|null; recipients:bigint; delivered:bigint; opened:bigint; clicked:bigint; }

@Controller('campaigns')
@UseGuards(TenantGuard)
export class CampaignAnalyticsController {
 constructor(@Inject(Database) private readonly db:Database){}

 @Get(':id/analytics')
 async analytics(@Req() request:TenantRequest,@Param('id') id:string){
  const tenantId=request.tenantId;
  const campaign=await this.db.campaign.findUnique({where:{tenantId_id:{tenantId,id}},select:{id:true,name:true,subject:true,status:true,scheduledAt:true,timeZone:true}});
  if(!campaign)throw new NotFoundException();
  const [dispatches,eventSummaries,links,subjects,recent]=await Promise.all([
   this.db.emailDispatch.groupBy({by:['status'],where:{tenantId,campaignId:id},_count:{_all:true}}),
   this.db.$queryRaw<EventSummary[]>(Prisma.sql`SELECT e."type", COUNT(*)::bigint AS "events", COUNT(DISTINCT e."dispatch_id")::bigint AS "recipients" FROM "EmailEvent" e JOIN "EmailDispatch" d ON d."tenant_id"=e."tenant_id" AND d."id"=e."dispatch_id" WHERE e."tenant_id"=${tenantId} AND d."campaign_id"=${id} GROUP BY e."type"`),
   this.db.$queryRaw<LinkSummary[]>(Prisma.sql`SELECT e."payload"->>'url' AS "url", COUNT(*)::bigint AS "clicks", COUNT(DISTINCT e."dispatch_id")::bigint AS "recipients" FROM "EmailEvent" e JOIN "EmailDispatch" d ON d."tenant_id"=e."tenant_id" AND d."id"=e."dispatch_id" WHERE e."tenant_id"=${tenantId} AND d."campaign_id"=${id} AND e."type"='click' AND e."payload"->>'url' IS NOT NULL GROUP BY e."payload"->>'url' ORDER BY COUNT(*) DESC LIMIT 50`),
   this.db.$queryRaw<SubjectSummary[]>(Prisma.sql`SELECT d."subject", COUNT(DISTINCT d."contact_id")::bigint AS "recipients", COUNT(DISTINCT e."dispatch_id") FILTER (WHERE e."type"='delivered')::bigint AS "delivered", COUNT(DISTINCT e."dispatch_id") FILTER (WHERE e."type"='open')::bigint AS "opened", COUNT(DISTINCT e."dispatch_id") FILTER (WHERE e."type"='click')::bigint AS "clicked" FROM "EmailDispatch" d LEFT JOIN "EmailEvent" e ON e."tenant_id"=d."tenant_id" AND e."dispatch_id"=d."id" WHERE d."tenant_id"=${tenantId} AND d."campaign_id"=${id} GROUP BY d."subject" ORDER BY d."subject"`),
   this.db.emailEvent.findMany({where:{tenantId,dispatch:{tenantId,campaignId:id}},orderBy:{occurredAt:'desc'},take:100,select:{type:true,occurredAt:true,payload:true,dispatch:{select:{contact:{select:{email:true,firstName:true}}}}}})
  ]);
  const statusCounts=Object.fromEntries(dispatches.map(item=>[item.status,item._count._all]));
  const total=dispatches.reduce((sum,item)=>sum+item._count._all,0);
  const count=(type:string)=>Number(eventSummaries.find(item=>item.type===type)?.recipients??0n);
  const eventCount=(type:string)=>Number(eventSummaries.find(item=>item.type===type)?.events??0n);
  const rate=(value:number)=>total?Math.round(value/total*10000)/100:0;
  return {campaign,totals:{recipients:total,accepted:statusCounts['accepted']??0,delivered:count('delivered'),opened:count('open'),clicked:count('click'),hardBounced:count('hard-bounced'),softBounced:count('soft-bounced'),complained:count('complained'),unsubscribed:count('unsubscribed'),dropped:count('dropped')},rates:{delivered:rate(count('delivered')),opened:rate(count('open')),clicked:rate(count('click')),hardBounced:rate(count('hard-bounced')),unsubscribed:rate(count('unsubscribed'))},events:Object.fromEntries(eventSummaries.map(item=>[item.type,{events:Number(item.events),recipients:Number(item.recipients)}])),subjects:subjects.map(item=>{const recipients=Number(item.recipients);return {subject:item.subject??'(Sin asunto)',recipients,delivered:Number(item.delivered),opened:Number(item.opened),clicked:Number(item.clicked),openRate:recipients?Math.round(Number(item.opened)/recipients*10000)/100:0,clickRate:recipients?Math.round(Number(item.clicked)/recipients*10000)/100:0};}),links:links.map(item=>({url:item.url,clicks:Number(item.clicks),recipients:Number(item.recipients)})),recent:recent.map(item=>({type:item.type,occurredAt:item.occurredAt,recipient:item.dispatch.contact.email,firstName:item.dispatch.contact.firstName,...(item.payload&&typeof item.payload==='object'&&!Array.isArray(item.payload)&&typeof item.payload['url']==='string'?{url:item.payload['url']}: {})})),tracking:{opens:eventCount('open')>0||campaign.status==='sent'||campaign.status==='sending',clicks:eventCount('click')>0||campaign.status==='sent'||campaign.status==='sending'}};
 }
}
