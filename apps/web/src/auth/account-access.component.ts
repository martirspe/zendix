import {AfterViewInit,ChangeDetectionStrategy,Component,ElementRef,ViewChild,input,OnInit,output,signal} from '@angular/core';

type AuthMode = 'login' | 'register';
interface WorkspaceChoice { id:string; name:string; }
export interface AuthenticatedSession { accessToken:string; tenantId:string; workspaceName:string; userRole:'owner'|'editor'|'viewer'; user:{email:string;firstName:string;lastName:string}; }
interface AuthResponse extends Partial<AuthenticatedSession> { message?:string|string[]; requiresWorkspaceSelection?:boolean; verificationRequired?:boolean; passwordReset?:boolean; workspaces?:WorkspaceChoice[]; }
type AuthPhase='password'|'email'|'code'|'verification'|'forgot'|'reset';

declare global { interface Window {google?:{accounts:{id:{initialize(options:{client_id:string;callback:(response:{credential:string})=>void;context?:string;cancel_on_tap_outside?:boolean;use_fedcm_for_button?:boolean}):void;renderButton(parent:HTMLElement,options:{type:'standard';theme:'outline';size:'large';text:'continue_with';shape:'rectangular';logo_alignment:'left';width:number;locale:'es'}):void;}}};} }

@Component({selector:'mc-account-access',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,templateUrl:'./account-access.component.html',styleUrl:'./account-access.component.scss'})
export class AccountAccessComponent implements OnInit,AfterViewInit {
 readonly currentYear=new Date().getFullYear();
 readonly registrationAllowed=input(false);
 readonly productionMode=input(true);
 readonly emailCodeEnabled=input(false);
 readonly googleAuthEnabled=input(false);
 readonly googleClientId=input('');
 readonly authenticated=output<AuthenticatedSession>();
 readonly mode=signal<AuthMode>('login');
 readonly phase=signal<AuthPhase>('password');
 readonly loading=signal(false);
 readonly error=signal('');
 readonly workspaces=signal<WorkspaceChoice[]>([]);
 readonly passwordVisible=signal(false);
 readonly termsAccepted=signal(false);
 readonly code=signal('');
 readonly newPassword=signal('');
 readonly confirmPassword=signal('');
 readonly sentMessage=signal('');
 readonly firstName=signal('');
 readonly lastName=signal('');
 readonly email=signal('');
 readonly googleReady=signal(false);
 readonly googleError=signal('');
 readonly password=signal('');
 readonly termsUrl='https://zendix.site/legal/terminos';
 readonly privacyUrl='https://zendix.site/legal/privacidad';
 @ViewChild('googleButton') private googleButton?:ElementRef<HTMLDivElement>;
 private googleScriptPromise?:Promise<void>;
 private pendingGoogleToken='';

 ngOnInit():void{if(this.emailCodeEnabled()&&this.mode()==='login')this.phase.set('email');}
 ngAfterViewInit():void{void this.renderGoogleButton();}

