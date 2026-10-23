import {Prisma} from '@prisma/client';

const consentSources=new Set(['operator_confirmation','csv_operator_confirmation']);

export function hasRecordedConsent(attributes:Prisma.JsonValue):boolean {
 if(!attributes||typeof attributes!=='object'||Array.isArray(attributes))return false;
 const value=attributes['consent'];
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const source=value['source'],recordedAt=value['recordedAt'],userId=value['userId'];
 return typeof source==='string'&&consentSources.has(source)&&typeof recordedAt==='string'&&Number.isFinite(Date.parse(recordedAt))&&typeof userId==='string'&&userId.length>0;
}
