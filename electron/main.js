import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
let mainWindow

const outputDir = () => isDev
  ? path.resolve(process.cwd(), 'output')
  : path.join(app.getPath('documents'), 'Cerberus Store Builder', 'output')

function parseVersion(value = '0.0.0') {
  const normalized = String(value).trim().toLowerCase().replace(/-([a-z]+)\/(\d+)$/, '-$1-$2')
  const m = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)-(\d+))?$/)
  return m ? { major:+m[1], minor:+m[2], patch:+m[3], channel:m[4] ?? null, channelVersion:+(m[5] ?? 0) }
    : { major:0, minor:0, patch:0, channel:null, channelVersion:0 }
}
function nextVersion(currentVersion, requestedChannel, existingVersions = []) {
  const current = parseVersion(currentVersion)
  const base = `${current.major}.${current.minor}.${current.patch}`
  const existing = new Set(existingVersions.map(v => String(v).toLowerCase()))
  if (requestedChannel === 'public') {
    let patch = current.patch + 1
    while (existing.has(`${current.major}.${current.minor}.${patch}`)) patch++
    return `${current.major}.${current.minor}.${patch}`
  }
  let n = current.channel === requestedChannel ? current.channelVersion : 0
  for (const v of existingVersions) {
    const p = parseVersion(v)
    if (p.major===current.major && p.minor===current.minor && p.patch===current.patch && p.channel===requestedChannel) n = Math.max(n, p.channelVersion)
  }
  return `${base}-${requestedChannel}-${n + 1}`
}
function safeName(value='store') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'store'
}
async function jsonFiles() {
  const dir = outputDir(); await fs.mkdir(dir,{recursive:true})
  return (await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isFile() && e.name.toLowerCase().endsWith('.json'))
}
async function findLatest() {
  const dir=outputDir(), entries=await jsonFiles(), candidates=[]
  for (const e of entries) { const full=path.join(dir,e.name); const stat=await fs.stat(full); candidates.push({name:e.name,full,mtimeMs:stat.mtimeMs}) }
  candidates.sort((a,b)=>b.mtimeMs-a.mtimeMs)
  for (const c of candidates) { try { const store=JSON.parse(await fs.readFile(c.full,'utf8')); if(Array.isArray(store?.apps)) return {...c,store} } catch {} }
  return null
}
async function existingVersions() {
  const dir=outputDir(), versions=[]
  for (const e of await jsonFiles()) { try { const j=JSON.parse(await fs.readFile(path.join(dir,e.name),'utf8')); if(j?.version) versions.push(j.version) } catch {} }
  return versions
}
function validateStore(store) {
  const errors=[]
  if(!String(store?.name??'').trim()) errors.push('Store name is required.')
  if(!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)-\d+)?$/i.test(String(store?.version??''))) errors.push('Invalid store version.')
  if(!String(store?.author??'').trim()) errors.push('Store author is required.')
  if(!Array.isArray(store?.apps)) errors.push('apps must be an array.')
  const ids=new Set()
  for(const a of store?.apps??[]){
    if(!String(a.name??'').trim()) errors.push('Every app needs a name.')
    if(!a.id || !/^[a-z0-9][a-z0-9._-]*$/.test(a.id)) errors.push(`${a.name||'App'} has an invalid ID.`)
    if(ids.has(a.id)) errors.push(`Duplicate app ID: ${a.id}.`); ids.add(a.id)
  }
  return errors
}
async function importImage(urlValue) {
  let url; try { url=new URL(String(urlValue??'')) } catch { throw new Error('Enter a valid image URL.') }
  if(!['http:','https:'].includes(url.protocol)) throw new Error('Image URL must use http or https.')
  const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Cerberus-Store-Builder/1.0'}})
  if(!response.ok) throw new Error(`Image server returned HTTP ${response.status}.`)
  const type=String(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()
  if(!type.startsWith('image/')) throw new Error('That URL did not return an image.')
  const buffer=Buffer.from(await response.arrayBuffer())
  if(buffer.length>10*1024*1024) throw new Error('Remote logo images must be 10 MB or smaller.')
  return `data:${type};base64,${buffer.toString('base64')}`
}
function sendMenu(action){ mainWindow?.webContents.send('cerberus:menu-action',action) }
function buildMenu(){
  return Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'quit'}]}]:[]),
    {label:'File',submenu:[{label:'Load Last Save',accelerator:'CmdOrCtrl+O',click:()=>sendMenu('load')},{label:'Save Release',accelerator:'CmdOrCtrl+S',click:()=>sendMenu('save')},{type:'separator'},{label:'Open Output Folder',click:()=>shell.openPath(outputDir())},...(process.platform==='darwin'?[]:[{type:'separator'},{role:'quit'}])]},
    {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'reload'},...(isDev?[{role:'toggleDevTools'}]:[]),{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
  ])
}
function setTitlebarTheme(theme){
  if (!mainWindow || process.platform === 'darwin' || typeof mainWindow.setTitleBarOverlay !== 'function') return
  const light = theme === 'light'
  mainWindow.setTitleBarOverlay({
    color: light ? '#eef1f5' : '#11151c',
    symbolColor: light ? '#313846' : '#aeb7c7',
    height: 38,
  })
}
function createWindow(){
  mainWindow=new BrowserWindow({
    width:1440,height:900,minWidth:980,minHeight:650,backgroundColor:'#0f131a',
    title:'Cerberus Store Builder',
    titleBarStyle:process.platform==='darwin'?'hiddenInset':'hidden',
    titleBarOverlay:process.platform==='darwin'?false:{color:'#11151c',symbolColor:'#aeb7c7',height:38},
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}
  })
  if(isDev) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'))
}

app.whenReady().then(async()=>{
  await fs.mkdir(outputDir(),{recursive:true})
  Menu.setApplicationMenu(buildMenu())
  ipcMain.handle('cerberus:get-info',()=>({platform:process.platform,outputDir:outputDir(),version:app.getVersion()}))
  ipcMain.on('cerberus:set-titlebar-theme',(_event,theme)=>{if(theme==='light'||theme==='dark')setTitlebarTheme(theme)})
  ipcMain.handle('cerberus:open-output-folder',async()=>{await fs.mkdir(outputDir(),{recursive:true}); return shell.openPath(outputDir())})
  ipcMain.handle('cerberus:load-latest',async()=>{const latest=await findLatest(); if(!latest) return {ok:false,error:'No saved store JSON files found in the output folder.'}; return {ok:true,filename:latest.name,modified:new Date(latest.mtimeMs).toISOString(),store:latest.store}})
  ipcMain.handle('cerberus:import-image',async(_e,url)=>{try{return {ok:true,dataUrl:await importImage(url)}}catch(err){return {ok:false,error:err.message}}})
  ipcMain.handle('cerberus:save-release',async(_e,{store,channel})=>{
    try{
      const errors=validateStore(store); if(errors.length)return {ok:false,error:errors[0],errors}
      if(!['alpha','beta','public'].includes(channel))return {ok:false,error:'Release channel must be alpha, beta, or public.'}
      const version=nextVersion(store.version,channel,await existingVersions())
      const release={...store,version}
      const filename=`${safeName(release.name)}-${version}.json`
      const full=path.join(outputDir(),filename)
      try{await fs.access(full);return {ok:false,error:`${filename} already exists.`}}catch{}
      await fs.writeFile(full,JSON.stringify(release),'utf8')
      return {ok:true,version,filename,path:full}
    }catch(err){return {ok:false,error:err.message}}
  })
  createWindow()
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})
})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})