 changeMode(mode:AuthMode):void { if(this.loading())return;this.pendingGoogleToken='';this.mode.set(mode);this.phase.set(mode==='register'?'password':this.emailCodeEnabled()?'email':'password');this.error.set('');this.sentMessage.set('');this.workspaces.set([]);this.password.set('');this.code.set('');queueMicrotask(()=>void this.renderGoogleButton()); }
 resetWorkspaceChoices():void { this.workspaces.set([]);this.error.set(''); }
 inputValue(event:Event):string{return (event.target as HTMLInputElement).value;}
 codeValue(event:Event):string{return this.inputValue(event).replace(/\D/g,'').slice(0,6);}
 checkedValue(event:Event):boolean{return (event.target as HTMLInputElement).checked;}
 async selectWorkspace(event:Event,workspaceId:string):Promise<void>{if(this.pendingGoogleToken){event.preventDefault();await this.signInWithGoogle(this.pendingGoogleToken,workspaceId);return;}await this.submit(event,workspaceId);}
 async signInWithGoogle(idToken:string,workspaceId?:string):Promise<void>{if(this.loading())return;if(this.mode()==='register'&&!this.termsAccepted()){this.error.set('Acepta los términos y la política de privacidad para crear tu cuenta.');return;}this.loading.set(true);this.error.set('');try{const data=await this.send('google',{idToken,...(this.mode()==='register'?{acceptedTerms:true}:{}),...(workspaceId?{workspaceId}:{})});if(data.requiresWorkspaceSelection&&data.workspaces?.length){this.pendingGoogleToken=idToken;this.workspaces.set(data.workspaces);return;}if(!data.accessToken||!data.tenantId||!data.userRole){this.error.set('La respuesta de acceso está incompleta. Vuelve a intentarlo.');return;}this.pendingGoogleToken='';this.authenticated.emit({accessToken:data.accessToken,tenantId:data.tenantId,workspaceName:data.workspaceName??'Mi organización',userRole:data.userRole,user:data.user??{email:this.email(),firstName:'',lastName:''}});}catch(error:unknown){this.error.set(error instanceof Error?error.message:'No pudimos iniciar sesión con Google. Intenta nuevamente.');}finally{this.loading.set(false);}}
 private async renderGoogleButton():Promise<void>{const host=this.googleButton?.nativeElement;if(!host||!this.googleAuthEnabled()||!this.googleClientId())return;try{if(!window.google?.accounts?.id){this.googleScriptPromise??=new Promise<void>((resolve,reject)=>{const existing=document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('No se pudo cargar Google Identity Services.')),{once:true});return;}const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.onload=()=>resolve();script.onerror=()=>reject(new Error('No se pudo cargar Google Identity Services.'));document.head.appendChild(script);});await this.googleScriptPromise;}const google=window.google?.accounts.id;if(!google||!host.isConnected)return;google.initialize({client_id:this.googleClientId(),cancel_on_tap_outside:true,use_fedcm_for_button:true,context:this.mode()==='register'?'signup':'signin',callback:response=>{if(response.credential)void this.signInWithGoogle(response.credential);}});host.replaceChildren();google.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:Math.min(Math.max(Math.floor(host.clientWidth||320),200),400),locale:'es'});this.googleReady.set(true);}catch{this.googleError.set('No se pudo cargar Google. Puedes iniciar sesión con tu correo.');}}
 async requestAccessCode(event?:Event):Promise<void>{event?.preventDefault();await this.requestCode('login-code/request','Si el correo tiene una cuenta, recibirás un código. Revisa también spam.','code');}
 async resendVerification():Promise<void>{await this.requestCode('email/verification/resend','Si la cuenta necesita verificación, enviaremos otro código.','verification');}
 async requestPasswordReset(event?:Event):Promise<void>{event?.preventDefault();await this.requestCode('password-reset/request','Si el correo tiene una cuenta, recibirás un código para restablecer la contraseña.','reset');}
 private async requestCode(path:string,message:string,next:AuthPhase):Promise<void>{if(this.loading())return;const email=this.email().trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){this.error.set('Ingresa un correo electrónico válido.');return;}this.loading.set(true);this.error.set('');try{await this.send(path,{email});this.sentMessage.set(message);this.code.set('');if(next==='reset')this.newPassword.set('');this.phase.set(next);}catch(error:unknown){this.error.set(error instanceof Error?error.message:'No pudimos enviar el código. Intenta nuevamente.');}finally{this.loading.set(false);}}
 async submit(event:Event,workspaceId?:string):Promise<void> {
  event.preventDefault();if(this.loading())return;
  const email=this.email().trim().toLowerCase(),password=this.password();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){this.error.set('Ingresa un correo electrónico válido.');return;}
  if(this.phase()==='email'){await this.requestAccessCode();return;}
  if(this.phase()==='forgot'){await this.requestPasswordReset();return;}
  if((this.phase()==='code'||this.phase()==='verification'||this.phase()==='reset')&&(!/^\d{6}$/.test(this.code()))){this.error.set('Ingresa el código de 6 dígitos.');return;}
  if(this.phase()==='reset'&&(this.newPassword().length<12||this.newPassword().length>128||this.newPassword()!==this.confirmPassword())){this.error.set(this.newPassword()!==this.confirmPassword()?'Las contraseñas no coinciden.':'Usa una contraseña de 12 a 128 caracteres.');return;}
  if(this.mode()==='register'&&(!this.firstName().trim()||!this.lastName().trim()||!this.termsAccepted())){this.error.set('Completa tus datos y acepta los términos y la política de privacidad.');return;}
  if(this.mode()==='register'&&(this.firstName().trim().length>100||this.lastName().trim().length>100||password.length<12||new TextEncoder().encode(password).length>128)){this.error.set('Usa nombres de hasta 100 caracteres y una contraseña de 12 a 128 caracteres.');return;}
  if(this.phase()==='password'&&this.mode()==='login'&&!password){this.error.set('Ingresa tu contraseña.');return;}
  this.loading.set(true);this.error.set('');
  try {
   const path=this.phase()==='code'?'login-code/verify':this.phase()==='verification'?'email/verify':this.phase()==='reset'?'password-reset/confirm':this.mode();
   const body=this.phase()==='code'||this.phase()==='verification'?{email,code:this.code(),...(workspaceId?{workspaceId}:{})}:this.phase()==='reset'?{email,code:this.code(),password:this.newPassword(),...(workspaceId?{workspaceId}:{})}:this.mode()==='register'?{firstName:this.firstName().trim(),lastName:this.lastName().trim(),email,password,acceptedTerms:true}:{email,password,...(workspaceId?{workspaceId}:{})};
   const data=await this.send(path,body);
   if(data.requiresWorkspaceSelection&&data.workspaces?.length){this.workspaces.set(data.workspaces);this.error.set('');return;}
   if(data.verificationRequired){this.mode.set('login');this.phase.set('verification');this.sentMessage.set('Enviamos un código para verificar tu correo antes de iniciar sesión.');return;}
   if(data.passwordReset){this.mode.set('login');this.phase.set(this.emailCodeEnabled()?'email':'password');this.code.set('');this.password.set('');this.sentMessage.set('Tu contraseña se actualizó. Ya puedes iniciar sesión.');return;}
   if(!data.accessToken||!data.tenantId||!data.userRole){this.error.set('La respuesta de acceso está incompleta. Vuelve a intentarlo.');return;}
   this.workspaces.set([]);this.authenticated.emit({accessToken:data.accessToken,tenantId:data.tenantId,workspaceName:data.workspaceName??'Mi organización',userRole:data.userRole,user:data.user??{email,firstName:this.firstName(),lastName:this.lastName()}});
  }catch{this.error.set('No se pudo conectar con MailCraft. Revisa tu conexión e inténtalo de nuevo.');}
  finally{this.loading.set(false);}
 }
 private async send(path:string,body:unknown):Promise<AuthResponse>{const response=await fetch('/api/auth/'+path,{method:'POST',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json() as AuthResponse;if(!response.ok){const message=Array.isArray(data.message)?data.message.join(' '):data.message;throw new Error(response.status===429?'Demasiados intentos. Espera un momento antes de volver a probar.':response.status===401?'El correo, la contraseña o el código no son correctos.':response.status===400?'Revisa los campos. Comprueba que tu contraseña tenga al menos 12 caracteres.':message??'No se pudo completar el acceso. Intenta nuevamente.');}return data;}
 backToLogin():void{this.pendingGoogleToken='';this.mode.set('login');this.phase.set(this.emailCodeEnabled()?'email':'password');this.workspaces.set([]);this.error.set('');this.code.set('');queueMicrotask(()=>void this.renderGoogleButton());}
}
