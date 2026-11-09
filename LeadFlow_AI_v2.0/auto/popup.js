function getToolEls(){
  return {
    switchBtn: document.getElementById('toolSwitch'),
    wrapAf: document.getElementById('wrapper-af'),
    wrapMm: document.getElementById('wrapper-mm'),
    afFrame: document.getElementById('afFrame'),
    mmFrame: document.getElementById('mmFrame')
  };
}

function loadToolFrame(frame){
  if(frame && frame.dataset.src && frame.getAttribute('src') !== frame.dataset.src){
    frame.setAttribute('src', frame.dataset.src);
  }
}

function unloadToolFrame(frame){
  if(frame) frame.setAttribute('src','about:blank');
}

function setToolMode(mode){
  const {switchBtn, wrapAf, wrapMm, afFrame, mmFrame} = getToolEls();
  if(!switchBtn || !wrapAf || !wrapMm || !afFrame || !mmFrame) return;

  const isMultiple = mode === 'mm';
  switchBtn.classList.toggle('multiple', isMultiple);
  switchBtn.setAttribute('aria-checked', String(isMultiple));
  switchBtn.setAttribute('aria-label', isMultiple ? 'Multiple Buttons active. Click to switch to Autofill.' : 'Autofill active. Click to switch to Multiple Buttons.');

  wrapAf.classList.toggle('hidden', isMultiple);
  wrapMm.classList.toggle('hidden', !isMultiple);

  if(isMultiple){
    loadToolFrame(mmFrame);
    unloadToolFrame(afFrame);
  }else{
    loadToolFrame(afFrame);
    unloadToolFrame(mmFrame);
  }

  chrome.storage.local.set({[window.__innerModeKey || '__toolInnerMode']: mode});
}

function toggleToolMode(){
  const {switchBtn} = getToolEls();
  const isMultiple = switchBtn && switchBtn.classList.contains('multiple');
  setToolMode(isMultiple ? 'af' : 'mm');
}

document.addEventListener('DOMContentLoaded', () => {
  window.__innerModeKey = document.body && document.body.dataset && document.body.dataset.modeKey || '__toolInnerMode';
  const {switchBtn} = getToolEls();
  if(switchBtn){
    switchBtn.addEventListener('click', toggleToolMode);
    switchBtn.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        toggleToolMode();
      }
    });
  }
  chrome.storage.local.get({[window.__innerModeKey]:'af'}, res => {
    setToolMode(res[window.__innerModeKey] === 'mm' ? 'mm' : 'af');
  });
});
