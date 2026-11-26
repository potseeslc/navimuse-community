import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {readAccountRequestBody,ACCOUNT_BODY_LIMIT} from '../server/accountRequestBody.mjs';
const body={username:'owner',password:'  Päss🔑word remains unchanged  ',remember:true};
function stream(headers={}) {const req=new PassThrough();req.headers={'content-type':'application/json',...headers};return req;}
async function parse(value,kind='login',headers={}) {const req=stream(headers);const pending=readAccountRequestBody(req,kind);req.end(Buffer.from(typeof value==='string'?value:JSON.stringify(value)));return pending;}
const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code && !error.message.includes(body.password));

test('every UTF-8 byte split preserves password and username exactly',async()=>{
  const bytes=Buffer.from(JSON.stringify(body));
  for (let split=1;split<bytes.length;split++) {
    const req=stream(),pending=readAccountRequestBody(req,'login');req.write(bytes.subarray(0,split));req.end(bytes.subarray(split));
    assert.deepEqual(await pending,body);
  }
  assert.deepEqual(await parse({username:'owner',password:'x'}),{username:'owner',password:'x',remember:false});
});

test('body shape, encoding, field types and byte bounds are explicit',async()=>{
  for (const value of [null,[],true,'', '{}', '{broken', {...body,remember:'true'}, {...body,accountId:'caller'}, {...body,roles:['owner']}, {...body,password:'a'.repeat(1025)}, {...body,password:'🔑'.repeat(257)}, {...body,password:'\ud800'}, {...body,username:4}]) await rejects(parse(value),'INVALID_ACCOUNT_BODY');
  for (const headers of [{'content-type':'text/plain'},{'content-type':['application/json']},{'content-type':'application/json; charset=latin1'},{'content-encoding':'gzip'}]) await rejects(parse(body,'login',headers),'UNSUPPORTED_ACCOUNT_BODY');
  await rejects(parse(body,'login',{'content-length':String(ACCOUNT_BODY_LIMIT+1)}),'ACCOUNT_BODY_TOO_LARGE');
  await rejects(parse(body,'login',{'content-length':'-1'}),'INVALID_ACCOUNT_BODY');
  await rejects(parse(body,'login',{'content-length':'1'}),'INVALID_ACCOUNT_BODY');
  const req=stream(),pending=readAccountRequestBody(req,'login');req.end(Buffer.from([0x7b,0xff,0x7d]));await rejects(pending,'INVALID_ACCOUNT_BODY');
  const setup={setupToken:'synthetic-setup-token',username:'owner',displayName:'Owner 🎵',password:'passphrase'};
  assert.deepEqual(await parse(setup,'setup'),setup);
  await rejects(parse({...setup,remember:true},'setup'),'INVALID_ACCOUNT_BODY');
});

test('chunked overflow and stalled or aborted streams are bounded and release listeners',async()=>{
  const large=stream(),over=readAccountRequestBody(large,'login');large.write(Buffer.alloc(ACCOUNT_BODY_LIMIT));large.write(Buffer.from('x'));
  await rejects(over,'ACCOUNT_BODY_TOO_LARGE');assert.equal(large.destroyed,true);
  const stalled=stream(),timeout=readAccountRequestBody(stalled,'login',{timeoutMs:10});stalled.write(Buffer.from('{'));
  await rejects(timeout,'ACCOUNT_BODY_TIMEOUT');assert.equal(stalled.destroyed,true);
  const aborted=stream(),pending=readAccountRequestBody(aborted,'login');aborted.destroy();await rejects(pending,'INVALID_ACCOUNT_BODY');
  for (const req of [large,stalled,aborted]) for (const event of ['data','end','error','aborted','close']) assert.equal(req.listenerCount(event),0);
});

test('real chunked HTTP preserves a split multibyte password and rejects extra authority fields',async t=>{
  const server=createServer(async(req,res)=>{
    try {
      const parsed=await readAccountRequestBody(req,'login');
      // Never echo the submitted password: report only a synthetic comparison.
      res.end(JSON.stringify({matches:parsed.password===body.password,remember:parsed.remember}));
    } catch(error) {if (!res.destroyed) {res.writeHead(error.status??500);res.end(JSON.stringify({code:error.code}));}}
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const send=async payload=>new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,method:'POST',headers:{'Content-Type':'application/json'}},res=>{
      let result='';res.setEncoding('utf8');res.on('data',part=>{result+=part;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(result)}));
    });req.on('error',reject);
    const bytes=Buffer.from(JSON.stringify(payload)),split=bytes.indexOf(Buffer.from('🔑'))+1;
    req.write(bytes.subarray(0,split));setImmediate(()=>req.end(bytes.subarray(split)));
  });
  assert.deepEqual(await send(body),{status:200,body:{matches:true,remember:true}});
  assert.deepEqual(await send({...body,accountId:'caller'}),{status:400,body:{code:'INVALID_ACCOUNT_BODY'}});
});
