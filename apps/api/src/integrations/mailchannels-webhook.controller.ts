import { Controller, ForbiddenException, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Webhooks } from 'mailchannels-sdk';
import type { FastifyRequest } from 'fastify';
import { ProviderWebhookService } from './provider-webhook.service';
import { RateLimiter } from '../rate-limiter';

type RawWebhookRequest = FastifyRequest & { rawBody?: Buffer };
export function freshSignatureInput(value:string,now=Date.now()):boolean{
 const match=/(?:^|[;,]\s*)created=(\d+)(?=;|,|$)/.exec(value);
 if(!match)return false;
 const created=Number(match[1]);
 return Number.isSafeInteger(created)&&created<=Math.floor(now/1000)+30&&Math.floor(now/1000)-created<=300;
}

@Controller('webhooks/mailchannels')
export class MailchannelsWebhookController {
  constructor(@Inject(ProviderWebhookService) private readonly events: ProviderWebhookService,@Inject(RateLimiter) private readonly limiter:RateLimiter) {}

  @Post()
  async receive(@Req() request: RawWebhookRequest) {
    await this.limiter.check('mailchannels-webhook:'+request.ip,300);
    const rawBody=request.rawBody;
    if(!rawBody)throw new ForbiddenException('No se pudo verificar el cuerpo original del webhook.');
    const contentDigest=request.headers['content-digest'];
    const signatureInput=request.headers['signature-input'];
    const signature=request.headers.signature;
    if(typeof contentDigest!=='string'||typeof signatureInput!=='string'||typeof signature!=='string')throw new UnauthorizedException('Firma de webhook incompleta.');
    if(!freshSignatureInput(signatureInput))throw new UnauthorizedException('La firma del webhook caducó.');
    const verified=await Webhooks.verify({payload:rawBody.toString('utf8'),headers:{'content-digest':contentDigest,'signature-input':signatureInput,signature}});
    if(verified.error||!verified.data)throw new UnauthorizedException('Firma de webhook inválida.');
    let payload:unknown;
    try{payload=JSON.parse(rawBody.toString('utf8')) as unknown;}catch{throw new ForbiddenException('El lote del proveedor no contiene JSON válido.');}
    // MailChannels sends webhook validation as one event object, while normal
    // delivery notifications arrive as a batch. Normalize both shapes here.
    const events=Array.isArray(payload)?payload:[payload];
    if(events.length===0||events.length>1000)throw new ForbiddenException('El lote del proveedor debe contener entre 1 y 1 000 eventos.');
    return this.events.receive(events);
  }
}
