

function tagQuestion(q) {
  if (q.topic) return q.topic; // manual override
  // First pass: question text only (most reliable signal)
  const qText = q.q.toLowerCase();
  for (const [re, topic] of TOPIC_RULES) {
    if (re.test(qText)) return topic;
  }
  // Second pass: answer options (handles "Which service should you use?" questions)
  const optText = (q.options||[]).join(' ').toLowerCase();
  for (const [re, topic] of TOPIC_RULES) {
    if (re.test(optText)) return topic;
  }
  return 'General';
}

QUESTIONS.forEach(q => { if (!q.topic) q.topic = tagQuestion(q); });
const ALL_TOPICS = [...new Set(QUESTIONS.map(q => q.topic))].sort();

// Progress
const STORAGE_KEY = 'aws-quiz-progress-' + CERT_META.id;
function loadProgress() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch { return {}; } }
function saveProgress(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
function isMastered(e) { return e && e.correct >= 1; }
function isWeak(e) { return e && e.incorrect > 0 && !isMastered(e); }

function recordAnswer(idx, correct) {
  const p = loadProgress();
  if (!p[idx]) p[idx] = {correct:0,incorrect:0,lastSeen:0};
  if (correct) p[idx].correct++; else p[idx].incorrect++;
  p[idx].lastSeen = Date.now();
  saveProgress(p);
  updateHomeStats();
}

function updateHomeStats() {
  const p = loadProgress();
  const mastered = QUESTIONS.filter((_,i) => isMastered(p[i])).length;
  const topicsSeen = new Set(QUESTIONS.filter((_,i) => p[i] && (p[i].correct > 0 || p[i].incorrect > 0)).map(q => q.topic || tagQuestion(q))).size;
  document.getElementById('stat-mastery').textContent = Math.round(mastered/QUESTIONS.length*100)+'%';
  document.getElementById('stat-topics').textContent = topicsSeen || new Set(QUESTIONS.map(q => q.topic || tagQuestion(q))).size;
  document.getElementById('stat-mastered-text').textContent = mastered+' of '+QUESTIONS.length+' mastered';
  document.getElementById('home-progress-fill').style.width = (mastered/QUESTIONS.length*100)+'%';
}

// Nav
function goTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelector('[data-tab='+tab+']').classList.add('active');
  if (tab==='flash') initFlashcards();
  if (tab==='quiz') resetQuizSetup();
}
document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => goTab(t.dataset.tab)));

// Pill selector
document.querySelectorAll('.pill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('.pill[data-group="'+p.dataset.group+'"]').forEach(x => x.classList.remove('selected'));
    p.classList.add('selected');
  });
});
function getPillVal(group) {
  const el = document.querySelector('.pill.selected[data-group="'+group+'"]');
  return el ? el.dataset.val : null;
}

// Service data for study tab


