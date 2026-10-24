import { Controller, ForbiddenException, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import { createVerify } from 'node:crypto';
import { ConfirmSubscriptionCommand, SNSClient } from '@aws-sdk/client-sns';
import type { FastifyRequest } from 'fastify';
import { ProviderWebhookService } from './provider-webhook.service';
import { RateLimiter } from '../rate-limiter';

interface SnsEnvelope {Type:string;MessageId:string;TopicArn:string;Message:string;Timestamp:string;SignatureVersion:string;Signature:string;SigningCertURL:string;Subject?:string;SubscribeURL?:string;Token?:string;}
function signedFields(message:SnsEnvelope):string[]{return message.Type==='Notification'?['Message','MessageId','Subject','Timestamp','TopicArn','Type']:['Message','MessageId','SubscribeURL','Timestamp','Token','TopicArn','Type'];}
export async function verifySnsEnvelope(value:unknown,topicArn:string):Promise<SnsEnvelope>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new UnauthorizedException('Mensaje SNS inválido.');
  const message=value as SnsEnvelope;
  const region=/^arn:aws[a-z-]*:sns:([a-z0-9-]+):[0-9]{12}:[A-Za-z0-9_-]+$/.exec(topicArn)?.[1];
  if(!region||message.TopicArn!==topicArn||!['Notification','SubscriptionConfirmation'].includes(message.Type)||message.SignatureVersion!=='2'||typeof message.Signature!=='string'||typeof message.MessageId!=='string')throw new UnauthorizedException('Origen SNS no autorizado.');
  const issued=Date.parse(message.Timestamp);
  if(!Number.isFinite(issued)||Math.abs(Date.now()-issued)>300000)throw new UnauthorizedException('Mensaje SNS caducado.');
  let url:URL;
  try{url=new URL(message.SigningCertURL);}catch{throw new UnauthorizedException('Certificado SNS inválido.');}
  if(url.protocol!=='https:'||url.hostname!==`sns.${region}.amazonaws.com`||url.port||url.username||url.password||url.search||url.hash||!/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname))throw new UnauthorizedException('Certificado SNS no autorizado.');
  const lines:string[]=[];
  for(const field of signedFields(message)){const content=message[field as keyof SnsEnvelope];if(field==='Subject'&&content===undefined)continue;if(typeof content!=='string')throw new UnauthorizedException('Firma SNS incompleta.');lines.push(field,content);}
  let certificate:string;
  try{const response=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)throw new Error();certificate=await response.text();if(certificate.length>10000)throw new Error();}
  catch{throw new UnauthorizedException('No se pudo validar el certificado SNS.');}
  const verifier=createVerify('RSA-SHA256');verifier.update(lines.join('\n')+'\n');verifier.end();
  if(!verifier.verify(certificate,Buffer.from(message.Signature,'base64')))throw new UnauthorizedException('Firma SNS inválida.');
  return message;
}

@Controller('webhooks/ses')
export class SesWebhookController {
  constructor(@Inject(ProviderWebhookService) private readonly events:ProviderWebhookService,@Inject(RateLimiter) private readonly limiter:RateLimiter){}
  @Post()
  async receive(@Req() request:FastifyRequest & {rawBody?:Buffer}){
    await this.limiter.check('ses-webhook:'+request.ip,300);
    const topicArn=process.env['SES_EVENTS_TOPIC_ARN']?.trim();
    if(!topicArn)throw new ForbiddenException('El tema de eventos no está configurado.');
    let value:unknown=request.body;
    if(Buffer.isBuffer(request.rawBody)){try{value=JSON.parse(request.rawBody.toString('utf8')) as unknown;}catch{throw new ForbiddenException('Mensaje SNS inválido.');}}
    else if(typeof value==='string'){try{value=JSON.parse(value) as unknown;}catch{throw new ForbiddenException('Mensaje SNS inválido.');}}
    const envelope=await verifySnsEnvelope(value,topicArn);
    if(envelope.Type==='SubscriptionConfirmation'){
      const region=topicArn.split(':')[3];
      const client=new SNSClient({region,maxAttempts:1});
      try{await client.send(new ConfirmSubscriptionCommand({TopicArn:topicArn,Token:envelope.Token,AuthenticateOnUnsubscribe:'true'}));}
      finally{client.destroy();}
      return {verified:true};
    }
    let event:unknown;
    try{event=JSON.parse(envelope.Message) as unknown;}catch{throw new ForbiddenException('Evento SES inválido.');}
    return this.events.receiveSes(envelope.MessageId,event);
  }
}
