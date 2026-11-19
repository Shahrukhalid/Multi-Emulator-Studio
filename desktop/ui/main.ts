declare const window: Window & { __TAURI__: { core: { invoke<T=unknown>(name:string,args?:Record<string,unknown>):Promise<T> } } };
const invoke=window.__TAURI__.core.invoke;
export {};
type Request={action:string;[key:string]:unknown};
type Device={id:string;spec:{name:string;image:string}};
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id)! as T;
const val=(id:string)=>el<HTMLInputElement>(id).value;
const num=(id:string)=>Number(val(id));
const out=el('out');
const dispatch=<T>(request:Request)=>invoke<T>('dispatch',{request});
async function action(fn:()=>Promise<unknown>){
  try{out.textContent=JSON.stringify(await fn(),null,2)??'OK';}
  catch(e){out.textContent=JSON.stringify(e,null,2);}
}
const bind=(id:string,fn:()=>Promise<unknown>)=>el(id).addEventListener('click',()=>void action(fn));
async function images(){const xs=await dispatch<string[]>({action:'images'});const s=el<HTMLSelectElement>('image');s.replaceChildren();for(const x of xs){const o=document.createElement('option');o.textContent=x;o.value=x;s.append(o);}return xs;}
async function list(){const ds=await dispatch<Device[]>({action:'list'});const box=el('devices');box.replaceChildren();for(const d of ds){const row=document.createElement('div');row.className='device';const title=document.createElement('strong');title.textContent=d.spec.name+' · '+d.spec.image;row.append(title);for(const cmd of ['start','stop','restart','status','logs','clone_profile','install_apk','delete']){const b=document.createElement('button');b.textContent=cmd.replaceAll('_',' ');b.onclick=()=>void action(async()=>{if(cmd==='delete'&&!confirm('Delete this device and all its data?'))return;const r:Request={action:cmd,id:d.id};if(cmd==='clone_profile')r.name=d.spec.name+' copy';if(cmd==='install_apk')r.path=val('apk');const result=await dispatch(r);await list();return result;});row.append(b);}box.append(row);}return ds;}
bind('connect',async()=>{await invoke('connect',{root:val('root'),sdkRoot:val('sdk')||null});await images();return list();});
bind('images',images);bind('host',()=>dispatch({action:'host'}));bind('list',list);
let connected=false;
el('connect').addEventListener('click',()=>{connected=true;});
// Health and admission ticks are serialized in the Rust controller.
let polling=false;
setInterval(async()=>{if(!connected||polling)return;polling=true;try{await dispatch({action:'tick'});}catch{}finally{polling=false;}},5000);
bind('create',async()=>{const d=await dispatch({action:'create',spec:{name:val('name'),image:val('image'),hardware_profile:val('hardware'),ram_mb:num('ram'),cores:num('cores'),width:num('width'),height:num('height'),disk_mb:num('disk'),locale:val('locale')}});await list();return d;});
invoke<string>('default_data_dir').then(p=>{el<HTMLInputElement>('root').value=p;}).catch(e=>{out.textContent=String(e);});
