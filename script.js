const ageGate=document.querySelector('#ageGate');
const cookie=document.querySelector('#cookie');
const joinPopup=document.querySelector('#joinPopup');
const body=document.body;
const memberIsActive=sessionStorage.getItem('jeazy-session-active')==='yes';
let ageConfirmedThisVisit=memberIsActive;

if(!memberIsActive){
  ageGate.classList.add('show');
  body.classList.add('locked');
}

const showJoinOffer=()=>{
  if(!ageConfirmedThisVisit||ageGate.classList.contains('show')||memberIsActive)return;
  joinPopup.classList.add('show');
  body.classList.add('locked');
};

document.querySelector('#ageYes').addEventListener('click',()=>{
  ageConfirmedThisVisit=true;
  localStorage.setItem('jeazy-age-confirmed-at',String(Date.now()));
  ageGate.classList.remove('show');
  body.classList.remove('locked');
  setTimeout(showJoinOffer,350);
});

document.querySelector('#ageNo').addEventListener('click',()=>{window.location.href='https://www.google.com'});

const closeJoin=()=>{
  joinPopup.classList.remove('show');
  body.classList.remove('locked');
  if(!localStorage.getItem('jeazy-cookie'))cookie.classList.add('show');
};

['joinClose','joinLater','joinCta'].forEach(id=>document.querySelector('#'+id).addEventListener('click',closeJoin));
['cookieAccept','cookieReject'].forEach(id=>document.querySelector('#'+id).addEventListener('click',()=>{
  localStorage.setItem('jeazy-cookie',id==='cookieAccept'?'all':'essential');
  cookie.classList.remove('show');
}));

const menu=document.querySelector('.menu');
const links=document.querySelector('#navLinks');
menu.addEventListener('click',()=>{
  const open=links.classList.toggle('open');
  menu.setAttribute('aria-expanded',String(open));
});
links.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{
  links.classList.remove('open');
  menu.setAttribute('aria-expanded','false');
}));

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){
    entry.target.classList.add('visible');
    observer.unobserve(entry.target);
  }
}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(element=>observer.observe(element));
