import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ticker    = searchParams.get('ticker')  || 'IDEA';
  const name      = searchParams.get('name')    || 'アイデア';
  const holder    = searchParams.get('holder')  || 'ユーザー';
  const votes     = searchParams.get('votes')   || '1票目';
  const date      = searchParams.get('date')    || new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const serial    = 'AI-' + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0');
  const nameShort = name.length > 22 ? name.slice(0, 22) + '\u2026' : name;

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: { width:'1200px', height:'630px', background:'#f0ebe1', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' },
        children: {
          type: 'div',
          props: {
            style: { width:'900px', height:'440px', background:'#faf8f4', borderRadius:'20px', border:'1.5px solid #e0d8cc', display:'flex', overflow:'hidden' },
            children: [
              {
                type: 'div',
                props: {
                  style: { flex:1, padding:'48px 52px', display:'flex', flexDirection:'column', justifyContent:'space-between' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display:'flex', flexDirection:'column' },
                        children: [
                          { type:'div', props:{ style:{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'28px' }, children:[
                            { type:'div', props:{ style:{ width:'36px', height:'36px', background:'#1a1400', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center' }, children:{ type:'span', props:{ style:{ color:'#f59e0b', fontSize:'20px', fontWeight:'700' }, children:'\u2197' } } } },
                            { type:'span', props:{ style:{ fontSize:'22px', fontWeight:'700', color:'#1a1400', letterSpacing:'-0.03em' }, children:'\u3042\u3044\u307d' } }
                          ] } },
                          { type:'div', props:{ style:{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'28px' }, children:[
                            { type:'div', props:{ style:{ flex:1, height:'1px', background:'#c8bfae' } } },
                            { type:'span', props:{ style:{ fontSize:'11px', color:'#a09080', letterSpacing:'0.14em' }, children:'INVESTMENT CERTIFICATE' } },
                            { type:'div', props:{ style:{ flex:1, height:'1px', background:'#c8bfae' } } }
                          ] } },
                          { type:'div', props:{ style:{ display:'flex', gap:'28px', marginBottom:'24px' }, children:[
                            { type:'div', props:{ style:{ display:'flex', flexDirection:'column' }, children:[
                              { type:'span', props:{ style:{ fontSize:'11px', color:'#a09080', letterSpacing:'0.1em', marginBottom:'4px' }, children:'DATE' } },
                              { type:'span', props:{ style:{ fontSize:'20px', fontWeight:'700', color:'#1a1400' }, children: date } }
                            ] } },
                            { type:'div', props:{ style:{ flex:1, display:'flex', flexDirection:'column' }, children:[
                              { type:'span', props:{ style:{ fontSize:'11px', color:'#a09080', letterSpacing:'0.1em', marginBottom:'4px' }, children:'IDEA' } },
                              { type:'span', props:{ style:{ fontSize:'20px', fontWeight:'700', color:'#1a1400', lineHeight:'1.3' }, children: nameShort } }
                            ] } }
                          ] } },
                          { type:'div', props:{ style:{ display:'flex', gap:'24px', alignItems:'center' }, children:[
                            { type:'div', props:{ style:{ display:'flex', flexDirection:'column' }, children:[
                              { type:'span', props:{ style:{ fontSize:'11px', color:'#a09080', letterSpacing:'0.1em', marginBottom:'4px' }, children:'TICKER' } },
                              { type:'span', props:{ style:{ fontSize:'24px', fontWeight:'500', color:'#1a1400', letterSpacing:'0.06em', fontFamily:'monospace' }, children: ticker } }
                            ] } },
                            { type:'div', props:{ style:{ width:'1px', height:'36px', background:'#d4c9b8' } } },
                            { type:'div', props:{ style:{ display:'flex', flexDirection:'column' }, children:[
                              { type:'span', props:{ style:{ fontSize:'11px', color:'#a09080', letterSpacing:'0.1em', marginBottom:'4px' }, children:'HOLDER' } },
                              { type:'span', props:{ style:{ fontSize:'20px', fontWeight:'500', color:'#1a1400', fontFamily:'monospace' }, children: '@' + holder } }
                            ] } },
                            { type:'div', props:{ style:{ width:'1px', height:'36px', background:'#d4c9b8' } } },
                            { type:'div', props:{ style:{ display:'flex', flexDirection:'column' }, children:[
                              { type:'span', props:{ style:{ fontSize:'11px', color:'#a09080', letterSpacing:'0.1em', marginBottom:'4px' }, children:'VOTES AT TIME' } },
                              { type:'span', props:{ style:{ fontSize:'20px', fontWeight:'500', color:'#1a1400', fontFamily:'monospace' }, children: votes } }
                            ] } }
                          ] } }
                        ]
                      }
                    },
                    { type:'div', props:{ style:{ display:'flex', alignItems:'center', gap:'6px', background:'#fef9f0', border:'1px solid #fde68a', borderRadius:'4px', padding:'6px 14px', width:'fit-content' }, children:[
                      { type:'div', props:{ style:{ width:'6px', height:'6px', borderRadius:'50%', background:'#d97706' } } },
                      { type:'span', props:{ style:{ fontSize:'13px', color:'#854f0b', letterSpacing:'0.08em', fontFamily:'monospace' }, children:'EARLY INVESTOR' } }
                    ] } }
                  ]
                }
              },
              {
                type:'div',
                props:{
                  style:{ width:'160px', flexShrink:0, borderLeft:'2px dashed #d4c9b8', background:'#ede9e0', padding:'36px 24px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between' },
                  children:[
                    { type:'div', props:{ style:{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }, children:[
                      { type:'span', props:{ style:{ fontSize:'11px', color:'#a09080', letterSpacing:'0.1em' }, children:'SERIAL' } },
                      { type:'span', props:{ style:{ fontSize:'13px', fontWeight:'500', color:'#1a1400', background:'#e5ddd0', borderRadius:'4px', padding:'4px 10px', fontFamily:'monospace', letterSpacing:'0.04em' }, children: serial } }
                    ] } },
                    { type:'div', props:{ style:{ width:'80px', height:'80px', borderRadius:'50%', border:'3px solid #c0392b', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px' }, children:[
                      { type:'span', props:{ style:{ fontSize:'28px', color:'#c0392b' }, children:'\u2713' } },
                      { type:'span', props:{ style:{ fontSize:'10px', color:'#c0392b', letterSpacing:'0.08em', fontFamily:'monospace' }, children:'INVESTED' } }
                    ] } },
                    { type:'span', props:{ style:{ fontSize:'12px', color:'#a09080', letterSpacing:'0.1em' }, children:'\u3042\u3044\u307d' } }
                  ]
                }
              }
            ]
          }
        }
      }
    },
    { width: 1200, height: 630 }
  );
}
