const ageGate=document.querySelector('#ageGate');const cookie=document.querySelector('#cookie');const joinPopup=document.querySelector('#joinPopup');const body=document.body;
if(!localStorage.getItem('jeazy-age')){ageGate.classList.add('show');body.classList.add('locked')}
const showJoinOffer=()=>{joinPopup.classList.add('show');body.classList.add('locked')};
document.querySelector('#ageYes').addEventListener('click',()=>{localStorage.setItem('jeazy-age','yes');ageGate.classList.remove('show');body.classList.remove('locked');setTimeout(showJoinOffer,350)});
document.querySelector('#ageNo').addEventListener('click',()=>{window.location.href='https://www.google.com'});
if(localStorage.getItem('jeazy-age'))setTimeout(showJoinOffer,500);
const closeJoin=()=>{joinPopup.classList.remove('show');body.classList.remove('locked');if(!localStorage.getItem('jeazy-cookie'))cookie.classList.add('show')};
['joinClose','joinLater','joinCta'].forEach(id=>document.querySelector('#'+id).addEventListener('click',closeJoin));
['cookieAccept','cookieReject'].forEach(id=>document.querySelector('#'+id).addEventListener('click',()=>{localStorage.setItem('jeazy-cookie',id==='cookieAccept'?'all':'essential');cookie.classList.remove('show')}));
const menu=document.querySelector('.menu'),links=document.querySelector('#navLinks');menu.addEventListener('click',()=>{const open=links.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});links.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{links.classList.remove('open');menu.setAttribute('aria-expanded','false')}));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
document.querySelector('#leadForm').addEventListener('submit',event=>{event.preventDefault();const status=event.currentTarget.querySelector('.form-status');status.textContent='Gracias. Tu solicitud quedó preparada para conectarse al CRM.';event.currentTarget.reset()});
