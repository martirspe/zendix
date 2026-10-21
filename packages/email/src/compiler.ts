import {renderImportedHtml, hasTemplateUnsubscribe, type TemplateContact} from './import-html';
export type BlockType = 'heading' | 'text' | 'button' | 'divider' | 'spacer' | 'image';
export interface BlockStyle {
  align?: 'left' | 'center' | 'right';
  padding?: number;
  color?: string;
  background?: string;
  fontSize?: number;
  fontFamily?: 'Arial' | 'Georgia' | 'Verdana';
}
export interface EmailBlock { id: string; type: BlockType; content: string; url?: string; style?: BlockStyle; }
export interface EmailDocument { subject: string; preheader: string; blocks: EmailBlock[]; html?: string; }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char] ?? char));
}
export function safeUrl(value: string): string {
  if (value === '{{unsubscribe_url}}') return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? escapeHtml(url.href) : '#'; }
  catch { return '#'; }
}
function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
}
function color(value: string | undefined, fallback: string): string { return /^#[\da-f]{6}$/i.test(value ?? '') ? value ?? fallback : fallback; }

export function compileEmail(document: EmailDocument, contact?:TemplateContact): string {
  if(document.html){const content=renderImportedHtml(document.html,contact),styles=/^<style>([\s\S]*?)<\/style>/.exec(content),markup=styles?content.slice(styles[0].length):content;return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(document.subject)+'</title>'+(styles?.[0]??'')+'</head><body style="margin:0;background:#f7f8fa"><div style="display:none;max-height:0;overflow:hidden">'+escapeHtml(document.preheader)+'</div>'+markup+(hasTemplateUnsubscribe(content)?'':'<table role="presentation" width="100%" style="display:table!important;visibility:visible!important;background:#ffffff!important;color:#475569!important;font:12px Arial,sans-serif!important"><tr><td align="center" style="padding:24px!important">Recibes este correo porque te suscribiste.<br><a href="{{unsubscribe_url}}" style="color:#475569!important;text-decoration:underline!important">Cancelar suscripción</a> · MailCraft</td></tr></table>')+'</body></html>';}

  const rows = document.blocks.map(block => {
    const text = escapeHtml(block.content);
    const style = block.style ?? {};
    const align = ['left','center','right'].includes(style.align ?? '') ? style.align ?? 'left' : 'left';
    const font = ['Arial','Georgia','Verdana'].includes(style.fontFamily ?? '') ? style.fontFamily ?? 'Arial' : 'Arial';
    const padding = bounded(style.padding, 16, 0, 80);
    const size = bounded(style.fontSize, block.type === 'heading' ? 32 : 16, 12, 64);
    const ink = color(style.color, block.type === 'heading' ? '#0f172a' : '#475569');
    const background = color(style.background, '#ffffff');
    let content: string;
    switch (block.type) {
      case 'heading': content = '<h1 style="font-family:'+font+',serif;font-size:'+size+'px;line-height:1.25;margin:0;color:'+ink+'">'+text+'</h1>'; break;
      case 'button': content = '<table role="presentation" align="'+align+'" cellspacing="0" cellpadding="0"><tr><td bgcolor="#C8F542" style="padding:16px 24px;border-radius:6px"><a href="'+safeUrl(block.url ?? '')+'" style="font-size:'+size+'px;color:'+ink+';text-decoration:none;font-weight:bold">'+text+'</a></td></tr></table>'; break;
      case 'divider': content = '<hr style="border:0;border-top:1px solid #e4e7eb">'; break;
      case 'spacer': content = '<div style="height:24px">&nbsp;</div>'; break;
      case 'image': content = '<img src="'+safeUrl(block.url ?? '')+'" alt="'+text+'" width="536" style="display:block;max-width:100%;height:auto;border:0;margin-left:auto;margin-right:auto">'; break;
      default: content = '<p style="font-family:'+font+',sans-serif;font-size:'+size+'px;margin:0;line-height:1.7;color:'+ink+'">'+text.replace(/\n/g,'<br>')+'</p>';
    }
    return '<tr><td align="'+align+'" bgcolor="'+background+'" style="padding:'+padding+'px 32px;text-align:'+align+';background:'+background+'">'+content+'</td></tr>';
  }).join('');
  return '<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>'+escapeHtml(document.subject)+'</title></head><body style="margin:0;background:#f7f8fa;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">'+escapeHtml(document.preheader)+'</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:white">'+rows+'<tr><td style="padding:32px;color:#64748b;font-size:12px;text-align:center">Recibes este correo porque te suscribiste.<br><a href="{{unsubscribe_url}}" style="color:#475569">Cancelar suscripción</a> · MailCraft</td></tr></table></td></tr></table></body></html>';
}
