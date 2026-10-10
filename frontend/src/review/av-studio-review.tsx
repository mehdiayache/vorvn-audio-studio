import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {GlobalPlayerProvider} from '@/components/global-player-provider';
import {ProductReadinessProvider} from '@/components/product-readiness';
import {TooltipProvider} from '@/components/ui/tooltip';
import {AudiovisualProductionPage} from '@/features/productions/audiovisual/audiovisual-production-page';
import type {Production,SoundScene,VisualScene} from '@/types/domain';
import '@fontsource-variable/inter';
import '@/styles/base.css';
import '@/styles/studio-deck.css';

// This isolated entry never contacts the old backend. In particular, generation,
// upload, exports and persistence requests cannot reach an API or provider.
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const request=input instanceof Request?input:null;
 const url=new URL(request?.url ?? String(input),location.href);
 const method=(init?.method ?? request?.method ?? 'GET').toUpperCase();
 if(method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api')||url.pathname.startsWith('/audio')||url.pathname.startsWith('/download'))return new Response(JSON.stringify({detail:'Local comparison only: backend and persistence are disabled.'}),{status:503,headers:{'Content-Type':'application/json'}});
 return originalFetch(input,init);
};
const parts:Production['parts']=[
 {id:1,public_id:'review-opening',created_at:'2026-10-11',position:0,enabled:true,kind:'draft',title:'Opening',authored_role:'Narrator',text:'A quiet morning. The first light reaches the mountains.',cost:0},
 {id:2,public_id:'review-pause',created_at:'2026-10-11',position:1,enabled:true,kind:'silence',title:'Pause',text:'',duration_ms:1500,cost:0},
 {id:3,public_id:'review-dialogue',created_at:'2026-10-11',position:2,enabled:true,kind:'draft',title:'Dialogue',authored_role:'Guide',text:'Take your time. There is more to hear along the way.',cost:0},
 {id:4,public_id:'review-disabled',created_at:'2026-10-11',position:3,enabled:false,kind:'draft',title:'Alternate take',authored_role:'Narrator',text:'This optional line is disabled.',cost:0},
];
const production:Production={id:1,public_id:'local-comparison',production_type:'audiovisual',name:'Original Studio comparison',description:'Isolated in-memory sample',status:'draft',workspace_id:1,project_id:null,settings:{},parts,exports:[],total_cost:0,current_sequence_cost:0,accounting:{historical_spend:0,current_sequence_cost:0,retained_generation_cost:0,tracked_spend:0},total_bytes:0};
const mix={muted:false,gain:1,fade_in_ms:0,fade_out_ms:0,effects:[]};
const track={id:'review-audio-track',kind:'audio' as const,role:'ambience' as const,name:'Ambience · unavailable sample source',volume:1,muted:false,clips:[{id:'review-audio-clip',file_id:99,duration_ms:1500,source_offset_ms:0,gain:.4,fade_in_ms:0,fade_out_ms:0,loop:false,ducking:false,muted:false,locked:false,effects:[],anchor:{kind:'absolute' as const,position_ms:0},file_name:'Illustrative placement (no source media)',missing:true,resolved_start_ms:0,resolved_duration_ms:1500}]};
const soundScene:SoundScene={production_id:1,revision:1,document:{version:1,sequence_overrides:{},tracks:[track]},can_undo:false,can_redo:false,updated_at:'2026-10-11',resolved:{version:1,signature:'review',duration_ms:1500,sequence_projection:{signature:'review',duration_ms:1500,sample_rate:48000,spans:[{part_id:2,part_public_id:'review-pause',position:1,kind:'silence',title:'Pause',role:'',voice_name:'',filename:'',start_ms:0,duration_ms:1500,silence:true,missing:false,mix}]},tracks:[track],orphans:[]},sequence_stem:{url:'',filename:'',duration_ms:1500,signature:'review',cached:false}};
const visualScene:VisualScene={production_id:1,revision:1,document:{version:1,canvas:{width:1920,height:1080},tracks:[]},updated_at:'2026-10-11'};
const resources={folders:[],files:[],productionFileIds:[],libraryFileIds:[]};
createRoot(document.getElementById('root')!).render(<MemoryRouter><TooltipProvider><ProductReadinessProvider><GlobalPlayerProvider>
 <div role="note" style={{padding:'10px 18px',background:'#fff2ca',color:'#483b12',fontSize:13}}>Original Audio Visual Studio · local in-memory comparison sample. No backend, persistence, generation or export. Script drafts and a real 1.5-second pause; the illustrative audio placement has no source media.</div>
 <AudiovisualProductionPage production={production} project={null} soundScene={soundScene} visualScene={visualScene} {...resources} fileState={{status:'ready',data:resources}} config={null} directory={{config:null,cloned:[],meta:{},catalog:[]}} refresh={async()=>{}} refreshFiles={async()=>{}}/>
 </GlobalPlayerProvider></ProductReadinessProvider></TooltipProvider></MemoryRouter>);
