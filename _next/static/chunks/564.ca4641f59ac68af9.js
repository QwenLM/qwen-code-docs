"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[564],{40248:function(e,t,a){function i(e,t){e.accDescr&&t.setAccDescription?.(e.accDescr),e.accTitle&&t.setAccTitle?.(e.accTitle),e.title&&t.setDiagramTitle?.(e.title)}a.d(t,{A:function(){return i}}),(0,a(39216).eW)(i,"populateCommonDb")},60564:function(e,t,a){a.d(t,{diagram:function(){return C}});var i=a(40248),l=a(48588),r=a(24339),n=a(39216),s=a(54327),c=a(84370),o=n.vZ.pie,p={sections:new Map,showData:!1,config:o},d=p.sections,u=p.showData,g=structuredClone(o),f=(0,n.eW)(()=>structuredClone(g),"getConfig"),h=(0,n.eW)(()=>{d=new Map,u=p.showData,(0,n.ZH)()},"clear"),x=(0,n.eW)(({label:e,value:t})=>{if(t<0)throw Error(`"${e}" has invalid value: ${t}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);d.has(e)||(d.set(e,t),n.cM.debug(`added new section: ${e}, with value: ${t}`))},"addSection"),m=(0,n.eW)(()=>d,"getSections"),w=(0,n.eW)(e=>{u=e},"setShowData"),$=(0,n.eW)(()=>u,"getShowData"),S={getConfig:f,clear:h,setDiagramTitle:n.g2,getDiagramTitle:n.Kr,setAccTitle:n.GN,getAccTitle:n.eu,setAccDescription:n.U$,getAccDescription:n.Mx,addSection:x,getSections:m,setShowData:w,getShowData:$},T=(0,n.eW)((e,t)=>{(0,i.A)(e,t),t.setShowData(e.showData),e.sections.map(t.addSection)},"populateDb"),v={parse:(0,n.eW)(async e=>{let t=await (0,s.Qc)("pie",e);n.cM.debug(t),T(t,S)},"parse")},y=(0,n.eW)(e=>`
  .pieCircle{
    stroke: ${e.pieStrokeColor};
    stroke-width : ${e.pieStrokeWidth};
    opacity : ${e.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${e.pieOuterStrokeColor};
    stroke-width: ${e.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${e.pieTitleTextSize};
    fill: ${e.pieTitleTextColor};
    font-family: ${e.fontFamily};
  }
  .slice {
    font-family: ${e.fontFamily};
    fill: ${e.pieSectionTextColor};
    font-size:${e.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${e.pieLegendTextColor};
    font-family: ${e.fontFamily};
    font-size: ${e.pieLegendTextSize};
  }
`,"getStyles"),D=(0,n.eW)(e=>{let t=[...e.values()].reduce((e,t)=>e+t,0),a=[...e.entries()].map(([e,t])=>({label:e,value:t})).filter(e=>e.value/t*100>=1).sort((e,t)=>t.value-e.value);return(0,c.ve8)().value(e=>e.value)(a)},"createPieArcs"),C={parser:v,db:S,renderer:{draw:(0,n.eW)((e,t,a,i)=>{n.cM.debug("rendering pie chart\n"+e);let s=i.db,o=(0,n.nV)(),p=(0,l.Rb)(s.getConfig(),o.pie),d=(0,r.P)(t),u=d.append("g");u.attr("transform","translate(225,225)");let{themeVariables:g}=o,[f]=(0,l.VG)(g.pieOuterStrokeWidth);f??=2;let h=p.textPosition,x=(0,c.Nb1)().innerRadius(0).outerRadius(185),m=(0,c.Nb1)().innerRadius(185*h).outerRadius(185*h);u.append("circle").attr("cx",0).attr("cy",0).attr("r",185+f/2).attr("class","pieOuterCircle");let w=s.getSections(),$=D(w),S=[g.pie1,g.pie2,g.pie3,g.pie4,g.pie5,g.pie6,g.pie7,g.pie8,g.pie9,g.pie10,g.pie11,g.pie12],T=0;w.forEach(e=>{T+=e});let v=$.filter(e=>"0"!==(e.data.value/T*100).toFixed(0)),y=(0,c.PKp)(S);u.selectAll("mySlices").data(v).enter().append("path").attr("d",x).attr("fill",e=>y(e.data.label)).attr("class","pieCircle"),u.selectAll("mySlices").data(v).enter().append("text").text(e=>(e.data.value/T*100).toFixed(0)+"%").attr("transform",e=>"translate("+m.centroid(e)+")").style("text-anchor","middle").attr("class","slice"),u.append("text").text(s.getDiagramTitle()).attr("x",0).attr("y",-200).attr("class","pieTitleText");let C=[...w.entries()].map(([e,t])=>({label:e,value:t})),b=u.selectAll(".legend").data(C).enter().append("g").attr("class","legend").attr("transform",(e,t)=>"translate(216,"+(22*t-22*C.length/2)+")");b.append("rect").attr("width",18).attr("height",18).style("fill",e=>y(e.label)).style("stroke",e=>y(e.label)),b.append("text").attr("x",22).attr("y",14).text(e=>s.getShowData()?`${e.label} [${e.value}]`:e.label);let W=512+Math.max(...b.selectAll("text").nodes().map(e=>e?.getBoundingClientRect().width??0));d.attr("viewBox",`0 0 ${W} 450`),(0,n.v2)(d,450,W,p.useMaxWidth)},"draw")},styles:y}}}]);