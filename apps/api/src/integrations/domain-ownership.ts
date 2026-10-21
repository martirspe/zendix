import {jwtSecret} from '../runtime';
import { createHmac } from 'node:crypto';
export function ownershipRecord(tenantId: string, hostname: string) {
  const token = createHmac('sha256', process.env['DOMAIN_VERIFICATION_SECRET'] ?? jwtSecret())
    .update('mailcraft-domain:' + tenantId + ':' + hostname).digest('hex');
  return {name: '_mailcraft.' + hostname, type: 'TXT', value: 'mailcraft-verification=' + token};
}
