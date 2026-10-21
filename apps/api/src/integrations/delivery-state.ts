export function smtpFailure(error:unknown):{status:'failed'|'uncertain';code:string} {
  if(error&&typeof error==='object'){
    const code='code' in error?error.code:undefined;
    const responseCode='responseCode' in error?error.responseCode:undefined;
    if(code==='EAUTH')return {status:'failed',code:'SMTP_AUTH_FAILED'};
    if(typeof responseCode==='number'&&responseCode>=400&&responseCode<=599)return {status:'failed',code:'SMTP_REJECTED'};
  }
  return {status:'uncertain',code:'SMTP_RESULT_UNKNOWN'};
}
