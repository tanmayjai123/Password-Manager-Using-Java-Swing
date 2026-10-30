'use strict';
const $ = id => document.getElementById(id);
const STORAGE = 'keyspace.Password-Manager-Using-Java-Swing.v1';
const ITERATIONS = 600000;
let key = null, salt = null, entries = [], editing = null, pendingBackup = null, busy = false, timer, lockRequested = false, revision = null;
const encode = new TextEncoder(), decode = new TextDecoder('utf-8', {fatal:true});
const b64 = bytes => { const array=new Uint8Array(bytes); let text=''; for(let i=0;i<array.length;i+=8192) text+=String.fromCharCode(...array.subarray(i,i+8192)); return btoa(text); };
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
function status(message) { $('status').textContent = message; }
function stored() { return localStorage.getItem(STORAGE); }
function validateEnvelope(value) {
 if (!value || value.version !== 1 || value.iterations !== ITERATIONS || typeof value.salt !== 'string' || typeof value.iv !== 'string' || typeof value.data !== 'string' || value.data.length > 1400000) throw new Error('Unsupported backup format.');
 if (unb64(value.salt).length !== 16 || unb64(value.iv).length !== 12 || unb64(value.data).length < 16) throw new Error('Invalid encrypted backup.');
 return value;
}
function validateEntries(list) {
 if (!Array.isArray(list) || list.length > 1000) throw new Error('Invalid vault contents.');
 const ids = new Set();
 for (const e of list) {
  if (!e || typeof e.id !== 'string' || e.id.length > 100 || ids.has(e.id)) throw new Error('Invalid login ID.');
  ids.add(e.id);
  for (const [field,max] of [['service',120],['username',240],['password',1024],['notes',2000]]) if (typeof e[field] !== 'string' || e[field].length > max) throw new Error('Invalid login contents.');
 }
 return list;
}
async function derive(password, s) {
 const material = await crypto.subtle.importKey('raw',encode.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:s,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function decryptVault(envelope,k) {
 const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv)},k,unb64(envelope.data));
 return validateEntries(JSON.parse(decode.decode(plain)));
}
async function persist(next) {
 const iv = crypto.getRandomValues(new Uint8Array(12));
 const data = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encode.encode(JSON.stringify(next)));
 const envelope = {version:1,iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),data:b64(data)};
 if(stored() !== revision) { lockRequested=true; throw new Error('Vault changed in another tab. Unlock again before saving.'); }
 const serialized=JSON.stringify(envelope); localStorage.setItem(STORAGE,serialized); revision=serialized;
 entries = next;
}
function gate() {
 const exists = !!stored() || !!pendingBackup;
 $('gate-title').textContent = pendingBackup ? 'Unlock your backup' : exists ? 'Welcome back' : 'Create your private vault';
 $('gate-copy').textContent = exists ? 'Enter the master password for this vault. Forgotten master passwords cannot be recovered.' : 'Choose a master password with at least 12 characters. It cannot be recovered if you forget it.';
 $('confirm-wrap').hidden = exists; $('confirm').required = !exists;
 $('master').autocomplete = exists ? 'current-password' : 'new-password';
 $('unlock').textContent = pendingBackup ? 'Unlock and restore backup' : exists ? 'Unlock vault' : 'Create vault';
}
function touch() { clearTimeout(timer); if(lockRequested && !busy) {lockVault();return;} if(key) timer = setTimeout(lockVault,lockRequested ? 1000 : 300000); }
function lockVault() {
 if(busy) { lockRequested=true; timer = setTimeout(lockVault,1000); return; }
 lockRequested=false; revision=null;
 clearTimeout(timer); key=null; salt=null; entries=[]; editing=null; pendingBackup=null;
 $('editor').close(); $('entry-form').reset(); $('entries').replaceChildren(); $('search').value=''; $('unlock-form').reset();
 $('vault').hidden=true; $('gate').hidden=false; $('lock').hidden=true; gate(); status('Vault locked.');
}
$('unlock-form').addEventListener('submit', async event => {
 event.preventDefault(); if(busy) return; busy=true; $('unlock').disabled=true;
 let password = $('master').value;
 try {
  revision=stored();
  const raw = pendingBackup || (revision ? validateEnvelope(JSON.parse(revision)) : null);
  if(!raw && (password.length < 12 || password !== $('confirm').value)) throw new Error('Use at least 12 characters and make sure both passwords match.');
  const s = raw ? unb64(raw.salt) : crypto.getRandomValues(new Uint8Array(16));
  const k = await derive(password,s);
  let loaded=[];
  if(raw) { try { loaded=await decryptVault(raw,k); } catch { throw new Error('Could not unlock: wrong master password or damaged vault.'); } }
  if(stored()!==revision) throw new Error('Vault changed in another tab. Please try again.');
  if(pendingBackup) { revision=JSON.stringify(pendingBackup); localStorage.setItem(STORAGE,revision); }
  key=k; salt=s; entries=loaded;
  if(!raw) await persist([]);
  pendingBackup=null; $('unlock-form').reset(); $('gate').hidden=true; $('vault').hidden=false; $('lock').hidden=false;
  render(); touch(); status('Vault unlocked. Your data stays on this device.');
 } catch(error) { key=null; salt=null; entries=[]; status(error.message || 'Could not open vault. Browser storage may be unavailable.'); }
 finally { password=''; $('master').value=''; $('confirm').value=''; busy=false; $('unlock').disabled=false; touch(); }
});
function render() {
 const query=$('search').value.toLowerCase(); $('count').textContent=entries.length;
 const root=$('entries'); root.replaceChildren();
 const visible=entries.filter(e => (e.service+' '+e.username).toLowerCase().includes(query));
 if(!visible.length) { const p=document.createElement('p'); p.className='empty'; p.textContent=entries.length ? 'No matching logins.' : 'A fresh start. Add your first sample login.'; root.append(p); return; }
 for(const e of visible) {
  const card=document.createElement('article'); card.className='card';
  const avatar=document.createElement('div'); avatar.className='avatar'; avatar.textContent=e.service.slice(0,1).toUpperCase();
  const title=document.createElement('h3'); title.textContent=e.service;
  const user=document.createElement('p'); user.textContent=e.username;
  const actions=document.createElement('div'); actions.className='actions';
  for(const [label,fn] of [['Copy password',()=>copyPassword(e.password)],['Edit',()=>openEditor(e)],['Delete',()=>deleteEntry(e)]]) {
   const button=document.createElement('button'); button.className='secondary'; button.textContent=label; button.addEventListener('click',fn); actions.append(button);
  }
  card.append(avatar,title,user,actions); root.append(card);
 }
}
async function copyPassword(password) { try { await navigator.clipboard.writeText(password); status('Password copied. Your clipboard may retain it; clear it after use.'); } catch { status('Clipboard access was denied. Open Edit and use Show to copy manually.'); } }
function openEditor(entry) {
 if(!key || busy) return; editing=entry ? entry.id : null; $('entry-form').reset(); $('password').type='password'; $('reveal').textContent='Show';
 $('editor-title').textContent=entry ? 'Edit login' : 'Add a login';
 for(const name of ['service','username','password','notes']) $(name).value=entry ? entry[name] : '';
 $('length-value').value='20'; strength(); $('editor').showModal(); $('service').focus();
}
$('entry-form').addEventListener('submit',async event => {
 event.preventDefault(); if(!key || busy) return; busy=true; $('save').disabled=true;
 try {
  const item={id:editing || crypto.randomUUID(),service:$('service').value.trim(),username:$('username').value.trim(),password:$('password').value,notes:$('notes').value};
  if(!item.service || !item.username) throw new Error('Enter an app name and username.');
  const next=editing ? entries.map(e=>e.id===editing ? item : e) : [...entries,item];
  validateEntries(next); await persist(next); render(); $('editor').close(); $('entry-form').reset(); status('Login saved encrypted.');
 } catch(error) { status('Could not save: '+error.message); } finally {busy=false; $('save').disabled=false; touch();}
});
async function deleteEntry(entry) {
 if(busy || !key || !confirm('Delete the saved login for '+entry.service+'? This cannot be undone.')) return;
 busy=true; try {await persist(entries.filter(e=>e.id!==entry.id)); render(); status('Login deleted.');} catch {status('Could not save changes. Your login was not deleted.');} finally {busy=false;touch();}
}
function randomIndex(n) { const max=4294967296 - (4294967296 % n); const a=new Uint32Array(1); do{crypto.getRandomValues(a);}while(a[0]>=max); return a[0]%n; }
function generate() {
 const groups=['ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz','0123456789','!@#$%^&*()-_=+[]{}:,.?']; const all=groups.join('');
 const chars=groups.map(g=>g[randomIndex(g.length)]); const length=Number($('length').value);
 while(chars.length<length) chars.push(all[randomIndex(all.length)]);
 for(let i=chars.length-1;i>0;i--){const j=randomIndex(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
 $('password').value=chars.join('');strength();
}
function strength() {
 const p=$('password').value; const kinds=[/[A-Z]/,/[a-z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(r=>r.test(p)).length;
 const label=p.length>=16 && kinds>=3 ? 'Strong' : p.length>=12 && kinds>=3 ? 'Moderate' : 'Weak';
 $('strength').textContent=p ? label+' · '+p.length+' characters. Length/variety estimate only; avoid reused or predictable passwords.' : 'Enter a password to check its strength.';
}
$('export').addEventListener('click',()=>{
 try { const content=stored(); if(!content || !key || busy) return; const blob=new Blob([content],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download='keyspace-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); status('Encrypted backup exported. Keep it and your master password safe.'); } catch {status('Could not export backup.');}
});
async function importBackup(event) {
 const file=event.target.files[0]; if(!file || busy) return; busy=true;
 try {
  if(file.size>2000000) throw new Error('Backup must be under 2 MB.');
  const envelope=validateEnvelope(JSON.parse(await file.text()));
  if(key) {
   const testKey=await deriveForImport(envelope);
   const loaded=await decryptVault(envelope,testKey);
   if(!confirm('Replace this vault with the backup? Export your current vault first if you need to keep it. The backup must use the same master password.')) return;
   if(stored()!==revision) {lockRequested=true;throw new Error('Vault changed in another tab. Unlock again.');}
   revision=JSON.stringify(envelope); localStorage.setItem(STORAGE,revision); entries=loaded; salt=unb64(envelope.salt); key=testKey; render(); status('Encrypted backup restored.');
  } else {
   if(stored() && !confirm('Restore a backup instead of the existing vault? The existing vault is replaced only after a successful unlock. Export it first if needed.')) return;
   pendingBackup=envelope; gate(); $('master').focus(); status('Enter the master password used to create this backup.');
  }
 } catch(error) { status('Import failed: '+(error.name==='OperationError' ? 'This backup uses a different master password or is damaged. Lock the vault, then restore it with its own password.' : error.message)); }
 finally {busy=false; event.target.value='';touch();}
}
async function deriveForImport(envelope) {
 // An unlocked CryptoKey cannot re-derive a different salt without the password.
 if(b64(salt)!==envelope.salt) throw new Error('This backup belongs to another vault. Lock the vault, then use Restore an encrypted backup.');
 return key;
}
$('restore-locked').addEventListener('change',importBackup); $('import').addEventListener('change',importBackup);
$('lock').addEventListener('click',lockVault); $('search').addEventListener('input',render); $('add').addEventListener('click',()=>openEditor(null));
$('cancel').addEventListener('click',()=>{$('editor').close();$('entry-form').reset();}); $('editor').addEventListener('close',()=>{$('entry-form').reset();editing=null;});
$('generate').addEventListener('click',generate); $('password').addEventListener('input',strength);
$('length').addEventListener('input',()=>{$('length-value').value=$('length').value;});
$('reveal').addEventListener('click',()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('reveal').textContent=show?'Hide':'Show';});
for(const name of ['pointerdown','keydown','input']) document.addEventListener(name,touch,{passive:true});
window.addEventListener('storage',event=>{if(event.key===STORAGE || event.key===null){lockVault();status('Vault storage changed in another tab. Unlock again before continuing.');}});
try {if(!window.isSecureContext || !crypto.subtle) throw new Error('This app requires HTTPS or localhost.'); gate();} catch(error){status(error.message);$('unlock').disabled=true;}