function buildStudyCards() {
  const grid = document.getElementById('service-grid');
  grid.innerHTML = SERVICES.map(s => {
    const bulletsHtml = s.bullets.map(b => '<li>'+escHtml(b)+'</li>').join('');
    return '<div class="service-card">' +
      '<div class="service-header"><span class="service-emoji">'+s.emoji+'</span><span class="service-name">'+escHtml(s.name)+'</span></div>' +
      '<div class="service-desc">'+escHtml(s.desc)+'</div>' +
      '<ul class="service-bullets">'+bulletsHtml+'</ul>' +
      '<button class="btn btn-primary btn-sm" onclick="startTopicQuiz(\'' + s.name + '\')">'+'Practice '+escHtml(s.name)+' Questions</button>' +
      '</div>';
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Quiz logic
let quizState = null;
let selectedMulti = new Set();

function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function getPool(opts) {
  const p = loadProgress();
  let pool = QUESTIONS.map((q,i) => ({...q,_idx:i}));
  if (opts.topic && opts.topic !== 'all') pool = pool.filter(q => q.topic === opts.topic);
  if (opts.filter === 'weak') pool = pool.filter(q => isWeak(p[q._idx]));
  pool = shuffle(pool);
  if (opts.count !== 'all') pool = pool.slice(0, parseInt(opts.count));
  return pool;
}

function startQuickQuiz(count) {
  goTab('quiz');
  setTimeout(() => launchQuiz(getPool({count}), 'study', false), 10);
}
function startExamSim() {
  goTab('quiz');
  setTimeout(() => launchQuiz(getPool({count: CERT_META.examQuestions}), 'exam', true), 10);
}
function startWeakAreas() {
  const p = loadProgress();
  const pool = shuffle(QUESTIONS.map((q,i)=>({...q,_idx:i})).filter(q => isWeak(p[q._idx])));
  if (!pool.length) { alert('No weak areas yet! Answer some questions first.'); return; }
  goTab('quiz');
  setTimeout(() => launchQuiz(pool, 'study', false), 10);
}
function startTopicQuiz(topic) {
  goTab('quiz');
  setTimeout(() => launchQuiz(getPool({topic, count:20}), 'study', false), 10);
}

function resetQuizSetup() {
  document.getElementById('quiz-setup-screen').style.display='';
  document.getElementById('quiz-active-screen').style.display='none';
  document.getElementById('quiz-result-screen').style.display='none';
}

function startConfiguredQuiz() {
  const mode=getPillVal('mode'), count=getPillVal('count'), topic=getPillVal('topic'), filter=getPillVal('filter');
  const qs=getPool({topic,filter,count});
  if (!qs.length) { alert('No questions match the selected filters.'); return; }
  launchQuiz(qs, mode, mode==='exam');
}

function launchQuiz(questions, mode, timed) {
  document.getElementById('quiz-setup-screen').style.display='none';
  document.getElementById('quiz-active-screen').style.display='';
  document.getElementById('quiz-result-screen').style.display='none';
  quizState = { questions, mode, timed, current:0, score:0, timerEnd: timed ? Date.now()+CERT_META.minutes*60*1000 : null, timerInterval:null };
  selectedMulti = new Set();
  if (timed) quizState.timerInterval = setInterval(updateTimer, 1000);
  renderQuestion();
}

function updateTimer() {
  if (!quizState||!quizState.timed) return;
  const rem = Math.max(0, quizState.timerEnd - Date.now());
  const m=Math.floor(rem/60000), s=Math.floor((rem%60000)/1000);
  const el=document.getElementById('quiz-timer');
  if (el) { el.textContent='⏱ '+m+':'+(s<10?'0':'')+s; el.className='timer'+(rem<600000?'':' ok'); }
  if (rem===0) { clearInterval(quizState.timerInterval); showResult(); }
}

function renderQuestion() {
  const {questions,current,mode,timed} = quizState;
  const q = questions[current];
  const total = questions.length;
  const pct = Math.round(current/total*100);
  const multi = Array.isArray(q.answer);
  const ansArr = multi ? q.answer : [q.answer];
  selectedMulti = new Set();

  const optHtml = q.options.map((opt,i) =>
    '<button class="answer-btn" data-idx="'+i+'" onclick="handleAnswer('+i+')">'+String.fromCharCode(65+i)+'. '+escHtml(opt)+'</button>'
  ).join('');

  const timerHtml = timed ? '<span id="quiz-timer" class="timer ok">⏱ 130:00</span>' : '';
  const multiHint = multi ? ' <span class="badge-pill" style="margin-left:4px">Select '+ansArr.length+'</span>' : '';

  document.getElementById('quiz-active-screen').innerHTML =
    '<div class="quiz-active">' +
    '<div class="quiz-header"><span class="quiz-progress-text">Question '+(current+1)+' of '+total+'</span>'+timerHtml+'<span class="quiz-score" id="qscore">Score: '+quizState.score+'/'+(current)+'</span></div>' +
    '<div class="progress-bar" style="margin-bottom:16px"><div class="progress-fill" style="width:'+pct+'%"></div></div>' +
    '<div class="question-card">' +
    '<div class="question-num">Topic: <span class="badge-pill">'+escHtml(q.topic||'General')+'</span>'+multiHint+'</div>' +
    '<div class="question-text">'+escHtml(q.q)+' <button class="info-btn" onclick="showInfo(\'' + escJs(q.topic||'General') + '\')" title="Service info">ℹ</button></div>' +
    '<div class="answers" id="answers-wrap">'+optHtml+'</div>' +
    '<div id="feedback-area"></div>' +
    '<div class="next-btn-wrap" id="next-wrap" style="display:none"><button class="btn btn-primary" onclick="nextQuestion()">'+(current<total-1?'Next Question →':'See Results')+'</button></div>' +
    '</div></div>';

  if (timed) updateTimer();
}

function escJs(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

function handleAnswer(idx) {
  const {questions,current,mode} = quizState;
  const q = questions[current];
  const multi = Array.isArray(q.answer);
  if (!multi) { submitSingle(idx); return; }
  const btn = document.querySelector('.answer-btn[data-idx="'+idx+'"]');
  if (selectedMulti.has(idx)) {
    selectedMulti.delete(idx);
    btn.classList.remove('sel-multi');
  } else {
    selectedMulti.add(idx);
    btn.classList.add('sel-multi');
  }
  if (selectedMulti.size === q.answer.length) submitMulti(Array.from(selectedMulti));
}

function submitSingle(idx) {
  const {questions,current,mode} = quizState;
  const q = questions[current];
  const correct = idx === q.answer;
  recordAnswer(q._idx, correct);
  if (correct) quizState.score++;
  if (mode === 'study') {
    document.querySelectorAll('.answer-btn').forEach(b => {
      b.disabled=true;
      const i=parseInt(b.dataset.idx);
      if (i===q.answer) b.classList.add('correct');
      else if (i===idx) b.classList.add('wrong');
    });
    const fb = document.getElementById('feedback-area');
    fb.innerHTML = correct
      ? '<div class="feedback correct">✓ Correct!</div>'
      : '<div class="feedback wrong">✗ Incorrect. Correct: '+String.fromCharCode(65+q.answer)+'.</div>';
    document.getElementById('next-wrap').style.display='';
  } else { nextQuestion(); }
}

function submitMulti(selected) {
  const {questions,current,mode} = quizState;
  const q = questions[current];
  const correct = selected.length===q.answer.length && selected.every(i=>q.answer.includes(i));
  recordAnswer(q._idx, correct);
  if (correct) quizState.score++;
  if (mode === 'study') {
    document.querySelectorAll('.answer-btn').forEach(b => {
      b.disabled=true;
      const i=parseInt(b.dataset.idx);
      if (q.answer.includes(i)) b.classList.add('correct');
      else if (selected.includes(i)) b.classList.add('wrong');
    });
    const letters = q.answer.map(i=>String.fromCharCode(65+i)).join(', ');
    const fb = document.getElementById('feedback-area');
    fb.innerHTML = correct
      ? '<div class="feedback correct">✓ Correct!</div>'
      : '<div class="feedback wrong">✗ Incorrect. Correct: '+letters+'.</div>';
    document.getElementById('next-wrap').style.display='';
  } else { nextQuestion(); }
}

function nextQuestion() {
  quizState.current++;
  selectedMulti = new Set();
  if (quizState.current >= quizState.questions.length) showResult();
  else renderQuestion();
}

function showResult() {
  if (quizState.timerInterval) clearInterval(quizState.timerInterval);
  document.getElementById('quiz-active-screen').style.display='none';
  const rs = document.getElementById('quiz-result-screen');
  rs.style.display='';
  const {score,questions} = quizState;
  const total=questions.length, pct=Math.round(score/total*100), pass=pct>=65;
  rs.innerHTML = '<div class="result-card">' +
    '<div class="result-score">'+pct+'%</div>' +
    '<div class="result-label '+(pass?'result-pass':'result-fail')+'">'+(pass?'🎉 PASSED!':'❌ Not quite — keep practicing')+'</div>' +
    '<div class="result-sub">'+score+' of '+total+' correct &middot; Passing score: 65%</div>' +
    '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">' +
    '<button class="btn btn-primary" onclick="resetQuizSetup()">New Quiz</button>' +
    '<button class="btn" onclick="goTab(\'home\')">Home</button>' +
    '</div></div>';
  updateHomeStats();
}

// Info modal
const AWS_DOCS = {
  'Lambda':'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html',
  'API Gateway':'https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html',
  'DynamoDB':'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html',
  'SQS':'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html',
  'SNS':'https://docs.aws.amazon.com/sns/latest/dg/welcome.html',
  'Kinesis':'https://docs.aws.amazon.com/streams/latest/dev/introduction.html',
  'S3':'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
  'CloudFront':'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html',
  'ElastiCache':'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/WhatIs.html',
  'RDS':'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html',
  'CodeDeploy':'https://docs.aws.amazon.com/codedeploy/latest/userguide/welcome.html',
  'CodePipeline':'https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html',
  'CodeCommit':'https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html',
  'CodeBuild':'https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html',
  'CloudFormation':'https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html',
  'ECS':'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html',
  'Cognito':'https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html',
  'IAM':'https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html',
  'KMS':'https://docs.aws.amazon.com/kms/latest/developerguide/overview.html',
  'Secrets Manager':'https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html',
  'X-Ray':'https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html',
  'CloudWatch':'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html',
  'Elastic Beanstalk':'https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/Welcome.html',
  'Step Functions':'https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html',
  'EventBridge':'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html',
};

function showInfo(topic) {
  const s = SERVICES.find(x => x.name === topic);
  document.getElementById('modal-title').textContent = (s ? s.emoji+' ' : '') + (topic||'AWS Service');
  document.getElementById('modal-desc').textContent = s ? s.desc + '\n\nKey Points:\n' + s.bullets.map(b=>'• '+b).join('\n') : 'General AWS service.';
  const url = AWS_DOCS[topic] || 'https://docs.aws.amazon.com/index.html';
  const link = document.getElementById('modal-link');
  link.href = url;
  link.textContent = '📖 '+(topic||'AWS')+' Documentation →';
  document.getElementById('info-modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('info-modal').classList.add('hidden'); }
document.getElementById('info-modal').addEventListener('click', e => { if (e.target===document.getElementById('info-modal')) closeModal(); });

// Flashcards
let flashState = {questions:[], current:0};

function initFlashcards() {
  const topic = document.getElementById('flash-topic-filter').value;
  let pool = QUESTIONS.map((q,i) => ({...q,_idx:i}));
  if (topic !== 'all') pool = pool.filter(q => q.topic === topic);
  flashState = {questions: shuffle(pool), current: 0};
  document.getElementById('flash-count-badge').textContent = pool.length+' cards';
  const card = document.getElementById('flash-card');
  card.classList.remove('flipped');
  renderFlashCard();
}

function renderFlashCard() {
  const {questions,current} = flashState;
  if (!questions.length) {
    document.getElementById('flash-front-text').textContent = 'No cards for this topic.';
    document.getElementById('flash-back-text').textContent = '';
    document.getElementById('flash-counter').textContent = '0 / 0';
    return;
  }
  const q = questions[current];
  const ansArr = Array.isArray(q.answer) ? q.answer : [q.answer];
  const ansText = ansArr.map(i => String.fromCharCode(65+i)+'. '+q.options[i]).join(' | ');
  document.getElementById('flash-front-text').textContent = q.q;
  document.getElementById('flash-back-text').textContent = ansText;
  document.getElementById('flash-counter').textContent = (current+1)+' / '+questions.length;
  document.getElementById('flash-card').classList.remove('flipped');
}

function flipCard() { document.getElementById('flash-card').classList.toggle('flipped'); }
function flashPrev() { if (flashState.current > 0) { flashState.current--; renderFlashCard(); } }
function flashNext() { if (flashState.current < flashState.questions.length-1) { flashState.current++; renderFlashCard(); } }

// Keyboard shortcuts for flashcards
document.addEventListener('keydown', e => {
  if (document.getElementById('tab-flash').classList.contains('active')) {
    if (e.key==='ArrowLeft') flashPrev();
    else if (e.key==='ArrowRight') flashNext();
    else if (e.key===' ') { e.preventDefault(); flipCard(); }
  }
});

// Populate topic dropdowns
function populateTopics() {
  const topicPills = document.getElementById('topic-pills');
  ALL_TOPICS.forEach(t => {
    const pill = document.createElement('div');
    pill.className='pill'; pill.dataset.group='topic'; pill.dataset.val=t; pill.textContent=t;
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill[data-group="topic"]').forEach(x=>x.classList.remove('selected'));
      pill.classList.add('selected');
    });
    topicPills.appendChild(pill);
  });
  const sel = document.getElementById('flash-topic-filter');
  ALL_TOPICS.forEach(t => { const o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o); });
}

// Theme
function toggleTheme() {
  const html = document.documentElement;
  const newTheme = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  document.getElementById('theme-toggle').textContent = newTheme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('theme', newTheme);
}

// Init
const _t = localStorage.getItem('theme') || 'dark';
document.getElementById('theme-toggle').textContent = _t === 'light' ? '☀️' : '🌙';
// Set cert identity in nav
const _logo = document.querySelector('.nav-logo');
if (_logo) _logo.innerHTML = '&#x2601; ' + CERT_META.code + ' <span>' + CERT_META.name + '</span>';
// Set page title
document.title = 'AWS ' + CERT_META.code + ' Study Platform';
// Set stat total
const _statTotal = document.getElementById('stat-total');
if (_statTotal) _statTotal.textContent = QUESTIONS.length;
buildStudyCards();
populateTopics();
updateHomeStats();
initFlashcards();
document.getElementById('stat-topics').textContent = ALL_TOPICS.length;
