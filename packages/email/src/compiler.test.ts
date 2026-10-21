import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileEmail } from './compiler';
test('compiler constrains styling, preserves line breaks and rejects CSS injection', () => {
 const html = compileEmail({subject:'Subject',preheader:'',blocks:[{id:'1',type:'text',content:'Line one\nLine two',style:{padding:1000,fontSize:999,color:'red;position:fixed',background:'#123456',align:'center'}}]});
 assert.ok(html.includes('padding:80px 32px'));
 assert.ok(html.includes('font-size:64px'));
 assert.ok(html.includes('Line one<br>Line two'));
 assert.ok(html.includes('bgcolor="#123456"'));
 assert.ok(!html.includes('position:fixed'));
});
test('compiler escapes content, rejects executable links and always includes opt-out', () => {
 const html = compileEmail({subject:'<script>',preheader:'Preview',blocks:[{id:'1',type:'button',content:'<img onerror=alert(1)>',url:'javascript:alert(1)'}]});
 assert.ok(!html.includes('<script>')); assert.ok(!html.includes('javascript:')); assert.ok(html.includes('{{unsubscribe_url}}')); assert.ok(html.includes('&lt;img'));
});
