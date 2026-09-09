// Manage
document.getElementById('btnPinGo').addEventListener('click',checkPin);
document.getElementById('pinInput').addEventListener('keydown',(e)=>{ if(e.key==='Enter') checkPin(); });

function checkPin(){
  const v = document.getElementById('pinInput').value;
  if(v===managerPin){
    document.getElementById('pinGate').style.display='none';
    document.getElementById('manageContent').style.display='block';
    renderManage();
  }else{
    document.getElementById('pinInput').value='';
    document.getElementById('pinInput').placeholder='Wrong PIN';
    setTimeout(()=>{ document.getElementById('pinInput').placeholder='••••'; }, 2000);
  }
}

document.getElementById('btnLock').addEventListener('click',()=>{
  document.getElementById('pinGate').style.display='block';
  document.getElementById('manageContent').style.display='none';
  document.getElementById('pinInput').value='';
});
