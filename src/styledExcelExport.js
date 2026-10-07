// Loaded only when Export Excel is clicked; does not affect roster boot or persistence.
let loader;
function getExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!loader) loader = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    script.onload=()=>window.ExcelJS?resolve(window.ExcelJS):reject(new Error('ExcelJS unavailable'));
    script.onerror=()=>reject(new Error('Unable to load Excel formatting library'));
    document.head.appendChild(script);
  }).catch(err=>{loader=null;throw err;});
  return loader;
}
const rgb = value => (value||'#111827').replace('#','').toUpperCase();
const contrast = hex => {
  const c=rgb(hex); const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);
  return .299*r+.587*g+.114*b>160?'172033':'FFFFFF';
};
export async function writeStyledRoster(sheets, filename, teamNames, teamColors) {
  const ExcelJS=await getExcelJS();
  const book=new ExcelJS.Workbook();
  book.creator='Shinny of Champions';
  book.created=new Date();
  const teams=[teamNames.team1,teamNames.team2];
  const colors=[rgb(teamColors.team1),rgb(teamColors.team2)];
  for(const {name,rows,widths} of sheets) {
    const ws=book.addWorksheet(name,{views:[{state:'frozen',ySplit:2}]});
    ws.columns=widths.map(w=>({width:w+3}));
    rows.forEach((row,i)=>{
      const r=ws.addRow(row);
      r.height=i===0?34:i===1?29:23;
      r.alignment={vertical:'middle',wrapText:i>1};
      r.eachCell({includeEmpty:true},(cell,col)=>{
        cell.font={name:'Aptos',size:i===0?16:i===1?11:10,bold:i<2,color:{argb:i<2?'FFFFFFFF':'FF243247'}};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i===0?'FF151A23':i===1?'FF9F1D25':i%2===0?'FFF4F6F9':'FFFFFFFF'}};
        cell.border={bottom:{style:'hair',color:{argb:'FFE2E6EC'}}};
        cell.alignment={vertical:'middle',wrapText:true};
        if(i>1&&col===1&&name!=='Team Summary') {
          const teamIndex=teams.indexOf(String(cell.value||''));
          if(teamIndex>=0){
            cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+colors[teamIndex]}};
            cell.font={name:'Aptos',size:10,bold:true,color:{argb:'FF'+contrast(colors[teamIndex])}};
          }
        }
      });
    });
    if(rows[0]?.length===1&&widths.length>1) ws.mergeCells(1,1,1,widths.length);
    ws.getRow(1).font={name:'Aptos Display',size:16,bold:true,color:{argb:'FFFFFFFF'}};
    ws.pageSetup={paperSize:9,orientation:widths.length>5?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};
    ws.headerFooter.oddFooter='Shinny of Champions  •  Page &P of &N';
    ws.properties.defaultRowHeight=23;
    if(name==='Public Teams') {
      ws.printTitlesRow='1:2';
      ws.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,rows.length),column:widths.length}};
    } else if(name==='Admin Roster'||name==='Jersey Pull List') {
      ws.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,rows.length),column:widths.length}};
    }
    if(name==='Team Summary') {
      [3,4].forEach(col=>{
        if(col<=widths.length) ws.getColumn(col).alignment={vertical:'middle',wrapText:true};
      });
      [3,4,5,6,7,8].forEach(i=>{ if(ws.getRow(i)) ws.getRow(i).height=28; });
      if(ws.getRow(9)) ws.getRow(9).height=48;
    }
  }
  const buffer=await book.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
