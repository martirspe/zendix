export interface DnsRecord { id: string; name: string; type: string; content: string; ttl: number; }
export interface DnsChange { action: 'create' | 'update'; name: string; content: string; id?: string; previous?: string; }
export function txtContent(value: string): string {
  return value.startsWith('"') ? value.replace(/"\s*"/g, '').replace(/^"|"$/g, '').replace(/\\"/g, '"') : value;
}

export function planDns(records: DnsRecord[], host: string, proof: string, accountId: string, selector: string, publicKey: string): DnsChange[] {
  const changes: DnsChange[] = [];
  const at = (name: string) => records.filter(record => record.name.toLowerCase() === name);
  const ensure = (name: string, content: string) => {
    const existing = at(name);
    if (existing.some(record => ['CNAME','NS'].includes(record.type))) throw new Error('DNS_NAME_CONFLICT:' + name);
    if (existing.some(record => record.type === 'TXT' && txtContent(record.content) === content)) return;
    changes.push({action: 'create', name, content});
  };
  ensure('_mailcraft.' + host, proof);
  const spf = at(host).filter(record => record.type === 'TXT' && /^v=spf1(?:\s|$)/i.test(txtContent(record.content)));
  if (spf.length > 1) throw new Error('MULTIPLE_SPF');
  if (!spf.length) ensure(host, 'v=spf1 include:relay.mailchannels.net ~all');
  else {
    const record = spf[0];
    if (!record) throw new Error('INVALID_SPF');
    const value = txtContent(record.content);
    if (/(?:^|\s)\+?all(?:\s|$)/i.test(value) || /(?:^|\s)[-~?]include:relay\.mailchannels\.net(?:\s|$)/i.test(value)) throw new Error('UNSAFE_SPF_POLICY');
    if (!/(?:^|\s)\+?include:relay\.mailchannels\.net(?:\s|$)/i.test(value)) changes.push({action: 'update', id: record.id, name: host, previous: value, content: value.replace(/^v=spf1/i, 'v=spf1 include:relay.mailchannels.net')});
  }
  const dmarcName = '_dmarc.' + host;
  const dmarc = at(dmarcName).filter(record => record.type === 'TXT' && /^v=DMARC1/i.test(txtContent(record.content)));
  if (dmarc.length > 1) throw new Error('MULTIPLE_DMARC');
  if (!dmarc.length) ensure(dmarcName, 'v=DMARC1; p=none;');
  else if (!/;\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i.test(txtContent(dmarc[0]?.content ?? ''))) throw new Error('INVALID_DMARC');
  const keyName = selector + '._domainkey.' + host;
  const keyValue = 'v=DKIM1; k=rsa; p=' + publicKey;
  if (at(keyName).some(record => record.type === 'TXT' && txtContent(record.content) !== keyValue)) throw new Error('DKIM_SELECTOR_CONFLICT');
  ensure(keyName, keyValue);
  const lockdownName = '_mailchannels.' + host;
  const lockdownValue = 'v=mc1 auth=' + accountId;
  const lockdown = at(lockdownName).filter(record => record.type === 'TXT' && /^v=mc1/i.test(txtContent(record.content)));
  if (lockdown.length && !lockdown.some(record => txtContent(record.content).split(/\s+/).includes('auth=' + accountId))) throw new Error('LOCKDOWN_ACCOUNT_CONFLICT');
  if (!lockdown.length) ensure(lockdownName, lockdownValue);
  return changes;
}
