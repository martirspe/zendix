import {pagination,pageMeta} from './pagination';
import {Body,Controller,Get,Post,Patch,Delete,Param,Query,Req,Inject,UseGuards,ValidationPipe,BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {ArrayMaxSize,ArrayMinSize,Equals,IsArray,IsEmail,IsObject,IsOptional,IsString,Matches,MaxLength,ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
import {Prisma} from '@prisma/client';
import {Database} from './database';
import {TenantGuard,TenantRequest} from './tenant.guard';
class CreateContactDto { @IsEmail() email!:string; @IsString() @MaxLength(100) firstName!:string; @Equals(true) consent!:boolean; }
class CreateFieldDto { @IsString() @Matches(/^[a-z][a-z0-9_]{0,49}$/) key!:string; @IsString() @Matches(/\S/) @MaxLength(100) label!:string; }
class UpdateContactDto { @IsString() @MaxLength(100) firstName!:string; @IsOptional() @IsObject() customFields?:Record<string,unknown>; }
class UpdateFieldDto { @IsString() @Matches(/\S/) @MaxLength(100) label!:string; }
class ImportRowDto { @IsString() @MaxLength(320) email!:string; @IsString() @MaxLength(100) firstName!:string; @IsOptional() @IsObject() customFields?:Record<string,unknown>; }
class ImportContactsDto { @Equals(true) consent!:boolean; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({each:true}) @Type(()=>ImportRowDto) rows!:ImportRowDto[]; }
const reserved=new Set(['consent','status','email','firstname','tenant_id','tenantid','__proto__','prototype','constructor']);
@Controller('contacts') @UseGuards(TenantGuard)
export class ContactsController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Get() async list(@Req() request:TenantRequest,@Query('page') page='1'){if(!/^[1-9][0-9]{0,5}$/.test(page))throw new BadRequestException('Página inválida.');return this.db.contact.findMany({where:{tenantId:request.tenantId,archivedAt:null},take:100,skip:(Number(page)-1)*100,orderBy:[{createdAt:'desc'},{id:'desc'}]});}
 @Get('page') async page(@Req() request:TenantRequest,@Query('page') page='1',@Query('pageSize') pageSize='25',@Query('q') q='',@Query('status') status='all',@Query('archived') archived='false',@Query('listId') listId=''){
  if(typeof q!=='string'||typeof listId!=='string'||typeof status!=='string'||typeof archived!=='string'||listId.length>100)throw new BadRequestException('Filtros inválidos.');if(listId&&!await this.db.list.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id:listId}}}))throw new NotFoundException();const options=pagination(page,pageSize);if(q.length>100||!['all','subscribed','unsubscribed','bounced','complained'].includes(status)||!['true','false'].includes(archived))throw new BadRequestException('Filtros inválidos.');
  const where:Prisma.ContactWhereInput={tenantId:request.tenantId,archivedAt:archived==='true'?{not:null}:null,...(listId?{memberships:{some:{tenantId:request.tenantId,listId}}}:{}),...(status!=='all'?{status:status as 'subscribed'|'unsubscribed'|'bounced'|'complained'}:{}),...(q.trim()?{OR:[{email:{contains:q.trim(),mode:'insensitive'}},{firstName:{contains:q.trim(),mode:'insensitive'}}]}:{})};
  return this.db.$transaction(async tx=>{const total=await tx.contact.count({where}),meta=pageMeta(total,options.page,options.pageSize);const [data,subscribed]=await Promise.all([tx.contact.findMany({where,take:meta.pageSize,skip:(meta.page-1)*meta.pageSize,orderBy:[{createdAt:'desc'},{id:'desc'}]}),tx.contact.count({where:{tenantId:request.tenantId,archivedAt:null,status:'subscribed'}})]);return {data,meta,subscribed};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 @Patch('fields/:key') async renameField(@Req() request:TenantRequest,@Param('key') key:string,@Body(new ValidationPipe({expectedType:UpdateFieldDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:UpdateFieldDto){const result=await this.db.contactField.updateMany({where:{tenantId:request.tenantId,key},data:{label:input.label.trim()}});if(!result.count)throw new NotFoundException();return {updated:true};}
 @Delete('fields/:key') async deleteField(@Req() request:TenantRequest,@Param('key') key:string){return this.db.$transaction(async tx=>{if(await tx.contact.count({where:{tenantId:request.tenantId,attributes:{path:['customFields',key],not:Prisma.AnyNull}}}))throw new ConflictException('Este campo contiene datos de contactos y no se puede eliminar. Puedes cambiar su nombre.');const result=await tx.contactField.deleteMany({where:{tenantId:request.tenantId,key}});if(!result.count)throw new NotFoundException();return {deleted:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
 @Get('stats') async stats(@Req() request:TenantRequest){return {total:await this.db.contact.count({where:{tenantId:request.tenantId,archivedAt:null}})};}
 @Get('fields') async fields(@Req() request:TenantRequest){return this.db.contactField.findMany({where:{tenantId:request.tenantId},orderBy:{label:'asc'}});}
 @Post('fields') async createField(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:CreateFieldDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:CreateFieldDto){
  if(reserved.has(input.key.toLowerCase()))throw new BadRequestException('Ese identificador está reservado.');
  return this.db.$transaction(async tx=>{
   const existing=await tx.contactField.findUnique({where:{tenantId_key:{tenantId:request.tenantId,key:input.key}}});if(existing)return existing;
   if(await tx.contactField.count({where:{tenantId:request.tenantId}})>=100)throw new BadRequestException('Puedes crear hasta 100 campos personalizados.');
   return tx.contactField.create({data:{tenantId:request.tenantId,key:input.key,label:input.label.trim()}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 @Post('import') async import(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:ImportContactsDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:ImportContactsDto){
  const fields=await this.db.contactField.findMany({where:{tenantId:request.tenantId},select:{key:true}}),allowed=new Set(fields.map(field=>field.key));
  const data:Prisma.ContactCreateManyInput[]=[],seen=new Set<string>();let invalid=0,duplicates=0;
  for(const row of input.rows){
   const customFields:Record<string,string>={};
   for(const [key,value] of Object.entries(row.customFields??{})){
    if(!allowed.has(key)||reserved.has(key.toLowerCase()))throw new BadRequestException('Mapea los valores a un campo de tu espacio de trabajo.');
    if(typeof value!=='string'||value.length>2000)throw new BadRequestException('Cada valor personalizado debe ser texto de hasta 2000 caracteres.');
    customFields[key]=value;
   }
   const email=row.email.trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){invalid++;continue;}
   if(seen.has(email)){duplicates++;continue;}seen.add(email);
   data.push({tenantId:request.tenantId,email,firstName:row.firstName.trim(),attributes:{customFields,consent:{source:'csv_operator_confirmation',recordedAt:new Date().toISOString(),userId:request.userId}}});
  }
  const added=data.length?(await this.db.contact.createMany({data,skipDuplicates:true})).count:0;
  return {added,duplicates:duplicates+data.length-added,invalid};
 }
 @Post() async create(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:CreateContactDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:CreateContactDto){const existing=await this.db.contact.findUnique({where:{tenantId_email:{tenantId:request.tenantId,email:input.email.toLowerCase()}}});if(existing?.archivedAt)throw new ConflictException('Este contacto está archivado. Restaúralo desde la vista Archivados; su baja se conservará.');return this.db.contact.upsert({where:{tenantId_email:{tenantId:request.tenantId,email:input.email.toLowerCase()}},create:{tenantId:request.tenantId,email:input.email.toLowerCase(),firstName:input.firstName,attributes:{consent:{source:'operator_confirmation',recordedAt:new Date().toISOString(),userId:request.userId}}},update:{firstName:input.firstName}});}
 @Patch(':id/unsubscribe') async unsubscribe(@Req() request:TenantRequest,@Param('id') id:string){const result=await this.db.contact.updateMany({where:{tenantId:request.tenantId,id,status:{in:['subscribed','unsubscribed']}},data:{status:'unsubscribed'}});if(!result.count)throw new NotFoundException();return {unsubscribed:true};}
 @Get(':id') async get(@Req() request:TenantRequest,@Param('id') id:string){const contact=await this.db.contact.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}},include:{memberships:{where:{tenantId:request.tenantId},select:{listId:true}}}});if(!contact)throw new NotFoundException();return contact;}
 @Patch(':id') async update(@Req() request:TenantRequest,@Param('id') id:string,@Body(new ValidationPipe({expectedType:UpdateContactDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:UpdateContactDto){
  const fields=await this.db.contactField.findMany({where:{tenantId:request.tenantId},select:{key:true}}),allowed=new Set(fields.map(field=>field.key));for(const [key,value] of Object.entries(input.customFields??{})){if(!allowed.has(key)||typeof value!=='string'||value.length>2000)throw new BadRequestException('Revisa los campos personalizados y sus valores.');}
  const result=await this.db.$executeRaw(Prisma.sql`UPDATE "Contact" SET "first_name"=${input.firstName.trim()}, "attributes"=jsonb_set("attributes",'{customFields}',COALESCE("attributes"->'customFields','{}'::jsonb)||${JSON.stringify(input.customFields??{})}::jsonb) WHERE tenant_id=${request.tenantId} AND id=${id} AND archived_at IS NULL`);if(!result)throw new NotFoundException();return {updated:true};
 }
 @Delete(':id') async archive(@Req() request:TenantRequest,@Param('id') id:string){return this.db.$transaction(async tx=>{const contact=await tx.contact.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}}});if(!contact)throw new NotFoundException();if(!contact.archivedAt){const archivedAt=new Date();await tx.contact.updateMany({where:{tenantId:request.tenantId,id,archivedAt:null,status:'subscribed'},data:{archivedAt,status:'unsubscribed'}});await tx.contact.updateMany({where:{tenantId:request.tenantId,id,archivedAt:null},data:{archivedAt}});}return {archived:true};});}
 @Post(':id/restore') async restore(@Req() request:TenantRequest,@Param('id') id:string){const result=await this.db.contact.updateMany({where:{tenantId:request.tenantId,id},data:{archivedAt:null}});if(!result.count)throw new NotFoundException();return {restored:true};}

}


