export interface DnsRecords {
  spf: string[];
  dkim: string[];
  dmarc: string[];
  ownership: string[];
  lockdown: string[];
  mx: string[];
}

/** Record inspection only: this does not perform complete SPF evaluation or prove delivery. */
export function inspectRecords(records: DnsRecords, ownershipToken: string, accountId: string) {
  const spf = records.spf.filter(record => /^v=spf1(?:\s|$)/i.test(record));
  const dkim = records.dkim.filter(record => /(?:^|;)\s*p\s*=\s*[A-Za-z0-9+/]+={0,2}\s*(?:;|$)/.test(record));
  const dmarc = records.dmarc.filter(record => /^v=DMARC1\s*;/i.test(record));
  return {
    ownership: records.ownership.includes(ownershipToken),
    spf: spf.length === 1 && /(?:^|\s)\+?include:relay\.mailchannels\.net(?:\s|$)/i.test(spf[0] ?? '') && !/(?:^|\s)\+?all(?:\s|$)/i.test(spf[0] ?? ''),
    dkim: dkim.length === 1,
    dmarc: dmarc.length === 1 && /;\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i.test(dmarc[0] ?? ''),
    lockdown: Boolean(accountId) && records.lockdown.some(record => /^v=mc1(?:\s|$)/i.test(record) && record.split(/\s+/).includes('auth=' + accountId)),
    mx: records.mx.some(record => record !== '.'),
  };
}
