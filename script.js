const STEP_MS = 250;
const INITIAL_VOLUME = 0.7;

const qL = (el)=> document.querySelector(el);
const qA = (el)=> document.querySelectorAll(el);

const pieces = [...qA('.piece--button')];
const soundKeys = pieces.map((piece)=> piece.dataset.key);
const compositionInput = qL('#composition');
const sequenceView = qL('.sequence');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = AudioContextClass ? new AudioContextClass() : null;
const masterGain = audioContext ? audioContext.createGain() : null;
const buffers = {};
const hitAnimations = new Map();
let volume = INITIAL_VOLUME;
let playback = null;
let pointerPiece = null;

function loadSounds() {
    qA('audio').forEach((audio)=>{
        audio.volume = volume;
    });
    if(!audioContext || location.protocol === 'file:') return;

    masterGain.gain.value = volume;
    masterGain.connect(audioContext.destination);

    soundKeys.forEach((key)=>{
        fetch(qL(`#s_${key}`).getAttribute('src'))
            .then((response)=> response.arrayBuffer())
            .then((data)=> audioContext.decodeAudioData(data))
            .then((buffer)=>{
                buffers[key] = buffer;
            })
            .catch(()=>{});
    });
}

function playSound(key) {
    const piece = pieces.find((item)=> item.dataset.key === key);
    if(!piece) return;

    if(buffers[key]) {
        if(audioContext.state === 'suspended') audioContext.resume();
        const source = audioContext.createBufferSource();
        source.buffer = buffers[key];
        source.connect(masterGain);
        source.start();
    } else {
        const audio = qL(`#s_${key}`);
        audio.currentTime = 0;
        audio.play().catch(()=>{});
    }

    highlight(piece);
}

function highlight(piece) {
    const glow = [
        { filter: 'brightness(1.35) drop-shadow(0 0 18px rgba(168, 85, 247, 0.9))' },
        { filter: 'brightness(1) drop-shadow(0 0 0 rgba(168, 85, 247, 0))' }
    ];
    const hit = [
        { transform: 'scale(0.95)' },
        { transform: 'scale(1)' }
    ];
    const keyframes = reducedMotion.matches ? glow : glow.map((frame, index)=> ({ ...frame, ...hit[index] }));
    if(hitAnimations.has(piece)) hitAnimations.get(piece).cancel();
    hitAnimations.set(piece, piece.querySelector('.piece--art').animate(keyframes, { duration: 220, easing: 'ease-out' }));
}

function setVolume(value) {
    volume = value / 100;
    qL('.volume--value').textContent = `${value}%`;
    qL('#volume').setAttribute('aria-valuetext', `${value}%`);
    qL('#volume').style.setProperty('--fill', `${value}%`);
    qL('.volume').classList.toggle('muted', volume === 0);
    qA('audio').forEach((audio)=>{
        audio.volume = volume;
    });
    if(masterGain) masterGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.01);
}

qL('#volume').addEventListener('input', (e)=> setVolume(parseInt(e.target.value, 10)));

document.addEventListener('keydown', (e)=>{
    if(e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if(e.target.closest('textarea, input')) return;
    const key = e.code.toLowerCase();
    if(soundKeys.includes(key)) playSound(key);
});

pieces.forEach((piece)=>{
    piece.addEventListener('pointerdown', (e)=>{
        if(e.button !== 0) return;
        pointerPiece = piece;
        playSound(piece.dataset.key);
    });
    piece.addEventListener('click', ()=>{
        if(pointerPiece !== piece) playSound(piece.dataset.key);
        pointerPiece = null;
    });
});
document.addEventListener('pointerup', ()=> setTimeout(()=>{
    pointerPiece = null;
}));
document.addEventListener('pointercancel', ()=>{
    pointerPiece = null;
});

function renderKeymap() {
    const list = qL('.keymap--list');
    pieces.forEach((piece)=>{
        const row = document.createElement('div');
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        const letter = piece.querySelector('kbd').textContent;
        const name = piece.querySelector('.piece--name').textContent;

        term.innerHTML = '<kbd></kbd>';
        term.querySelector('kbd').textContent = letter;
        description.textContent = name;
        row.append(term, description);
        list.append(row);

        piece.setAttribute('aria-label', `${name}, tecla ${letter}`);
    });
}

function getSteps() {
    return [...compositionInput.value.toLowerCase()].filter((char)=> char !== '\n');
}

function renderSequence(steps) {
    sequenceView.innerHTML = '';
    steps.forEach((char)=>{
        const step = document.createElement('span');
        const playable = soundKeys.includes(`key${char}`);
        step.className = playable ? 'step' : 'step step--rest';
        step.textContent = playable ? char.toUpperCase() : '·';
        sequenceView.append(step);
    });
}

function setStatus(message) {
    qL('.composer--status').textContent = message;
}

function setPlaying(isPlaying) {
    const focusWasOnControls = document.activeElement === qL('.composer--play')
        || document.activeElement === qL('.composer--stop');

    qL('.composer').classList.toggle('playing', isPlaying);
    qL('.composer--play').disabled = isPlaying;
    qL('.composer--stop').disabled = !isPlaying;
    compositionInput.hidden = isPlaying;
    sequenceView.hidden = !isPlaying;

    if(focusWasOnControls || document.activeElement === document.body) {
        qL(isPlaying ? '.composer--stop' : '.composer--play').focus();
    }
}

function playComposition() {
    if(playback) return;

    const steps = getSteps();
    if(!steps.some((char)=> soundKeys.includes(`key${char}`))) {
        setStatus('Digite uma sequência usando as letras da bateria.');
        compositionInput.focus();
        return;
    }

    renderSequence(steps);
    playback = { steps, index: 0, start: performance.now(), timer: null };
    setPlaying(true);
    setStatus('Reproduzindo a composição.');
    nextStep();
}

function nextStep() {
    const { steps, index } = playback;
    const previous = sequenceView.querySelector('.step.current');
    if(previous) previous.classList.remove('current');

    if(index >= steps.length) {
        finishPlayback('Reprodução concluída.');
        return;
    }

    const current = sequenceView.children[index];
    current.classList.add('current');
    if(current.offsetTop + current.offsetHeight > sequenceView.scrollTop + sequenceView.clientHeight) {
        sequenceView.scrollTop = current.offsetTop;
    }
    if(soundKeys.includes(`key${steps[index]}`)) playSound(`key${steps[index]}`);

    playback.index++;
    const delay = playback.start + playback.index * STEP_MS - performance.now();
    playback.timer = setTimeout(nextStep, Math.max(0, delay));
}

function finishPlayback(message) {
    if(!playback) return;
    clearTimeout(playback.timer);
    playback = null;
    setPlaying(false);
    setStatus(message);
}

qL('.composer--play').addEventListener('click', playComposition);
qL('.composer--stop').addEventListener('click', ()=> finishPlayback('Reprodução interrompida.'));
qL('.composer--clear').addEventListener('click', ()=>{
    finishPlayback('');
    compositionInput.value = '';
    setStatus('Composição apagada.');
    compositionInput.focus();
});

renderKeymap();
loadSounds();
