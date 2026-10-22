/* Sprache vor dem ersten Zeichnen setzen, damit nichts flackert */
(function(){try{var l=localStorage.getItem('oriso-wachstum-lang');if(l==='en'||l==='de'){document.documentElement.setAttribute('data-lang',l);document.documentElement.lang=l;}}catch(e){}})();
