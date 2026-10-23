import { Body, Controller, Delete, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsDateString, IsString, Matches, MaxLength } from 'class-validator';
import { TenantGuard, TenantRequest } from './tenant.guard';
import { CampaignSendService } from './campaign-send.service';

class CampaignSendDto {
 @IsString() @MaxLength(120) @Matches(/^[a-z\d]+\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/) confirmationToken!:string;
}
class CampaignScheduleDto extends CampaignSendDto {
 @IsDateString({strict:true}) scheduledAt!:string;
 @IsString() @MaxLength(64) timeZone!:string;
}
const validation=new ValidationPipe({expectedType:CampaignSendDto,whitelist:true,forbidNonWhitelisted:true,transform:true});
const scheduleValidation=new ValidationPipe({expectedType:CampaignScheduleDto,whitelist:true,forbidNonWhitelisted:true,transform:true});

@Controller('campaigns') @UseGuards(TenantGuard)
export class CampaignSendController {
 constructor(@Inject(CampaignSendService) private readonly sender:CampaignSendService){}
 @Post(':id/send') async send(@Req() request:TenantRequest,@Param('id') id:string,@Body(validation) input:CampaignSendDto){return this.sender.confirm(request.tenantId,id,input.confirmationToken);}
 @Post(':id/schedule') async schedule(@Req() request:TenantRequest,@Param('id') id:string,@Body(scheduleValidation) input:CampaignScheduleDto){return this.sender.schedule(request.tenantId,id,input.confirmationToken,input.scheduledAt,input.timeZone);}
 @Delete(':id/schedule') async cancelSchedule(@Req() request:TenantRequest,@Param('id') id:string){return this.sender.cancelSchedule(request.tenantId,id);}
}
