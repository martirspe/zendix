import {parseDocument} from 'htmlparser2';
import {isTag, type ChildNode, type Element} from 'domhandler';
import * as css from 'css-tree';

const tags=new Set('div span p a img table tbody thead tfoot tr td th h1 h2 h3 h4 h5 h6 br hr strong b em i u s small sup sub ul ol li center blockquote v:roundrect v:rect v:fill v:textbox v:stroke w:anchorlock'.split(' '));
const voidTags=new Set(['img','br','hr','w:anchorlock','v:fill','v:stroke']);
const attributes=new Set('class id style width height align valign bgcolor border cellpadding cellspacing colspan rowspan role alt title dir lang target arcsize fillcolor strokecolor stroke fill xmlns:v xmlns:w'.split(' '));
const properties=new Set('color background background-color font font-family font-size font-weight font-style font-variant line-height text-align text-decoration text-transform text-indent letter-spacing word-spacing white-space word-break overflow-wrap border border-top border-right border-bottom border-left border-color border-width border-style border-radius border-collapse border-spacing padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left width min-width max-width height min-height max-height display vertical-align overflow opacity outline list-style-type table-layout -webkit-text-size-adjust -ms-text-size-adjust mso-table-lspace mso-table-rspace mso-hide v-text-anchor'.split(' '));
const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]??char));
export interface ImportedTemplate {source:string;title:string;preheader:string;warnings:string[];}
export interface TemplateContact {firstName:string;email:string;}

