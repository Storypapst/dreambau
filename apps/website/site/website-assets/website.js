(() => {
'use strict';
const input=document.getElementById('search'), results=document.getElementById('results'), refs=[...document.querySelectorAll('.project')], terms=[...document.querySelectorAll('.term')], questions=[...document.querySelectorAll('.rows li')], rows=refs.length?refs:[...terms,...questions];
input.addEventListener('input',()=>{const q=input.value.normalize('NFKC').toLocaleLowerCase('de').trim();let count=0;for(const row of rows){row.hidden=!row.textContent.normalize('NFKC').toLocaleLowerCase('de').includes(q);if(!row.hidden)count++;}for(const item of document.querySelectorAll('.node')){const target=document.querySelector(item.querySelector('a').getAttribute('href'));item.hidden=target.hidden;}results.textContent=q?(count?count+' Treffer':'Keine Treffer'):'';});
})();
