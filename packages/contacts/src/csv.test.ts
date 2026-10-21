import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsv,parseCsv } from './csv';
test('CSV supports BOM, CRLF, quoted commas, escaped quotes and embedded newlines',()=>{
 const parsed=parseCsv('\uFEFFemail,name\r\na@example.com,"Doe, Jane"\r\nb@example.com,"A ""great""\nname"\r\n');
 assert.deepEqual(parsed.headers,['email','name']);assert.equal(parsed.rows[0]?.[1],'Doe, Jane');assert.equal(parsed.rows[1]?.[1],'A "great"\nname');
});
test('CSV detects semicolon, tab, pipe and Excel separator hints without splitting quoted cells',()=>{
 for(const delimiter of [';','\t','|'] as const){const parsed=parseCsv('EMAIL'+delimiter+'APELLIDOS'+delimiter+'NOMBRE\r\na@example.com'+delimiter+delimiter+'"Ana; Luz"\r\n');assert.equal(parsed.delimiter,delimiter);assert.deepEqual(parsed.rows,[['a@example.com','','Ana; Luz']]);}
 assert.equal(parseCsv('sep=;\nemail;name\na@example.com;Ana').delimiter,';');assert.equal(parseCsv('"email";"name, surname"\na@example.com;Ana').delimiter,';');
});
test('CSV keeps blank and duplicate columns mappable and pads missing trailing fields',()=>{
 const parsed=parseCsv('email;Email;;name\na@example.com;;;\nb@example.com');assert.deepEqual(parsed.headers,['email','Email (2)','Columna 3','name']);assert.deepEqual(parsed.rows[1],['b@example.com','','','']);
});
test('CSV reports malformed quotes and excess cells and accepts 17669 contacts',()=>{
 for(const input of ['email,name\na,b,c','email,name\na,"unclosed','email,name\na,"closed"junk'])assert.throws(()=>parseCsv(input));
 assert.equal(parseCsv('EMAIL;APELLIDOS;NOMBRE\n'+Array.from({length:17669},(_,i)=>'test'+i+'@example.invalid;;').join('\n')).rows.length,17669);
});
test('CSV decodes UTF-16 and Windows-1252 exports',()=>{
 const utf16=Buffer.from('\uFEFFemail;nombre\na@example.com;José','utf16le');assert.match(decodeCsv(utf16.buffer.slice(utf16.byteOffset,utf16.byteOffset+utf16.byteLength) as ArrayBuffer),/José/);
 const latin=Uint8Array.from([74,111,115,233]);assert.equal(decodeCsv(latin.buffer),'José');
});