function declarations(nodes:css.List<css.CssNode>):string {
 const output:string[]=[];
 nodes.forEach(node=>{
  if(node.type!=='Declaration'||!properties.has(node.property.toLowerCase()))return;
  let safe=true;
  css.walk(node.value,part=>{if(part.type==='Raw'||part.type==='Url'||part.type==='Atrule'||(part.type==='Function'&&!['rgb','rgba','hsl','hsla','calc'].includes(part.name.toLowerCase())))safe=false;});
  const value=css.generate(node.value);
  if(/[<>\\]|expression|javascript|behavior|binding|url\s*\(/i.test(value))safe=false;
  if(/^(margin|padding|width|height|min-|max-|text-indent)/.test(node.property)&&/-\s*\d/.test(value))safe=false;
  if(safe)output.push(node.property+':'+value+(node.important?'!important':''));
 });return output.join(';');
}
function inlineStyle(value:string):string {try{const ast=css.parse(value,{context:'declarationList'});return ast.type==='DeclarationList'?declarations(ast.children):'';}catch{return '';}}
function stylesheet(value:string):string {
 function rules(nodes:css.List<css.CssNode>,depth=0):string {
  if(depth>4)return '';let output='';
  nodes.forEach(node=>{
   if(node.type==='Atrule'&&node.name.toLowerCase()==='media'&&node.prelude&&node.block){const query=css.generate(node.prelude);if(/^[\w\s:().,\-]+$/.test(query))output+='@media '+query+'{'+rules(node.block.children,depth+1)+'}';}
   if(node.type==='Rule'&&node.prelude.type==='SelectorList'){
    const selectors:string[]=[];node.prelude.children.forEach(selector=>{const text=css.generate(selector);if(/[<>\\]/.test(text))return;selectors.push(/^(html|body|:root)$/i.test(text)?'.mc-import-root':'.mc-import-root '+text);});
    const style=declarations(node.block.children);if(selectors.length&&style)output+=selectors.join(',')+'{'+style+'}';
   }
  });return output;
 }
 try{const ast=css.parse(value);return ast.type==='StyleSheet'?rules(ast.children):'';}catch{return '';}
}
function textContent(node:ChildNode,depth=0):string {if(depth>80)return '';if(node.type==='text')return node.data;if(isTag(node))return node.children.map(child=>textContent(child,depth+1)).join('');return '';}
export function prepareHtmlTemplate(value:string):ImportedTemplate {
 if(!value.trim())throw new Error('Pega el HTML de tu plantilla o selecciona un archivo.');
 if(value.length>250000)throw new Error('La plantilla supera los 250 000 caracteres.');
 let source=value.replace(/\{\{\s*mirror(?:_url)?\s*\}\}/g,'{{mirror_url}}').replace(/\{\{\s*unsubscribe_url\s*\}\}/g,'{{unsubscribe_url}}').replace(/\{\{\s*unsubscribe\s*\}\}/gi,'{{unsubscribe_url}}').replace(/\{\{\s*contact\.(FIRSTNAME|first_name)\s*\}\}/g,'{{contact.first_name}}').replace(/\{\{\s*contact\.(EMAIL|email)\s*\}\}/g,'{{contact.email}}').replace(/\{%\s*if\s+contact\.FIRSTNAME\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,'$1');
 const supported=new Set(['contact.first_name','contact.email','unsubscribe_url','mirror_url']);
 if(/\{%/.test(source)||[...source.matchAll(/\{\{([\s\S]*?)\}\}/g)].some(match=>!supported.has((match[1]??'').trim())))throw new Error('Hay variables o condiciones no compatibles. Usa contact.first_name, contact.email, unsubscribe_url y mirror_url.');
 const document=parseDocument(source,{recognizeSelfClosing:true});let title='',preheader='';
 const inspect=(nodes:ChildNode[],depth=0)=>{if(depth>80)throw new Error('La plantilla tiene demasiados niveles de anidación.');for(const node of nodes){if(isTag(node)){if(node.name==='title')title=textContent(node).trim().slice(0,200);if(!preheader&&node.name==='div'&&/display\s*:\s*none/i.test(node.attribs['style']??''))preheader=textContent(node).trim().slice(0,300);inspect(node.children,depth+1);}}};inspect(document.children);
 const warnings=['El diseño se conserva como HTML editable; no se convierte en bloques visuales.','Las imágenes deben tener URLs públicas HTTPS. La vista previa las bloquea hasta que decidas mostrarlas.'];
 if(/<script|<iframe|<form|\son\w+\s*=|@import/i.test(source))warnings.push('Se eliminó contenido activo o estilos no compatibles de la vista previa y del correo compilado.');

 return {source,title,preheader,warnings};
}

/** Imported CSS is restricted to its wrapper so it cannot hide the mandatory footer. */
export function renderImportedHtml(value:string,contact?:TemplateContact):string {
 const {source}=prepareHtmlTemplate(value);const document=parseDocument(source,{recognizeSelfClosing:true});let styles='',body:Element|undefined;
 const locate=(nodes:ChildNode[])=>{for(const node of nodes){if(isTag(node)){if(node.name==='style')styles+=stylesheet(textContent(node));else if(node.name==='body')body=node;else locate(node.children);}}};locate(document.children);
 const merge=(text:string)=>text.replace(/\{\{contact\.first_name\}\}/g,()=>contact?.firstName??'{{contact.first_name}}').replace(/\{\{contact\.email\}\}/g,()=>contact?.email??'{{contact.email}}');
 const url=(value:string,image=false)=>{if(['{{unsubscribe_url}}','{{mirror_url}}'].includes(value)&&!image)return value;try{const parsed=new URL(value);if(parsed.username||parsed.password)return '';return (image?['https:']:['https:','http:','mailto:','tel:']).includes(parsed.protocol)?parsed.href:'';}catch{return '';}};
 function serialize(nodes:ChildNode[],depth=0):string {
  if(depth>80)return '';return nodes.map(node=>{
   if(node.type==='text')return esc(merge(node.data));
   if(node.type==='comment'){
    const match=/^\[if\s+((?:!?mso|(?:gte|gt|lte|lt)\s+mso\s+\d+))\]>([\s\S]*)<!\[endif\]$/i.exec(node.data.trim());
    return match?'<!--[if '+match[1]+']>'+serialize(parseDocument(match[2]??'',{recognizeSelfClosing:true}).children,depth+1)+'<![endif]-->':'';
   }
   if(!isTag(node)||!tags.has(node.name))return '';
   const attrs:string[]=[];
   for(const [key,value] of Object.entries(node.attribs)){
    if(key==='href'||(key==='src'&&node.name==='img')){const safe=url(value,key==='src');if(safe)attrs.push(key+'="'+esc(safe)+'"');}
    else if(key==='style'){const safe=inlineStyle(value);if(safe)attrs.push('style="'+esc(safe)+'"');}
    else if(attributes.has(key))attrs.push(key+'="'+esc(value)+'"');
   }
   if(node.name==='a')attrs.push('rel="noopener noreferrer"');
   return '<'+node.name+(attrs.length?' '+attrs.join(' '):'')+(voidTags.has(node.name)&&node.name.includes(':')?'/':'')+'>'+ (voidTags.has(node.name)?'':serialize(node.children,depth+1)+'</'+node.name+'>');
  }).join('');
 }
 const background=inlineStyle(body?.attribs['style']??'');
 return (styles?'<style>'+styles+'</style>':'')+'<div class="mc-import-root" style="'+esc(background)+';position:relative!important;overflow:hidden!important;max-width:100%!important">'+serialize(body?body.children:document.children)+'</div>';
}


/** Only an ordinary, non-hidden anchor with readable text can replace the fallback footer. */
export function hasTemplateUnsubscribe(html:string):boolean {
 const document=parseDocument(html,{recognizeSelfClosing:true});
 const hidden=/(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\D|$)|font-size\s*:\s*0(?:\D|$)|(?:max-)?height\s*:\s*0(?:\D|$)|mso-hide\s*:\s*all|color\s*:\s*transparent)/i;
 let unsafeStyles=false;
 const styles=(nodes:ChildNode[])=>{for(const node of nodes){if(isTag(node)){if(node.name==='style'&&hidden.test(textContent(node)))unsafeStyles=true;styles(node.children);}}};styles(document.children);if(unsafeStyles)return false;
 const find=(nodes:ChildNode[],blocked=false):boolean=>nodes.some(node=>{if(!isTag(node))return false;const invisible=blocked||hidden.test(node.attribs['style']??'');return !invisible&&node.name==='a'&&node.attribs['href']==='{{unsubscribe_url}}'&&!!textContent(node).trim()||find(node.children,invisible);});
 return find(document.children);
}

