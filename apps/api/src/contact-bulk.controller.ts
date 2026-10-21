import {Body,Controller,Inject,Post,Req,UseGuards,ValidationPipe,NotFoundException,ConflictException} from '@nestjs/common';
import {ArrayMaxSize,ArrayMinSize,ArrayUnique,IsArray,IsIn,IsOptional,IsUUID} from 'class-validator';
import {Prisma} from '@prisma/client';import {Database} from './database';import {TenantGuard,TenantRequest} from './tenant.guard';
class BulkContactsDto {
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ArrayUnique() @IsUUID('4',{each:true}) ids!:string[];
 @IsIn(['archive','unsubscribe','addToList','removeFromList']) action!:'archive'|'unsubscribe'|'addToList'|'removeFromList';
 @IsOptional() @IsUUID('4') listId?:string;
}
@Controller('contacts/bulk') @UseGuards(TenantGuard)
export class ContactBulkController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Post() async apply(@Req() request:TenantRequest,@Body(new ValidationPipe({expectedType:BulkContactsDto,whitelist:true,forbidNonWhitelisted:true,transform:true})) input:BulkContactsDto){
  try{return await this.db.$transaction(async tx=>{
   const where={tenantId:request.tenantId,id:{in:input.ids}};
   if(await tx.contact.count({where})!==input.ids.length)throw new NotFoundException('No se encontraron todos los contactos en tu espacio. No se aplicó ningún cambio.');
   let changed=0;
   if(input.action==='archive'){
    const archivedAt=new Date();const subscribed=await tx.contact.updateMany({where:{...where,archivedAt:null,status:'subscribed'},data:{archivedAt,status:'unsubscribed'}});
    const others=await tx.contact.updateMany({where:{...where,archivedAt:null},data:{archivedAt}});changed=subscribed.count+others.count;
   }else if(input.action==='unsubscribe')changed=(await tx.contact.updateMany({where:{...where,archivedAt:null,status:'subscribed'},data:{status:'unsubscribed'}})).count;
   else{
    if(!input.listId||!await tx.list.findUnique({where:{tenantId_id:{tenantId:request.tenantId,id:input.listId}}}))throw new NotFoundException('Selecciona una lista de tu espacio de trabajo.');
    if(input.action==='addToList'){
     if(await tx.contact.count({where:{...where,archivedAt:{not:null}}}))throw new ConflictException('No puedes añadir contactos archivados a una lista. Revisa la selección.');
     changed=(await tx.contactList.createMany({data:input.ids.map(contactId=>({tenantId:request.tenantId,contactId,listId:input.listId!})),skipDuplicates:true})).count;
    }else changed=(await tx.contactList.deleteMany({where:{tenantId:request.tenantId,listId:input.listId,contactId:{in:input.ids}}})).count;
   }
   return {requested:input.ids.length,changed,unchanged:input.ids.length-changed};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
  catch(error:unknown){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2034')throw new ConflictException('Los contactos cambiaron mientras confirmabas. Actualiza la tabla y vuelve a intentarlo.');throw error;}
 }
}
