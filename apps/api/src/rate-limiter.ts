import {HttpException,Injectable,OnModuleDestroy,ServiceUnavailableException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import Redis from 'ioredis';

@Injectable()
export class RateLimiter implements OnModuleDestroy {
 private readonly client=new Redis(process.env['REDIS_URL']??'redis://redis:6379',{maxRetriesPerRequest:1,enableOfflineQueue:false});
 constructor(){this.client.on('error',()=>undefined);}
 async check(identity:string,limit:number,seconds=60):Promise<void>{
  const key='mailcraft:rate:'+createHash('sha256').update(identity).digest('hex');
  let count:unknown;
  try{count=await this.client.eval("local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return count;",1,key,seconds);}
  catch{throw new ServiceUnavailableException('El control de acceso no está disponible. Vuelve a intentarlo.');}
  if(Number(count)>limit)throw new HttpException('Demasiados intentos. Espera un minuto antes de volver a intentarlo.',429);
 }
 async onModuleDestroy(){await this.client.quit();}
}
