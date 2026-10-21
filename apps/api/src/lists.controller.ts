import {Body,Controller,Get,Post,Patch,Delete,Param,Req,Inject,UseGuards,ValidationPipe,NotFoundException,BadRequestException} from '@nestjs/common';
import {IsString,Matches,MaxLength,IsArray,ArrayMinSize,ArrayMaxSize,IsUUID} from 'class-validator';
import {Database} from './database';import {TenantGuard,TenantRequest} from './tenant.guard';
class ListDto {@IsString() @Matches(/\S/) @MaxLength(100) name!:string;}
class ListMembersDto {@IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('4',{each:true}) contactIds!:string[];}
const validation=new ValidationPipe({expectedType:ListDto,whitelist:true,forbidNonWhitelisted:true,transform:true});
@Controller('lists') @UseGuards(TenantGuard)
export class ListsController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Get() async list(@Req() request:TenantRequest){return this.db.list.findMany({where:{tenantId:request.tenantId},take:100,orderBy:[{name:'asc'},{id:'asc'}],include:{_count:{select:{memberships:{where:{contact:{archivedAt:null}}}}}}});}
 @Post() async create(@Req() request:TenantRequest,@Body(validation) input:ListDto){if(await this.db.list.count({where:{tenantId:request.tenantId}})>=100)throw new BadRequestException('Puedes crear hasta 100 listas.');return this.db.list.create({data:{tenantId:request.tenantId,name:input.name.trim()}});}
 @Get(':id') async get(@Req() request:TenantRequest,@Param('id') id:string){const list=await this.db.list.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}},include:{_count:{select:{memberships:{where:{contact:{archivedAt:null}}}}}}});if(!list)throw new NotFoundException();return list;}
 @Patch(':id') async update(@Req() request:TenantRequest,@Param('id') id:string,@Body(validation) input:ListDto){const result=await this.db.list.updateMany({where:{tenantId:request.tenantId,id},data:{name:input.name.trim()}});if(!result.count)throw new NotFoundException();return {updated:true};}
 @Delete(':id') async remove(@Req() request:TenantRequest,@Param('id') id:string){return this.db.$transaction(async tx=>{if(!await tx.list.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id}}}))throw new NotFoundException();await tx.contactList.deleteMany({where:{tenantId:request.tenantId,listId:id}});await tx.list.deleteMany({where:{tenantId:request.tenantId,id}});return {deleted:true};});}
 @Post(':id/contacts') async addMembers(@Req() request:TenantRequest,@Param('id') id:string,@Body(new ValidationPipe({expectedType:ListMembersDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:ListMembersDto){await this.get(request,id);const ids=[...new Set(input.contactIds)];if(await this.db.contact.count({where:{tenantId:request.tenantId,id:{in:ids},archivedAt:null}})!==ids.length)throw new NotFoundException('No se encontraron todos los contactos en tu espacio.');return this.db.contactList.createMany({data:ids.map(contactId=>({tenantId:request.tenantId,listId:id,contactId})),skipDuplicates:true});}
 @Delete(':id/contacts/:contactId') async removeMember(@Req() request:TenantRequest,@Param('id') id:string,@Param('contactId') contactId:string){await this.get(request,id);await this.db.contactList.deleteMany({where:{tenantId:request.tenantId,listId:id,contactId}});return {removed:true};}
}
