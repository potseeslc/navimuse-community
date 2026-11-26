import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountRecovery} from '../server/accountRecoveryService.mjs';
const code=`r1.${'A'.repeat(43)}`,input={code,password:'Synthetic replacement passphrase'};
test('recovery admission runs before password work and failures disclose only fixed codes',async()=>{
 let admission=true,hashes=0,writes=0,screenFailure=null;
 const store={consumePasswordLoginAttempt:async()=>admission,recoverPasswordWithCode:async()=>{writes++;return null;}};
 const passwords={enrollPassword:async()=>{hashes++;if(screenFailure)throw screenFailure;return {synthetic:true};}};
 const service=createAccountRecovery({store,passwords,mode:'local',throttleSecret:Buffer.alloc(32,1)});
 assert.deepEqual(await service.redeem(input,{networkAddress:'invalid'}),{ok:false,code:'RECOVERY_UNAVAILABLE'});assert.equal(hashes,0);
 admission=false;assert.deepEqual(await service.redeem(input,{networkAddress:'127.0.0.1'}),{ok:false,code:'RECOVERY_THROTTLED'});assert.equal(hashes,0);
 admission=true;assert.deepEqual(await service.redeem(input,{networkAddress:'127.0.0.1'}),{ok:false,code:'RECOVERY_FAILED'});assert.equal(hashes,1);assert.equal(writes,1);
 screenFailure=Object.assign(new Error('private screening detail'),{code:'PASSWORD_COMPROMISED'});
 assert.deepEqual(await service.redeem(input,{networkAddress:'127.0.0.1'}),{ok:false,code:'PASSWORD_COMPROMISED'});assert.equal(writes,1);
 screenFailure=new Error('private service detail');assert.deepEqual(await service.redeem(input,{networkAddress:'127.0.0.1'}),{ok:false,code:'RECOVERY_UNAVAILABLE'});
 const oidc=createAccountRecovery({store,passwords,mode:'oidc',throttleSecret:Buffer.alloc(32,1)}),before=hashes;
 assert.deepEqual(await oidc.redeem(input,{networkAddress:'127.0.0.1'}),{ok:false,code:'RECOVERY_DISABLED'});assert.equal(hashes,before);
});
