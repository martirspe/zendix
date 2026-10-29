import {jwtSecret} from '../runtime';
import { createHmac } from 'node:crypto';
export function ownershipRecord(tenantId: string, hostname: string) {
  const token = createHmac('sha256', process.env['DOMAIN_VERIFICATION_SECRET'] ?? jwtSecret())
    .update('zendix-domain:' + tenantId + ':' + hostname).digest('hex');
  return {name: '_zendix.' + hostname, type: 'TXT', value: 'zendix-verification=' + token};
}
