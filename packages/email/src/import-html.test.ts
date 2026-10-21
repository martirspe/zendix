import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareHtmlTemplate,renderImportedHtml} from './import-html';
import {compileEmail} from './compiler';
const source='<!doctype html><html><head><title>Mi campaña</title><style>body,table,td,a{margin:0;color:#123456}@media only screen and (max-width:620px){.shell{width:100%!important}}</style></head><body style="background:#f3f6fc"><div style="display:none">Vista previa</div><table class="shell" width="600"><tr><td><p>Hola{% if contact.FIRSTNAME %} {{ contact.FIRSTNAME }}{% endif %}</p><a href="{{ unsubscribe }}">Baja</a><a href="{{ mirror }}">Ver en navegador</a><img src="https://example.invalid/image.jpg" alt="Marca"><!--[if mso]><v:roundrect href="https://example.invalid/" style="height:50px;v-text-anchor:middle;width:235px" fillcolor="#123456"><w:anchorlock/><center>Activar</center></v:roundrect><![endif]--></td></tr></table></body></html>';
test('HTML import retains email tables, mobile CSS and sanitized Outlook VML while adapting Brevo variables',()=>{
 const imported=prepareHtmlTemplate(source);assert.equal(imported.title,'Mi campaña');assert.equal(imported.preheader,'Vista previa');assert.match(imported.source,/\{\{contact.first_name\}\}/);assert.doesNotMatch(imported.source,/\{%/);
 const html=compileEmail({subject:'Mi campaña',preheader:'Vista previa',blocks:[],html:source},{firstName:'Ana <img onerror="attack">',email:'ana@example.invalid'});
 assert.match(html,/<table class="shell" width="600">/);assert.match(html,/@media only screen and\s*\(max-width:620px\)/);assert.match(html,/\.mc-import-root \.shell/);assert.match(html,/<!--\[if mso\]><v:roundrect/);assert.match(html,/v-text-anchor:middle/);assert.match(html,/<center>Activar<\/center>/);assert.match(html,/Ana &lt;img/);assert.doesNotMatch(html,/Cancelar suscripción/);assert.match(html,/\{\{unsubscribe_url\}\}/);assert.doesNotMatch(html,/\{\{\s*mirror\s*\}\}|<img onerror/);assert.match(html,/href="\{\{mirror_url\}\}"/);
});
test('HTML sanitization removes active elements, unsafe URLs and CSS and isolates rules from mandatory opt-out',()=>{
 const raw='<style>body{display:none}*{font-size:0}table{position:fixed;background:url(https://tracker.invalid/a)}@import "https://tracker.invalid/x";@media screen{a{color:red}}</style><script>alert(1)</script><iframe src="https://tracker.invalid"></iframe><form action="https://tracker.invalid"><input></form><svg onload="attack()"></svg><p onclick="attack()" style="color:red;position:fixed;margin-top:-999px;background:url(https://tracker.invalid/a)">Texto</p><a href="java&#x73;cript:attack()">Enlace</a><img src="data:text/html,attack" onerror="attack()">';
 const html=compileEmail({subject:'Safe',preheader:'',blocks:[],html:raw});
 assert.doesNotMatch(html,/<script|<iframe|<form|<svg|onclick|onerror|javascript:|position:fixed|margin-top:-|url\(|@import|src="data:/i);assert.match(html,/\.mc-import-root\{display:none\}/);assert.match(html,/\.mc-import-root \*\{font-size:0\}/);assert.ok(html.indexOf('Cancelar suscripción')>html.indexOf('</div>'));assert.match(html,/visibility:visible!important/);
});
test('HTML import rejects unsupported template logic and oversized source and compiles deterministically',()=>{
 assert.throws(()=>prepareHtmlTemplate('{% for item in items %}test{% endfor %}'));assert.throws(()=>prepareHtmlTemplate('{{contact.PASSWORD}}'));assert.throws(()=>prepareHtmlTemplate('x'.repeat(250001)));
 assert.equal(renderImportedHtml(source),renderImportedHtml(prepareHtmlTemplate(source).source));
});

test('HTML import adds fallback unsubscribe for missing, empty, hidden or comment-only links',()=>{
 for(const html of ['<p>Hola</p>','<a href="{{unsubscribe_url}}"></a>','<div style="display:none"><a href="{{unsubscribe_url}}">Baja</a></div>','<!--[if mso]><a href="{{unsubscribe_url}}">Baja</a><![endif]-->'])assert.match(compileEmail({subject:'Test',preheader:'',blocks:[],html}),/Cancelar suscripción/);
 assert.doesNotMatch(compileEmail({subject:'Test',preheader:'',blocks:[],html:'<p>Información comercial <a href="{{ unsubscribe }}">Darse de baja</a></p>'}),/Cancelar suscripción/);
});
