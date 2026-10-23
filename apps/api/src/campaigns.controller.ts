import {pagination,pageMeta} from './pagination';
import {Prisma} from '@prisma/client';
import {prepareHtmlTemplate,renderImportedHtml} from '../../../packages/email/src/import-html';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Inject, UseGuards, ValidationPipe, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { IsString, MaxLength, IsDefined, ValidateNested, IsArray, ArrayMaxSize, ArrayUnique, IsUUID, IsOptional, IsInt, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { Database } from './database';
import { TenantGuard, TenantRequest } from './tenant.guard';
import { EmailDocumentDto } from './email-document.dto';

class CampaignDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(200) subject!: string;
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[^\r\n]+$/) subjectVariant?:string;
  @IsOptional() @IsInt() @Min(1) @Max(99) variantPercent?:number;
  @IsString() @MaxLength(300) preheader!: string;
  @IsDefined() @ValidateNested() @Type(() => EmailDocumentDto) document!: EmailDocumentDto;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4',{each:true}) audienceListIds?:string[];
}
const validation = new ValidationPipe({expectedType: CampaignDto, whitelist: true, forbidNonWhitelisted: true, transform: true});
function campaignData(input: CampaignDto) {
  if(Boolean(input.subjectVariant?.trim())!==Boolean(input.variantPercent))throw new BadRequestException('Completa el asunto alternativo y el porcentaje de audiencia para la prueba A/B.');
  if(input.subjectVariant?.trim()===input.subject.trim())throw new BadRequestException('El asunto alternativo debe ser diferente al asunto principal.');
  let html:string|undefined;
  if(input.document.html){try{html=prepareHtmlTemplate(input.document.html).source;renderImportedHtml(html);}catch(error:unknown){throw new BadRequestException(error instanceof Error?error.message:'Plantilla HTML inválida.');}}

  return {name: input.name, subject: input.subject, subjectVariant:input.subjectVariant?.trim()||null,variantPercent:input.subjectVariant?.trim()?input.variantPercent:null,preheader: input.preheader, document: {...(html?{html}:{}),blocks: input.document.blocks.map(block => ({...block, style: {...block.style}}))}};
}

@Controller('campaigns')
@UseGuards(TenantGuard)
export class CampaignsController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get()
  async list(@Req() request: TenantRequest) {
    return this.db.campaign.findMany({where: {tenantId: request.tenantId}, take: 100, orderBy: {createdAt: 'desc'},include:{audiences:{select:{listId:true}}}});
  }

  @Get('page') async page(@Req() request:TenantRequest,@Query('page') page='1',@Query('pageSize') pageSize='25',@Query('q') q=''){const options=pagination(page,pageSize);if(typeof q!=='string'||q.length>100)throw new BadRequestException('Búsqueda demasiado larga.');const where:Prisma.CampaignWhereInput={tenantId:request.tenantId,...(q.trim()?{OR:[{name:{contains:q.trim(),mode:'insensitive'}},{subject:{contains:q.trim(),mode:'insensitive'}}]}:{})};return this.db.$transaction(async tx=>{const total=await tx.campaign.count({where}),meta=pageMeta(total,options.page,options.pageSize);const data=await tx.campaign.findMany({where,take:meta.pageSize,skip:(meta.page-1)*meta.pageSize,orderBy:[{createdAt:'desc'},{id:'desc'}],include:{audiences:{select:{listId:true}}}});return {data:data.map(campaign=>({...campaign,audienceListIds:campaign.audiences.map(item=>item.listId)})),meta};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});}

  @Post()
  async create(@Req() request: TenantRequest, @Body(validation) input: CampaignDto) {
    const tenantId=request.tenantId,ids=input.audienceListIds??[];
    if(ids.length&&await this.db.list.count({where:{tenantId,id:{in:ids}}})!==ids.length)throw new BadRequestException('Una o más listas no pertenecen a tu espacio de trabajo.');
    return this.db.campaign.create({data: {...campaignData(input), tenantId,audiences:{create:ids.map(listId=>({tenantId,listId}))}},include:{audiences:{select:{listId:true}}}});
  }

  @Patch(':id')
  async update(@Req() request: TenantRequest, @Param('id') id: string, @Body(validation) input: CampaignDto) {
    const tenantId=request.tenantId,ids=input.audienceListIds??[];
    if(ids.length&&await this.db.list.count({where:{tenantId,id:{in:ids}}})!==ids.length)throw new BadRequestException('Una o más listas no pertenecen a tu espacio de trabajo.');
    const result=await this.db.$transaction(async tx=>{const campaign=await tx.campaign.findFirst({where:{tenantId,id,status:'draft'},select:{id:true}});if(!campaign)return false;await tx.campaign.update({where:{tenantId_id:{tenantId,id}},data:campaignData(input)});await tx.campaignAudience.deleteMany({where:{tenantId,campaignId:id}});if(ids.length)await tx.campaignAudience.createMany({data:ids.map(listId=>({tenantId,campaignId:id,listId}))});return true;},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    if(!result)throw new NotFoundException();return {updated:true};
  }
  @Get(':id') async get(@Req() request:TenantRequest,@Param('id') id:string){const campaign=await this.db.campaign.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}},include:{audiences:{select:{listId:true}}}});if(!campaign)throw new NotFoundException();return {...campaign,audienceListIds:campaign.audiences.map(item=>item.listId)};}
  @Delete(':id') async remove(@Req() request:TenantRequest,@Param('id') id:string){return this.db.$transaction(async tx=>{const campaign=await tx.campaign.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}}});if(!campaign)throw new NotFoundException();if(campaign.status!=='draft'||await tx.testEmail.count({where:{tenantId:request.tenantId,campaignId:id}})||await tx.emailDispatch.count({where:{tenantId:request.tenantId,campaignId:id}}))throw new ConflictException('Solo puedes eliminar borradores sin historial de envíos.');await tx.campaign.deleteMany({where:{tenantId:request.tenantId,id,status:'draft'}});return {deleted:true};});}

}
