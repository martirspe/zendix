import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsUUID } from 'class-validator';
import { TenantGuard, TenantRequest } from '../tenant.guard';
import { TestEmailService } from './test-email.service';
class TestEmailDto { @IsEmail() recipient!:string; @IsUUID() idempotencyKey!:string; }
@Controller('test-emails') @UseGuards(TenantGuard)
export class TestEmailController {
 constructor(@Inject(TestEmailService) private readonly service:TestEmailService){}
 @Get() list(@Req() request:TenantRequest,@Query('campaignId') campaignId?:string){return this.service.list(request.tenantId,campaignId);}
 @Post(':campaignId') send(@Req() request:TenantRequest,@Param('campaignId') campaignId:string,@Body(new ValidationPipe({expectedType:TestEmailDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:TestEmailDto){return this.service.request(request.tenantId,campaignId,input.recipient.toLowerCase(),input.idempotencyKey);}
}
