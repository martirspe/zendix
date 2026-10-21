import {pagination,pageMeta} from './pagination';
import {Prisma} from '@prisma/client';
import {prepareHtmlTemplate,renderImportedHtml} from '../../../packages/email/src/import-html';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Inject, UseGuards, ValidationPipe, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { IsString, MaxLength, IsDefined, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Database } from './database';
import { TenantGuard, TenantRequest } from './tenant.guard';
import { EmailDocumentDto } from './email-document.dto';

class CampaignDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(200) subject!: string;
  @IsString() @MaxLength(300) preheader!: string;
  @IsDefined() @ValidateNested() @Type(() => EmailDocumentDto) document!: EmailDocumentDto;
}
const validation = new ValidationPipe({expectedType: CampaignDto, whitelist: true, forbidNonWhitelisted: true, transform: true});
function campaignData(input: CampaignDto) {
  let html:string|undefined;
  if(input.document.html){try{html=prepareHtmlTemplate(input.document.html).source;renderImportedHtml(html);}catch(error:unknown){throw new BadRequestException(error instanceof Error?error.message:'Plantilla HTML inválida.');}}

  return {name: input.name, subject: input.subject, preheader: input.preheader, document: {...(html?{html}:{}),blocks: input.document.blocks.map(block => ({...block, style: {...block.style}}))}};
}

@Controller('campaigns')
@UseGuards(TenantGuard)
export class CampaignsController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get()
  async list(@Req() request: TenantRequest) {
    return this.db.campaign.findMany({where: {tenantId: request.tenantId}, take: 100, orderBy: {createdAt: 'desc'}});
  }

  @Get('page') async page(@Req() request:TenantRequest,@Query('page') page='1',@Query('pageSize') pageSize='25',@Query('q') q=''){const options=pagination(page,pageSize);if(typeof q!=='string'||q.length>100)throw new BadRequestException('Búsqueda demasiado larga.');const where:Prisma.CampaignWhereInput={tenantId:request.tenantId,...(q.trim()?{OR:[{name:{contains:q.trim(),mode:'insensitive'}},{subject:{contains:q.trim(),mode:'insensitive'}}]}:{})};return this.db.$transaction(async tx=>{const total=await tx.campaign.count({where}),meta=pageMeta(total,options.page,options.pageSize);return {data:await tx.campaign.findMany({where,take:meta.pageSize,skip:(meta.page-1)*meta.pageSize,orderBy:[{createdAt:'desc'},{id:'desc'}]}),meta};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});}

  @Post()
  async create(@Req() request: TenantRequest, @Body(validation) input: CampaignDto) {
    return this.db.campaign.create({data: {...campaignData(input), tenantId: request.tenantId}});
  }

  @Patch(':id')
  async update(@Req() request: TenantRequest, @Param('id') id: string, @Body(validation) input: CampaignDto) {
    const result = await this.db.campaign.updateMany({where: {tenantId: request.tenantId, id, status: 'draft'}, data: campaignData(input)});
    if (!result.count) throw new NotFoundException();
    return {updated: true};
  }
  @Get(':id') async get(@Req() request:TenantRequest,@Param('id') id:string){const campaign=await this.db.campaign.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}}});if(!campaign)throw new NotFoundException();return campaign;}
  @Delete(':id') async remove(@Req() request:TenantRequest,@Param('id') id:string){return this.db.$transaction(async tx=>{const campaign=await tx.campaign.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}}});if(!campaign)throw new NotFoundException();if(campaign.status!=='draft'||await tx.testEmail.count({where:{tenantId:request.tenantId,campaignId:id}})||await tx.emailDispatch.count({where:{tenantId:request.tenantId,campaignId:id}}))throw new ConflictException('Solo puedes eliminar borradores sin historial de envíos.');await tx.campaign.deleteMany({where:{tenantId:request.tenantId,id,status:'draft'}});return {deleted:true};});}

}
