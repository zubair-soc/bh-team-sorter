// Loaded only when Export Excel is clicked; isolated from roster boot/persistence.
let loader;
function getExcelJS(){
  if(window.ExcelJS)return Promise.resolve(window.ExcelJS);
  if(!loader)loader=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload=()=>window.ExcelJS?resolve(window.ExcelJS):reject(new Error('ExcelJS unavailable'));
    s.onerror=()=>reject(new Error('Unable to load Excel formatting library'));document.head.appendChild(s);
  }).catch(e=>{loader=null;throw e;});
  return loader;
}
const rgb=v=>(v||'#111827').replace('#','').toUpperCase();
const textColor=hex=>{const c=rgb(hex),r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);return .299*r+.587*g+.114*b>165?'172033':'FFFFFF';};
const fill=(cell,color)=>cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+color}};
const border={bottom:{style:'hair',color:{argb:'FFD9DEE6'}}};
export async function writeStyledRoster(sheets,filename,teamNames,teamColors){
  const ExcelJS=await getExcelJS(),book=new ExcelJS.Workbook();book.creator='Shinny of Champions';
  for(const sheet of sheets){
    const ws=book.addWorksheet(sheet.name,{views:[{state:'frozen',ySplit:sheet.kind==='team'?3:2}]});
    ws.columns=sheet.widths.map(width=>({width}));
    sheet.rows.forEach(row=>ws.addRow(row));
    ws.properties.defaultRowHeight=19;
    const maxCol=sheet.widths.length;

    if(sheet.kind==='team'){
      const color=rgb(teamColors[sheet.team]),fg=textColor(color);
      ws.mergeCells(1,1,1,maxCol);ws.mergeCells(2,1,2,maxCol);
      const title=ws.getRow(1),sub=ws.getRow(2),head=ws.getRow(3);
      title.height=30;sub.height=20;head.height=23;
      title.eachCell({includeEmpty:true},c=>{fill(c,color);c.font={name:'Aptos Display',size:16,bold:true,color:{argb:'FF'+fg}};c.alignment={vertical:'middle',horizontal:'left',indent:1};});
      sub.eachCell({includeEmpty:true},c=>{fill(c,color);c.font={name:'Aptos',size:9,italic:true,color:{argb:'FF'+fg}};c.alignment={vertical:'middle'};});
      head.eachCell({includeEmpty:true},c=>{fill(c,'E9EDF2');c.font={name:'Aptos',size:10,bold:true,color:{argb:'FF1F2937'}};c.border=border;c.alignment={vertical:'middle',horizontal:'left',indent:1};});
      for(let r=4;r<=ws.rowCount;r++){
        const row=ws.getRow(r);row.height=20;
        row.eachCell({includeEmpty:true},c=>{fill(c,r%2===0?'FFFFFF':'F7F8FA');c.font={name:'Aptos',size:10,color:{argb:'FF253247'}};c.border=border;c.alignment={vertical:'middle',horizontal:'left',indent:1};});
        if(String(row.getCell(3).value)==='Goalie'){row.eachCell({includeEmpty:true},c=>{fill(c,'FFF4D6');c.font={name:'Aptos',size:10,bold:true,color:{argb:'FF59420B'}};c.alignment={vertical:'middle',horizontal:'left',indent:1};});}
      }
      ws.autoFilter={from:{row:3,column:1},to:{row:Math.max(3,ws.rowCount),column:maxCol}};
      ws.printTitlesRow='1:3';ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.25,right:.25,top:.4,bottom:.4,header:.2,footer:.2}};
    } else {
      ws.mergeCells(1,1,1,maxCol);const title=ws.getRow(1);title.height=28;
      title.eachCell({includeEmpty:true},c=>{fill(c,'171B24');c.font={name:'Aptos Display',size:14,bold:true,color:{argb:'FFFFFFFF'}};c.alignment={vertical:'middle'};});
      const head=ws.getRow(2);head.height=22;head.eachCell({includeEmpty:true},c=>{fill(c,'E9EDF2');c.font={name:'Aptos',size:10,bold:true,color:{argb:'FF1F2937'}};c.border=border;});
      for(let r=3;r<=ws.rowCount;r++)ws.getRow(r).eachCell({includeEmpty:true},c=>{fill(c,r%2?'F7F8FA':'FFFFFF');c.font={name:'Aptos',size:10,color:{argb:'FF253247'}};c.border=border;});
      if(sheet.kind==='public'){
        ws.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,ws.rowCount),column:maxCol}};
        for(let r=3;r<=ws.rowCount;r++){
          const row=ws.getRow(r), team=String(row.getCell(1).value||'');
          const idx=team===teamNames.team1?0:team===teamNames.team2?1:-1;
          if(idx>=0){
            const color=rgb(idx===0?teamColors.team1:teamColors.team2),fg=textColor(color);
            const cell=row.getCell(1);fill(cell,color);cell.font={name:'Aptos',size:10,bold:true,color:{argb:'FF'+fg}};cell.border=border;
          }
        }
      }
      ws.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};
    }
    ws.headerFooter.oddFooter='Shinny of Champions  •  Page &P of &N';
  }
  const buffer=await book.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
