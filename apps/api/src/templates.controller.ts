import {Body,Controller,Get,Post,Patch,Delete,Param,Req,Inject,UseGuards,ValidationPipe,BadRequestException,NotFoundException} from '@nestjs/common';
import {IsString,Matches,MaxLength} from 'class-validator';
import {Database} from './database';
import {TenantGuard,TenantRequest} from './tenant.guard';
import {prepareHtmlTemplate} from '../../../packages/email/src/import-html';
import {compileEmail} from '../../../packages/email/src/compiler';
class TemplateDto {@IsString() @Matches(/\S/) @MaxLength(200) name!:string;@IsString() @MaxLength(250000) html!:string;}
@Controller('templates') @UseGuards(TenantGuard)
export class TemplatesController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Get() async list(@Req() request:TenantRequest){return this.db.emailTemplate.findMany({where:{tenantId:request.tenantId},take:100,orderBy:{name:'asc'},select:{id:true,name:true}});}
 @Get(':id') async get(@Req() request:TenantRequest,@Param('id') id:string){const template=await this.db.emailTemplate.findFirst({where:{tenantId:request.tenantId,id}});if(!template)throw new NotFoundException();return template;}
 @Post() async create(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:TemplateDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:TemplateDto){
  if(await this.db.emailTemplate.count({where:{tenantId:request.tenantId}})>=100)throw new BadRequestException('Tu biblioteca admite hasta 100 plantillas.');
  try{const imported=prepareHtmlTemplate(input.html);const document={blocks:[],html:imported.source,subject:imported.title,preheader:imported.preheader};const compiledHtml=compileEmail(document);return await this.db.emailTemplate.create({data:{tenantId:request.tenantId,name:input.name.trim(),document,compiledHtml}});}catch(error:unknown){throw new BadRequestException(error instanceof Error?error.message:'No se pudo importar la plantilla.');}
 }
 @Patch(':id') async update(@Req() request:TenantRequest,@Param('id') id:string,@Body(new ValidationPipe({expectedType:TemplateDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:TemplateDto){let document:{blocks:never[];html:string;subject:string;preheader:string},compiledHtml:string;try{const imported=prepareHtmlTemplate(input.html);document={blocks:[],html:imported.source,subject:imported.title,preheader:imported.preheader};compiledHtml=compileEmail(document);}catch(error:unknown){throw new BadRequestException(error instanceof Error?error.message:'HTML inválido.');}const result=await this.db.emailTemplate.updateMany({where:{tenantId:request.tenantId,id},data:{name:input.name.trim(),document,compiledHtml}});if(!result.count)throw new NotFoundException();return {updated:true};}
 @Delete(':id') async remove(@Req() request:TenantRequest,@Param('id') id:string){const result=await this.db.emailTemplate.deleteMany({where:{tenantId:request.tenantId,id}});if(!result.count)throw new NotFoundException();return {deleted:true};}

}
