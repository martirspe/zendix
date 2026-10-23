import {CampaignReviewController} from './campaign-review.controller';
import {CampaignAnalyticsController} from './campaign-analytics.controller';
import {ContactBulkController} from './contact-bulk.controller';
import {ContactViewsController} from './contact-views.controller';
import {ListsController} from './lists.controller';
import {EmailViewController} from './integrations/email-view.controller';
import {TemplatesController} from './templates.controller';
import 'reflect-metadata';
import { Module, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtModule } from '@nestjs/jwt';
import { ContactsController } from './contacts.controller';
import { Database } from './database';
import { OwnerGuard, TenantGuard, TenantRequest } from './tenant.guard';
import { RateLimiter } from './rate-limiter';
import { SessionsService } from './sessions.service';
import { configureRuntime,jwtSecret,validateRuntime } from './runtime';
import { AuthController } from './auth.controller';
import { AuthEmailService } from './auth-email.service';
import {GoogleIdentityService} from './google-identity.service';
import { CampaignsController } from './campaigns.controller';
import { DomainsController } from './domains.controller';
import { SecretVault } from './integrations/secret-vault';
import { MailchannelsEmailApi } from './integrations/mailchannels-email-api';
import { CloudflareService } from './integrations/cloudflare.service';
import { IntegrationsController } from './integrations/integrations.controller';
import { TestEmailController } from './integrations/test-email.controller';
import { TestEmailService } from './integrations/test-email.service';
import { UnsubscribeController } from './integrations/unsubscribe.controller';
import { MailchannelsWebhookController } from './integrations/mailchannels-webhook.controller';
import { ProviderWebhookService } from './integrations/provider-webhook.service';
import { CampaignSendService } from './campaign-send.service';
import { CampaignSendController } from './campaign-send.controller';
import { DeliveryQueue, HealthController } from './health.controller';
@Module({imports:[JwtModule.registerAsync({useFactory:()=>({secret:jwtSecret()})})],controllers:[CampaignReviewController,CampaignAnalyticsController,CampaignSendController,ContactBulkController,ContactViewsController,ListsController,EmailViewController,TemplatesController,HealthController,ContactsController,AuthController,CampaignsController,DomainsController,IntegrationsController,TestEmailController,UnsubscribeController,MailchannelsWebhookController],providers:[Database,TenantGuard,OwnerGuard,SessionsService,RateLimiter,DeliveryQueue,SecretVault,AuthEmailService,GoogleIdentityService,MailchannelsEmailApi,CloudflareService,TestEmailService,ProviderWebhookService,CampaignSendService,DomainsController]})
class AppModule {}
async function bootstrap(){
 configureRuntime();
 validateRuntime();
 const adapter=new FastifyAdapter({bodyLimit:5242880,trustProxy:process.env['NODE_ENV']==='production'?(_address:string,hop:number)=>hop===0:false});
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,adapter,{rawBody:true});
 const limiter=app.get(RateLimiter);
 adapter.getInstance().addHook('onSend',async(_request,reply,payload)=>{reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff');return payload;});
 adapter.getInstance().addHook('onRequest',async request=>{
  if(!request.url.startsWith('/auth/')||request.method!=='POST')return;
  if(process.env['NODE_ENV']==='production'&&request.headers.origin!==process.env['APP_PUBLIC_URL'])throw new ForbiddenException('Origen de solicitud no permitido.');
  const codeFlow=['/auth/login-code/','/auth/email/','/auth/password-reset/'].some(path=>request.url.startsWith(path));
  const registrationFlow=request.url.startsWith('/auth/register');
  const credentialFlow=request.url.startsWith('/auth/login')||request.url.startsWith('/auth/google');
  const bucket=codeFlow?'email-code':registrationFlow?'registration':credentialFlow?'credentials':'session';
  await limiter.check('auth:'+request.ip+':'+bucket,registrationFlow?5:codeFlow?10:credentialFlow?10:60,registrationFlow||codeFlow?900:60);
 });
 app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 app.enableShutdownHooks();await app.listen(3000,'0.0.0.0');
}
void bootstrap();


