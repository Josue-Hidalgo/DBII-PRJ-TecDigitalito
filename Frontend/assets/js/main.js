// ===============================================
//  CONFIGURATION
// ===============================================
const API = 'http://localhost:3000'; // Change if backend runs on different port/host

// ===============================================
//  STATE
// ===============================================
let currentUser = null;
let currentCourseId = null;
let currentChatUserId = null;
let currentEvalId = null;
let questionsCount = 0;
let currentStudentCourseId = null;

// ===============================================
//  HELPERS
// ===============================================
function showSpinner() { document.getElementById('spinner').classList.add('visible'); }
function hideSpinner() { document.getElementById('spinner').classList.remove('visible'); }

function showAlert(containerId, msg, type = 'danger') {
  const icons = { danger: 'bi-exclamation-triangle', success: 'bi-check-circle', warning: 'bi-exclamation-circle' };
  document.getElementById(containerId).innerHTML = `
    <div class="alert-custom alert-${type}">
      <i class="bi ${icons[type]}"></i> ${msg}
    </div>`;
}
function clearAlert(id) { const el = document.getElementById(id); if(el) el.innerHTML = ''; }

async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  const t = token || (currentUser && currentUser.token);
  if (t) opts.headers['Authorization'] = `Bearer ${t}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  let data;
  try { data = await res.json(); } catch(e) { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}

function formatDate(d) {
  if (!d) return 'â\x80\x94';
  return new Date(d).toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ===============================================
//  NAVIGATION
// ===============================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (!el) return;

  // Auth/forgot pages need special flex layout
  if (id === 'page-auth' || id === 'page-forgot') {
    el.style.display = 'flex';
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('main-content').style.marginLeft = '0';
    document.getElementById('main-content').style.padding = '0';
  } else {
    el.style.display = 'block';
    if (currentUser) {
      document.getElementById('sidebar').style.display = 'flex';
      document.getElementById('main-content').style.marginLeft = '260px';
      document.getElementById('main-content').style.padding = '32px';
    }
  }
  el.classList.add('active');

  // Highlight nav
  document.querySelectorAll('.nav-link-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-link-btn').forEach(b => {
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(id)) b.classList.add('active');
  });

  // Trigger load functions
  if (id === 'page-home') loadHome();
  if (id === 'page-my-courses') loadMyCourses();
  if (id === 'page-enrolled') loadEnrolledCourses();
  if (id === 'page-friends') { loadFriends(); }
  if (id === 'page-messages') loadConversations();
  if (id === 'page-health') loadHealthCheck();
}

// ===============================================
//  AUTH â\x80\x94 TAB SWITCH
// ===============================================
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  clearAlert('auth-alert');
}

// ===============================================
//  AUTH â\x80\x94 LOGIN
// ===============================================
async function doLogin() {
  clearAlert('auth-alert');
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const rememberMe = document.getElementById('rememberMe').checked;

  if (!username || !password) return showAlert('auth-alert', 'Completa todos los campos.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/auth/login', { username, password, rememberMe });
    if (ok) {
      currentUser = { ...data.user, token: data.token };
      onLogin();
    } else {
      showAlert('auth-alert', data.message || 'Credenciales inválidas.', 'danger');
    }
  } catch(e) {
    showAlert('auth-alert', 'Error de conexión. Verifica que el servidor esté activo.', 'danger');
  } finally { hideSpinner(); }
}

// ===============================================
//  AUTH â\x80\x94 REGISTER
// ===============================================
async function doRegister() {
  clearAlert('auth-alert');
  const fullName = document.getElementById('regNombre').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const birthDate = document.getElementById('regBirth').value;
  const password = document.getElementById('regPassword').value;
  const photoBase64 = document.getElementById('regAvatar').value.trim();

  if (!fullName || !username || !email || !birthDate || !password)
    return showAlert('auth-alert', 'Completa todos los campos obligatorios.', 'warning');
  if (!/^.{8,}$/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return showAlert('auth-alert', 'La contraseña debe tener mínimo 8 caracteres e incluir mayúscula, minúscula, número y símbolo.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/auth/register', { fullName, username, email, birthDate, password, photoBase64 });
    if (ok) {
      showAlert('auth-alert', 'Â¡Cuenta creada exitosamente! Ahora inicia sesión.', 'success');
      switchAuthTab('login');
    } else {
      showAlert('auth-alert', data.message || 'Error al registrar. Intenta de nuevo.', 'danger');
    }
  } catch(e) {
    showAlert('auth-alert', 'Error de conexión.', 'danger');
  } finally { hideSpinner(); }
}

// ===============================================
//  AUTH â\x80\x94 FORGOT PASSWORD
// ===============================================
async function doForgotPassword() {
  clearAlert('forgot-alert');
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) return showAlert('forgot-alert', 'Ingresa tu correo electrónico.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/password/forgot', { email });
    if (ok) {
      showAlert('forgot-alert', 'Se ha enviado un enlace de recuperaciÃ³n a tu correo.', 'success');
    } else {
      showAlert('forgot-alert', data.message || 'Error al enviar el correo.', 'danger');
    }
  } catch(e) {
    showAlert('forgot-alert', 'Error de conexiÃ³n.', 'danger');
  } finally { hideSpinner(); }
}

// ===============================================
//  ON LOGIN
// ===============================================
function onLogin() {
  const u = currentUser;
  document.getElementById('sidebarInitials').textContent = getInitials(u.nombre_completo || u.username);
  document.getElementById('sidebarName').textContent = u.nombre_completo || u.username;
  document.getElementById('sidebarUsername').textContent = '@' + u.username;
  document.getElementById('sidebar-user').classList.add('visible');
  document.getElementById('nav-guest').style.display = 'none';
  document.getElementById('nav-user').style.display = 'block';
  document.getElementById('sidebar-footer').style.display = 'block';

  showPage('page-home');
}

// ===============================================
//  LOGOUT
// ===============================================
async function logout() {
  try {
    await api('POST', '/api/session/logout', {});
  } catch(e) {}
  currentUser = null;
  document.getElementById('sidebar-user').classList.remove('visible');
  document.getElementById('nav-guest').style.display = 'block';
  document.getElementById('nav-user').style.display = 'none';
  document.getElementById('sidebar-footer').style.display = 'none';
  showPage('page-auth');
}

// ===============================================
//  HOME
// ===============================================
async function loadHome() {
  if (!currentUser) return;
  document.getElementById('homeWelcomeName').textContent = currentUser.nombre_completo || currentUser.username;

  // Load teacher courses count
  try {
    const { ok, data } = await api('GET', `/api/courses/teacher/${currentUser._id || currentUser.user_id}`);
    if (ok && data.courses) {
      document.getElementById('statCourses').textContent = data.courses.length;
      const html = data.courses.slice(0,3).map(c => `
        <div class="d-flex align-items-center gap-3 py-2" style="border-bottom:1px solid var(--border);">
          <div style="width:36px;height:36px;background:var(--surface2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:12px;color:var(--accent);">${(c.codigo||'?').slice(0,3)}</div>
          <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${c.nombre||'Sin nombre'}</div><div style="font-size:11px;color:var(--text-muted);">${c.estado||'borrador'}</div></div>
          <button class="btn-outline-custom" style="padding:4px 12px;font-size:11px;" onclick="openCourseDetail('${c._id||c.course_id}')">Ver</button>
        </div>`).join('') || '<div class="text-muted-custom">Sin cursos creados</div>';
      document.getElementById('homeRecentCourses').innerHTML = html;
    }
  } catch(e) {}

  // Load enrolled courses count
  try {
    const { ok, data } = await api('GET', `/api/enrollments/student/${currentUser._id || currentUser.user_id}`);
    if (ok && data.enrollments) {
      document.getElementById('statEnrolled').textContent = data.enrollments.length;
      const html = data.enrollments.slice(0,3).map(e => `
        <div class="d-flex align-items-center gap-3 py-2" style="border-bottom:1px solid var(--border);">
          <div style="width:36px;height:36px;background:var(--surface2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;">ð\x9f\x93\x9a</div>
          <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${e.nombre||e.course_id}</div><div style="font-size:11px;color:var(--text-muted);">${e.estado||'activo'}</div></div>
        </div>`).join('') || '<div class="text-muted-custom">Sin matrÃ\xadculas</div>';
      document.getElementById('homeEnrolledCourses').innerHTML = html;
    }
  } catch(e) {}
}

// ===============================================
//  COURSES â\x80\x94 TEACHER
// ===============================================
async function saveCourse() {
  clearAlert('createCourseAlert');
  const codigo = document.getElementById('courseCode').value.trim();
  const nombre = document.getElementById('courseName').value.trim();
  const descripcion = document.getElementById('courseDesc').value.trim();
  const fecha_inicio = document.getElementById('courseStart').value;
  const fecha_fin = document.getElementById('courseEnd').value || null;
  const foto = document.getElementById('coursePhoto').value.trim() || null;

  if (!codigo || !nombre || !descripcion || !fecha_inicio)
    return showAlert('createCourseAlert', 'Completa los campos obligatorios: Código, Nombre, Descripción y Fecha de Inicio.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/courses', { 
      teacherId: currentUser._id || currentUser.user_id,
      code: codigo, 
      name: nombre, 
      description: descripcion, 
      startDate: fecha_inicio, 
      endDate: fecha_fin, 
      photoBase64: foto 
    });
    if (ok) {
      showAlert('createCourseAlert', 'Curso creado exitosamente!', 'success');
      setTimeout(() => showPage('page-my-courses'), 1200);
    } else {
      showAlert('createCourseAlert', data.message || 'Error al crear el curso.', 'danger');
    }
  } catch(e) {
    showAlert('createCourseAlert', 'Error de conexión.', 'danger');
  } finally { hideSpinner(); }
}

async function loadMyCourses() {
  if (!currentUser) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/courses/teacher/${currentUser._id || currentUser.user_id}`);
    if (ok && data.courses) {
      if (!data.courses.length) {
        document.getElementById('myCoursesGrid').innerHTML = '<div class="text-muted-custom">No has creado ningÃºn curso aÃºn. Â¡Crea tu primer curso!</div>';
        return;
      }
      document.getElementById('myCoursesGrid').innerHTML = data.courses.map(c => renderCourseCard(c, true)).join('');
    }
  } catch(e) {} finally { hideSpinner(); }
}

function renderCourseCard(c, isTeacher = false) {
  const id = c._id || c.course_id;
  const badge = c.publicado ? '<span class="course-card-badge badge-published">Publicado</span>' : `<span class="course-card-badge badge-${c.estado === 'terminado' ? 'ended' : 'draft'}">${c.estado || 'Borrador'}</span>`;
  const img = c.foto ? `<img src="${c.foto}" onerror="this.style.display='none'" alt=""/>` : '';
  const click = isTeacher ? `onclick="openCourseDetail('${id}')"` : `onclick="openStudentCourse('${id}','${c.codigo||''}','${(c.nombre||'').replace(/'/g,"\\'")}')"`; 
  return `<div class="course-card" ${click}>
    <div class="course-card-header">${img}<div class="course-initials">${(c.codigo||'?').slice(0,2)}</div>${badge}</div>
    <div class="course-card-body">
      <div class="course-card-code">${c.codigo||''}</div>
      <div class="course-card-name">${c.nombre||'Sin nombre'}</div>
      <div class="course-card-desc">${c.descripcion||''}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">${formatDate(c.fecha_inicio)}</div>
    </div>
  </div>`;
}

async function openCourseDetail(courseId) {
  currentCourseId = courseId;
  showSpinner();
  try {
    // Try to get course info from teacher courses
    const { ok, data } = await api('GET', `/api/courses/teacher/${currentUser._id || currentUser.user_id}`);
    if (ok && data.courses) {
      const course = data.courses.find(c => (c._id || c.course_id) === courseId);
      if (course) {
        document.getElementById('detailCode').textContent = course.codigo || '';
        document.getElementById('detailName').textContent = course.nombre || 'Curso';
        const btnPub = document.getElementById('btnPublish');
        btnPub.style.display = course.publicado ? 'none' : 'inline-flex';
      }
    }
  } catch(e) {} finally { hideSpinner(); }

  switchDetailTab('sections');
  showPage('page-course-detail');
  loadSections();
}

async function publishCourse() {
  if (!currentCourseId) return;

  const teacherId = currentUser.teacherId || currentUser._id || currentUser.user_id || currentUser.id;

  showSpinner();
  try {
    const { ok, data } = await api('PATCH', `/api/courses/${currentCourseId}/publish`, {
      teacherId: teacherId
    });

    if (ok) {
      showAlert('courseDetailAlert', '¡Curso publicado exitosamente!', 'success');
      document.getElementById('btnPublish').style.display = 'none';
    } else {
      showAlert('courseDetailAlert', data.message || 'Error al publicar.', 'danger');
    }
  } catch(e) {
    showAlert('courseDetailAlert', 'Error de conexión.', 'danger');
  } finally {
    hideSpinner();
  }
}

// ---- SECTIONS ----
async function loadSections() {
  if (!currentCourseId) return;

  const teacherId = currentUser.teacherId || currentUser._id || currentUser.user_id || currentUser.id;

  showSpinner();

  try {
    const { ok, data } = await api(
      'GET',
      `/api/courses/${currentCourseId}/sections?teacherId=${teacherId}`
    );

    if (ok && data.sections) {
      renderSections(data.sections);
    } else {
      document.getElementById('sectionsList').innerHTML =
        '<div class="text-muted-custom">Sin secciones aún. ¡Agrega tu primera sección!</div>';
    }
  } catch(e) {
    document.getElementById('sectionsList').innerHTML =
      '<div class="text-muted-custom">Error cargando secciones.</div>';
  } finally {
    hideSpinner();
  }
}

function renderSections(sections, parentId = null, depth = 0) {
  const children = sections.filter(s => (s.parent_section_id || null) === parentId);
  if (!children.length && depth === 0) {
    document.getElementById('sectionsList').innerHTML = '<div class="text-muted-custom">Sin secciones aÃºn.</div>';
    return;
  }
  if (depth === 0) document.getElementById('sectionsList').innerHTML = '';
  children.forEach(s => {
    const sId = s._id || s.section_id;
    const el = document.createElement('div');
    el.className = 'section-item' + (depth > 0 ? ' sub' : '');
    el.innerHTML = `<div class="section-header">
      <div><div class="section-title"><i class="bi bi-folder2" style="margin-right:8px;color:var(--accent);"></i>${s.titulo}</div>${s.descripcion ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${s.descripcion}</div>` : ''}</div>
      <div class="section-actions">
        <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="showAddSectionModal('${sId}')"><i class="bi bi-plus"></i> SubsecciÃ³n</button>
        <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="showAddContentModal('${sId}')"><i class="bi bi-file-plus"></i> Contenido</button>
      </div>
    </div>`;
    document.getElementById('sectionsList').appendChild(el);
    if (s.contents && s.contents.length) {
      s.contents.forEach(c => {
        const cEl = document.createElement('div');
        cEl.style.cssText = 'margin-left:'+(depth+1)*24+'px; margin-bottom:6px;';
        cEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">
          <i class="bi ${contentIcon(c.tipo)}" style="color:var(--accent2);"></i>
          <span style="font-size:13px;color:var(--text-dim);">${c.tipo}: ${c.data?.nombre_archivo || c.data?.texto?.slice(0,50) || c.data?.url || 'â\x80\x94'}</span>
        </div>`;
        document.getElementById('sectionsList').appendChild(cEl);
      });
    }
    renderSections(sections, sId, depth + 1);
  });
}

function contentIcon(tipo) {
  const icons = { texto: 'bi-file-text', documento: 'bi-file-earmark-pdf', video: 'bi-play-circle', imagen: 'bi-image' };
  return icons[tipo] || 'bi-file';
}

function showAddSectionModal(parentId) {
  document.getElementById('sectionParentId').value = parentId || '';
  document.getElementById('sectionTitle').value = '';
  document.getElementById('sectionDesc').value = '';
  document.getElementById('sectionOrder').value = '1';
  clearAlert('sectionModalAlert');
  new bootstrap.Modal(document.getElementById('modalSection')).show();
}

async function saveSection() {
  clearAlert('sectionModalAlert');

  const title = document.getElementById('sectionTitle').value.trim();
  const order = parseInt(document.getElementById('sectionOrder').value) || 1;
  const parentSectionId = document.getElementById('sectionParentId').value || null;

  const teacherId = currentUser.teacherId || currentUser._id || currentUser.user_id || currentUser.id;

  if (!title) {
    return showAlert('sectionModalAlert', 'El título es obligatorio.', 'warning');
  }

  if (!teacherId) {
    return showAlert('sectionModalAlert', 'No se encontró el teacherId. Vuelve a iniciar sesión.', 'danger');
  }

  showSpinner();

  try {
    const { ok, data } = await api('POST', `/api/courses/${currentCourseId}/sections`, {
      teacherId: teacherId,
      title: title,
      parentSectionId: parentSectionId,
      order: order
    });

    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalSection')).hide();
      loadSections();
    } else {
      showAlert('sectionModalAlert', data.message || 'Error al crear la sección.', 'danger');
    }
  } catch(e) {
    showAlert('sectionModalAlert', 'Error de conexión.', 'danger');
  } finally {
    hideSpinner();
  }
}

// ---- CONTENT ----
function showAddContentModal(sectionId) {
  document.getElementById('contentSectionId').value = sectionId;
  document.getElementById('contentType').value = 'texto';
  document.getElementById('contentText').value = '';
  document.getElementById('contentUrl').value = '';
  document.getElementById('contentFilename').value = '';
  document.getElementById('contentDuration').value = '';
  document.getElementById('contentMime').value = '';
  document.getElementById('contentOrder').value = '1';
  clearAlert('contentModalAlert');
  toggleContentFields();
  new bootstrap.Modal(document.getElementById('modalContent')).show();
}

function toggleContentFields() {
  const tipo = document.getElementById('contentType').value;
  document.getElementById('textContent').style.display = tipo === 'texto' ? 'block' : 'none';
  document.getElementById('urlContent').style.display = tipo !== 'texto' ? 'block' : 'none';
  document.getElementById('videoDuration').style.display = tipo === 'video' ? 'block' : 'none';
}

async function saveContent() {
  clearAlert('contentModalAlert');
  const sectionId = document.getElementById('contentSectionId').value;
  const tipo = document.getElementById('contentType').value;
  const orden = parseInt(document.getElementById('contentOrder').value) || 1;
  let data_obj = {};

  if (tipo === 'texto') {
    const texto = document.getElementById('contentText').value.trim();
    if (!texto) return showAlert('contentModalAlert', 'El texto es obligatorio.', 'warning');
    data_obj = { texto };
  } else {
    const url = document.getElementById('contentUrl').value.trim();
    if (!url) return showAlert('contentModalAlert', 'La URL es obligatoria.', 'warning');
    data_obj = { url, nombre_archivo: document.getElementById('contentFilename').value.trim() || null, mime_type: document.getElementById('contentMime').value.trim() || null };
    if (tipo === 'video') data_obj.duracion_segundos = parseInt(document.getElementById('contentDuration').value) || null;
  }

  showSpinner();
  try {
    const { ok, data } = await api('POST', `/api/courses/${currentCourseId}/sections/${sectionId}/content`, { tipo, orden, data: data_obj });
    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalContent')).hide();
      loadSections();
    } else {
      showAlert('contentModalAlert', data.message || 'Error al agregar contenido.', 'danger');
    }
  } catch(e) { showAlert('contentModalAlert', 'Error de conexión.', 'danger'); } finally { hideSpinner(); }
}

// ---- EVALUATIONS (TEACHER) ----
function switchDetailTab(tab) {
  ['sections','evaluations','students','messages'].forEach(t => {
    document.getElementById(`detail-tab-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`dtab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'students') loadStudentsList();
  if (tab === 'evaluations') loadEvaluationsTeacher();
  if (tab === 'messages') loadCourseThreads();
}

async function loadEvaluationsTeacher() {
  // Evaluations would come from courses content
  document.getElementById('evalList').innerHTML = '<div class="text-muted-custom">Cargando evaluaciones...</div>';
}

function showAddEvaluationModal() {
  questionsCount = 0;
  document.getElementById('evalTitle').value = '';
  document.getElementById('evalDesc').value = '';
  document.getElementById('evalStart').value = '';
  document.getElementById('evalEnd').value = '';
  document.getElementById('questionsContainer').innerHTML = '';
  clearAlert('evalModalAlert');
  addQuestion();
  new bootstrap.Modal(document.getElementById('modalEvaluation')).show();
}

function addQuestion() {
  questionsCount++;
  const qn = questionsCount;
  const div = document.createElement('div');
  div.className = 'question-block';
  div.id = `question-${qn}`;
  div.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2">
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">PREGUNTA ${qn}</div>
    <button class="btn-danger-custom" onclick="this.closest('.question-block').remove()" style="padding:4px 10px;font-size:11px;">Eliminar</button>
  </div>
  <div class="mb-2"><input type="text" class="form-control" placeholder="Enunciado de la pregunta *" id="q${qn}-text"/></div>
  <div id="q${qn}-options">
    <div class="option-row"><input type="radio" name="q${qn}-correct" class="option-radio" value="0"/><input type="text" class="form-control" placeholder="OpciÃ³n A"/></div>
    <div class="option-row"><input type="radio" name="q${qn}-correct" class="option-radio" value="1"/><input type="text" class="form-control" placeholder="OpciÃ³n B"/></div>
  </div>
  <button class="btn-outline-custom mt-2" style="padding:5px 12px;font-size:11px;" onclick="addOption(${qn})"><i class="bi bi-plus"></i> OpciÃ³n</button>
  <div style="font-size:11px;color:var(--text-muted);margin-top:6px;"><i class="bi bi-info-circle"></i> Selecciona la respuesta correcta con el cÃ\xadrculo</div>`;
  document.getElementById('questionsContainer').appendChild(div);
}

function addOption(qn) {
  const container = document.getElementById(`q${qn}-options`);
  const count = container.querySelectorAll('.option-row').length;
  const div = document.createElement('div');
  div.className = 'option-row';
  div.innerHTML = `<input type="radio" name="q${qn}-correct" class="option-radio" value="${count}"/><input type="text" class="form-control" placeholder="OpciÃ³n ${String.fromCharCode(65+count)}"/>`;
  container.appendChild(div);
}

async function saveEvaluation() {
  clearAlert('evalModalAlert');
  const titulo = document.getElementById('evalTitle').value.trim();
  const descripcion = document.getElementById('evalDesc').value.trim();
  const fecha_inicio = document.getElementById('evalStart').value;
  const fecha_fin = document.getElementById('evalEnd').value;

  if (!titulo || !fecha_inicio || !fecha_fin)
    return showAlert('evalModalAlert', 'Completa título y fechas.', 'warning');
  if (new Date(fecha_fin) <= new Date(fecha_inicio))
    return showAlert('evalModalAlert', 'La fecha de fin debe ser posterior al inicio.', 'warning');

  const preguntas = [];
  const qBlocks = document.querySelectorAll('.question-block');
  for (let i = 0; i < qBlocks.length; i++) {
    const qn = qBlocks[i].id.split('-')[1];
    const enunciado = document.getElementById(`q${qn}-text`).value.trim();
    if (!enunciado) return showAlert('evalModalAlert', `La pregunta ${i+1} no tiene enunciado.`, 'warning');
    const optionRows = qBlocks[i].querySelectorAll('.option-row');
    const correctRadio = qBlocks[i].querySelector(`input[name="q${qn}-correct"]:checked`);
    const correctIdx = correctRadio ? parseInt(correctRadio.value) : -1;
    if (correctIdx === -1) return showAlert('evalModalAlert', `Selecciona la respuesta correcta de la pregunta ${i+1}.`, 'warning');
    const opciones = [];
    optionRows.forEach((row, idx) => {
      const txt = row.querySelector('input[type="text"]').value.trim();
      if (txt) opciones.push({ texto: txt, es_correcta: idx === correctIdx });
    });
    if (opciones.length < 2) return showAlert('evalModalAlert', `La pregunta ${i+1} necesita al menos 2 opciones.`, 'warning');
    preguntas.push({ enunciado, orden: i+1, opciones });
  }
  if (!preguntas.length) return showAlert('evalModalAlert', 'Agrega al menos una pregunta.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/evaluations', { course_id: currentCourseId, titulo, descripcion, fecha_inicio, fecha_fin, preguntas });
    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalEvaluation')).hide();
      showAlert('courseDetailAlert', 'Â¡Evaluación creada!', 'success');
    } else {
      showAlert('evalModalAlert', data.message || 'Error al crear evaluación.', 'danger');
    }
  } catch(e) { showAlert('evalModalAlert', 'Error de conexión.', 'danger'); } finally { hideSpinner(); }
}

// ---- STUDENTS LIST ----
async function loadStudentsList() {
  if (!currentCourseId) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/courses/${currentCourseId}/students`);
    if (ok && data.students) {
      if (!data.students.length) {
        document.getElementById('studentsList').innerHTML = '<div class="text-muted-custom">No hay estudiantes matriculados aÃºn.</div>';
        return;
      }
      document.getElementById('studentsList').innerHTML = `<div class="card-custom" style="padding:0;overflow:hidden;">
        <table class="table-custom">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Fecha MatrÃ\xadcula</th><th>Estado</th></tr></thead>
          <tbody>${data.students.map(s => `<tr>
            <td><div class="d-flex align-items-center gap-2"><div class="friend-avatar" style="width:32px;height:32px;font-size:12px;">${getInitials(s.nombre_completo||s.username)}</div>${s.nombre_completo||'â\x80\x94'}</div></td>
            <td class="mono" style="color:var(--accent);font-size:12px;">@${s.username||'â\x80\x94'}</td>
            <td>${formatDate(s.fecha)}</td>
            <td><span class="course-card-badge badge-active">${s.estado||'activo'}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>`;
    }
  } catch(e) {} finally { hideSpinner(); }
}

// ---- COURSE THREADS (TEACHER) ----
async function loadCourseThreads() {
  if (!currentCourseId) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/messages/course/${currentCourseId}/threads`);
    if (ok && data.threads) {
      if (!data.threads.length) {
        document.getElementById('courseThreadsList').innerHTML = '<div class="text-muted-custom">Sin consultas de estudiantes.</div>';
        return;
      }
      document.getElementById('courseThreadsList').innerHTML = data.threads.map(t => `
        <div class="card-custom mb-2">
          <div class="d-flex justify-content-between align-items-start">
            <div><div style="font-weight:600;font-size:14px;">${t.sender_nombre||'Estudiante'}</div><div style="color:var(--text-dim);font-size:13px;margin-top:4px;">${t.contenido||''}</div></div>
            <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);">${formatDate(t.fecha)}</div>
          </div>
          <div class="mt-3">
            <textarea class="form-control mb-2" id="reply-${t._id}" rows="2" placeholder="Responde aquÃ\xad..."></textarea>
            <button class="btn-outline-custom" style="padding:6px 14px;font-size:12px;" onclick="replyToThread('${t._id}')"><i class="bi bi-reply"></i> Responder</button>
          </div>
        </div>`).join('');
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function replyToThread(threadId) {
  const contenido = document.getElementById(`reply-${threadId}`).value.trim();
  if (!contenido) return;
  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/messages/course', {
      course_id: currentCourseId,
      sender_id: currentUser._id || currentUser.user_id,
      contenido,
      tipo: 'respuesta',
      respuesta_a: threadId
    });
    if (ok) { document.getElementById(`reply-${threadId}`).value = ''; showAlert('courseDetailAlert', 'Respuesta enviada.', 'success'); }
  } catch(e) {} finally { hideSpinner(); }
}

// ---- CLONE COURSE ----
function showCloneModal() {
  document.getElementById('cloneCode').value = '';
  document.getElementById('cloneName').value = '';
  document.getElementById('cloneStart').value = '';
  document.getElementById('cloneEnd').value = '';
  clearAlert('cloneAlert');
  new bootstrap.Modal(document.getElementById('modalClone')).show();
}

async function doClone() {
  clearAlert('cloneAlert');
  const codigo = document.getElementById('cloneCode').value.trim();
  const nombre = document.getElementById('cloneName').value.trim();
  const fecha_inicio = document.getElementById('cloneStart').value;
  const fecha_fin = document.getElementById('cloneEnd').value || null;
  if (!codigo || !nombre || !fecha_inicio) return showAlert('cloneAlert', 'Completa todos los campos obligatorios.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('POST', `/api/courses/${currentCourseId}/clone`, { codigo, nombre, fecha_inicio, fecha_fin });
    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalClone')).hide();
      showAlert('courseDetailAlert', 'Â¡Curso clonado exitosamente!', 'success');
      setTimeout(() => showPage('page-my-courses'), 1200);
    } else {
      showAlert('cloneAlert', data.message || 'Error al clonar.', 'danger');
    }
  } catch(e) { showAlert('cloneAlert', 'Error de conexiÃ³n.', 'danger'); } finally { hideSpinner(); }
}

// ===============================================
//  SEARCH COURSES
// ===============================================
async function searchCourses() {
  clearAlert('searchAlert');
  const q = document.getElementById('searchQuery').value.trim();
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/enrollments/search${q ? '?q='+encodeURIComponent(q) : ''}`);
    if (ok && data.courses) {
      if (!data.courses.length) {
        document.getElementById('searchResults').innerHTML = '<div class="text-muted-custom">No se encontraron cursos.</div>';
        return;
      }
      document.getElementById('searchResults').innerHTML = data.courses.map(c => {
        const id = c._id || c.course_id;
        return `<div class="course-card">
          <div class="course-card-header"><div class="course-initials">${(c.codigo||'?').slice(0,2)}</div><span class="course-card-badge badge-published">Publicado</span></div>
          <div class="course-card-body">
            <div class="course-card-code">${c.codigo||''}</div>
            <div class="course-card-name">${c.nombre||'Sin nombre'}</div>
            <div class="course-card-desc">${c.descripcion||''}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">${formatDate(c.fecha_inicio)}</div>
            <button class="btn-primary-custom mt-3" onclick="enrollCourse('${id}')"><i class="bi bi-plus-circle"></i> Matricularse</button>
          </div>
        </div>`;
      }).join('');
    } else {
      showAlert('searchAlert', data.message || 'Error al buscar cursos.', 'danger');
    }
  } catch(e) { showAlert('searchAlert', 'Error de conexiÃ³n.', 'danger'); } finally { hideSpinner(); }
}

async function enrollCourse(courseId) {
  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/enrollments', { user_id: currentUser._id || currentUser.user_id, course_id: courseId });
    if (ok) {
      showAlert('searchAlert', 'Â¡Te has matriculado exitosamente!', 'success');
    } else {
      showAlert('searchAlert', data.message || 'Error al matricularse.', 'danger');
    }
  } catch(e) { showAlert('searchAlert', 'Error de conexiÃ³n.', 'danger'); } finally { hideSpinner(); }
}

// ===============================================
//  ENROLLED COURSES (STUDENT)
// ===============================================
async function loadEnrolledCourses() {
  if (!currentUser) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/enrollments/student/${currentUser._id || currentUser.user_id}`);
    if (ok && data.enrollments) {
      if (!data.enrollments.length) {
        document.getElementById('enrolledGrid').innerHTML = '<div class="text-muted-custom">No estÃ¡s matriculado en ningÃºn curso. Â¡Explora los cursos disponibles!</div>';
        return;
      }
      document.getElementById('enrolledGrid').innerHTML = data.enrollments.map(e => renderCourseCard(e, false)).join('');
    }
  } catch(e) {} finally { hideSpinner(); }
}

function openStudentCourse(courseId, codigo, nombre) {
  currentStudentCourseId = courseId;
  document.getElementById('studentDetailCode').textContent = codigo;
  document.getElementById('studentDetailName').textContent = nombre;
  switchStudentTab('content');
  showPage('page-student-course');
  loadStudentContent();
}

function switchStudentTab(tab) {
  ['content','evaluations','classmates','queries'].forEach(t => {
    document.getElementById(`student-tab-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`stab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'evaluations') loadStudentEvals();
  if (tab === 'classmates') loadClassmates();
  if (tab === 'queries') loadStudentQueries();
}

async function loadStudentContent() {
  if (!currentStudentCourseId) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/enrollments/${currentStudentCourseId}/content`);
    if (ok && data.sections) {
      if (!data.sections.length) {
        document.getElementById('studentSections').innerHTML = '<div class="text-muted-custom">Este curso aÃºn no tiene contenido.</div>';
        return;
      }
      document.getElementById('studentSections').innerHTML = data.sections.filter(s => !s.parent_section_id).map(s => renderStudentSection(s, data.sections)).join('');
    }
  } catch(e) {} finally { hideSpinner(); }
}

function renderStudentSection(section, allSections, depth = 0) {
  const children = allSections.filter(s => s.parent_section_id === (section._id || section.section_id));
  return `<div class="section-item" style="${depth > 0 ? 'margin-left:'+depth*20+'px;' : ''}">
    <div class="section-title"><i class="bi bi-${children.length ? 'folder2-open' : 'file-text'}" style="margin-right:8px;color:var(--accent);"></i>${section.titulo}</div>
    ${section.descripcion ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${section.descripcion}</div>` : ''}
    ${(section.contents||[]).map(c => `<div style="margin-top:8px;padding:8px 12px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">
      <div class="d-flex align-items-center gap-2"><i class="bi ${contentIcon(c.tipo)}" style="color:var(--accent2);"></i>
      <span style="font-size:13px;">${c.tipo === 'texto' ? (c.data?.texto?.slice(0,100)+'...') : (c.data?.nombre_archivo || c.data?.url || c.tipo)}</span></div>
    </div>`).join('')}
    ${children.map(ch => renderStudentSection(ch, allSections, depth+1)).join('')}
  </div>`;
}

// ---- STUDENT EVALUATIONS ----
async function loadStudentEvals() {
  document.getElementById('studentEvals').innerHTML = '<div class="text-muted-custom">Cargando evaluaciones...</div>';
  // Fetch results
  try {
    const { ok, data } = await api('GET', `/api/evaluations/student/${currentUser._id||currentUser.user_id}/course/${currentStudentCourseId}`);
    if (ok) {
      const results = data.submissions || [];
      document.getElementById('studentEvals').innerHTML = results.length
        ? `<div style="margin-bottom:16px;font-weight:600;">Resultados de Evaluaciones</div>
          <table class="table-custom" style="background:var(--surface);border-radius:var(--radius);"><thead><tr><th>EvaluaciÃ³n</th><th>Fecha</th><th>CalificaciÃ³n</th><th>Correctas</th></tr></thead>
          <tbody>${results.map(r => `<tr><td>${r.evaluation_id||'â\x80\x94'}</td><td>${formatDate(r.fecha)}</td>
          <td style="color:${r.calificacion>=70?'var(--accent)':'var(--danger)'}; font-weight:700;">${r.calificacion?.toFixed(1)||0}%</td>
          <td>${r.correctas||0}/${r.total_preguntas||0}</td></tr>`).join('')}</tbody></table>`
        : '<div class="text-muted-custom">No has realizado evaluaciones aÃºn.</div>';
    }
  } catch(e) {}
}

async function loadClassmates() {
  if (!currentStudentCourseId) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/social/courses/${currentStudentCourseId}/mates`);
    if (ok && data.classmates) {
      document.getElementById('classmatesList').innerHTML = data.classmates.length
        ? data.classmates.map(u => `<div class="friend-card">
            <div class="friend-avatar">${getInitials(u.nombre||u.username)}</div>
            <div><div class="friend-name">${u.nombre||u.nombre_completo||'â\x80\x94'}</div><div class="friend-username">@${u.username||'â\x80\x94'}</div></div>
          </div>`).join('')
        : '<div class="text-muted-custom">No hay otros compaÃ±eros en este curso.</div>';
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function loadStudentQueries() {
  if (!currentStudentCourseId) return;
  try {
    const { ok, data } = await api('GET', `/api/messages/course/${currentStudentCourseId}/threads`);
    if (ok && data.threads) {
      const myThreads = (data.threads || []).filter(t => t.sender_id === (currentUser._id || currentUser.user_id));
      document.getElementById('queryThreadsList').innerHTML = myThreads.length
        ? myThreads.map(t => `<div class="card-custom mb-2">
            <div style="font-size:13px;color:var(--text-dim);">${t.contenido}</div>
            <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:6px;">${formatDate(t.fecha)}</div>
          </div>`).join('')
        : '<div class="text-muted-custom">No tienes consultas enviadas.</div>';
    }
  } catch(e) {}
}

async function sendQuery() {
  const contenido = document.getElementById('newQueryText').value.trim();
  if (!contenido) return;
  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/messages/course', {
      course_id: currentStudentCourseId,
      sender_id: currentUser._id || currentUser.user_id,
      contenido, tipo: 'consulta'
    });
    if (ok) {
      document.getElementById('newQueryText').value = '';
      loadStudentQueries();
    }
  } catch(e) {} finally { hideSpinner(); }
}

// ===============================================
//  SOCIAL â\x80\x94 FRIENDS
// ===============================================
async function searchUsers() {
  const q = document.getElementById('searchUserQuery').value.trim();
  if (!q) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/social/users/search?q=${encodeURIComponent(q)}`);
    if (ok && data.users) {
      document.getElementById('userSearchResults').innerHTML = data.users.length
        ? data.users.map(u => `<div class="friend-card">
            <div class="friend-avatar">${getInitials(u.nombre||u.nombre_completo||u.username)}</div>
            <div style="flex:1;"><div class="friend-name">${u.nombre||u.nombre_completo||'â\x80\x94'}</div><div class="friend-username">@${u.username}</div></div>
            <button class="btn-outline-custom" style="padding:5px 12px;font-size:11px;" onclick="sendFriendRequest('${u.user_id||u._id}')"><i class="bi bi-person-plus"></i></button>
          </div>`).join('')
        : '<div class="text-muted-custom">No se encontraron usuarios.</div>';
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function sendFriendRequest(userId) {
  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/social/friends/request', { requester_id: currentUser._id || currentUser.user_id, requested_id: userId });
    if (ok) alert('Solicitud de amistad enviada.');
    else alert(data.message || 'Error al enviar solicitud.');
  } catch(e) {} finally { hideSpinner(); }
}

async function loadFriends() {
  if (!currentUser) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/social/friends/${currentUser._id || currentUser.user_id}`);
    if (ok && data.friends) {
      document.getElementById('friendsList').innerHTML = data.friends.length
        ? data.friends.map(f => `<div class="friend-card">
            <div class="friend-avatar">${getInitials(f.nombre||f.nombre_completo||f.username)}</div>
            <div style="flex:1;"><div class="friend-name">${f.nombre||f.nombre_completo||'â\x80\x94'}</div><div class="friend-username">@${f.username||'â\x80\x94'}</div></div>
            <div class="d-flex gap-2">
              <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="viewFriendCourses('${f.user_id||f._id}','${f.nombre||f.username}')"><i class="bi bi-mortarboard"></i></button>
              <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="openConversation('${f.user_id||f._id}','${f.nombre||f.username}')"><i class="bi bi-chat"></i></button>
            </div>
          </div>`).join('')
        : '<div class="text-muted-custom">No tienes amigos aún. ¡Busca y agrega compañeros!</div>';
      document.getElementById('statFriends').textContent = data.friends.length;
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function viewFriendCourses(friendId, friendName) {
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/social/friends/${friendId}/courses`);
    if (ok && data.courses) {
      document.getElementById('friendCoursesTitle').textContent = `Cursos de ${friendName}`;
      document.getElementById('friendCoursesList').innerHTML = data.courses.length
        ? `<table class="table-custom"><thead><tr><th>Rol</th><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
          <tbody>${data.courses.map(c => `<tr>
            <td><span class="course-card-badge ${c.rol==='TEACHES'?'badge-published':'badge-active'}">${c.rol==='TEACHES'?'Docente':'Estudiante'}</span></td>
            <td class="mono" style="font-size:12px;">${c.codigo||'â\x80\x94'}</td><td>${c.nombre||'â\x80\x94'}</td>
            <td><span class="course-card-badge badge-${c.estado==='activo'?'active':'ended'}">${c.estado}</span></td>
          </tr>`).join('')}</tbody></table>`
        : '<div class="text-muted-custom">Este usuario no tiene cursos.</div>';
      new bootstrap.Modal(document.getElementById('modalFriendCourses')).show();
    }
  } catch(e) {} finally { hideSpinner(); }
}

// ===============================================
//  DIRECT MESSAGES
// ===============================================
async function loadConversations() {
  if (!currentUser) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/messages/conversations/${currentUser._id || currentUser.user_id}`);
    if (ok && data.conversations) {
      document.getElementById('conversationsList').innerHTML = data.conversations.length
        ? data.conversations.map(c => `<div class="friend-card" onclick="openConversation('${c.user_id||c._id}','${c.username||''}')">
            <div class="friend-avatar" style="width:36px;height:36px;font-size:13px;">${getInitials(c.username||'?')}</div>
            <div style="flex:1;min-width:0;"><div class="friend-name" style="font-size:13px;">${c.username||'â\x80\x94'}</div><div class="friend-username" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.preview||''}</div></div>
          </div>`).join('')
        : '<div class="text-muted-custom" style="font-size:13px;">Sin conversaciones</div>';
      document.getElementById('statMessages').textContent = data.conversations.length;
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function openConversation(userId, name) {
  currentChatUserId = userId;
  document.getElementById('chatWithName').textContent = name || userId;
  document.getElementById('chatWithId').textContent = userId;
  document.getElementById('chatAvatarInitial').textContent = getInitials(name || '?');
  document.getElementById('chatPanel').style.display = 'block';
  document.getElementById('chatPlaceholder').style.display = 'none';
  if (document.getElementById('page-messages').classList.contains('active') === false) showPage('page-messages');
  await loadDirectMessages();
}

async function loadDirectMessages() {
  if (!currentChatUserId || !currentUser) return;
  try {
    const myId = currentUser._id || currentUser.user_id;
    const { ok, data } = await api('GET', `/api/messages/direct/${myId}/${currentChatUserId}`);
    if (ok && data.messages) {
      const win = document.getElementById('chatMessages');
      win.innerHTML = data.messages.map(m => {
        const isSent = m.sender_id === myId;
        return `<div>
          <div class="message-bubble ${isSent ? 'sent' : 'received'}">${m.contenido}</div>
          <div class="message-meta" style="${isSent ? 'text-align:right;' : ''}">${formatDate(m.fecha)}</div>
        </div>`;
      }).join('') || '<div class="text-muted-custom" style="text-align:center;margin-top:40px;">Inicia la conversaciÃ³n</div>';
      win.scrollTop = win.scrollHeight;
    }
  } catch(e) {}
}

async function sendDirectMessage() {
  const contenido = document.getElementById('msgInput').value.trim();
  if (!contenido || !currentChatUserId) return;
  showSpinner();
  try {
    const { ok } = await api('POST', '/api/messages/direct', {
      sender_id: currentUser._id || currentUser.user_id,
      receiver_id: currentChatUserId,
      contenido
    });
    if (ok) {
      document.getElementById('msgInput').value = '';
      await loadDirectMessages();
    }
  } catch(e) {} finally { hideSpinner(); }
}

// ===============================================
//  PASSWORD
// ===============================================
async function changePassword() {
  clearAlert('pwChangeAlert');
  const current_password = document.getElementById('pwCurrent').value;
  const new_password = document.getElementById('pwNew').value;
  const confirm = document.getElementById('pwConfirm').value;

  if (!current_password || !new_password || !confirm)
    return showAlert('pwChangeAlert', 'Completa todos los campos.', 'warning');
  if (new_password !== confirm)
    return showAlert('pwChangeAlert', 'Las contraseñas nuevas no coinciden.', 'danger');
  if (new_password.length < 8)
    return showAlert('pwChangeAlert', 'La nueva contraseña debe tener al menos 8 caracteres.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('PUT', '/api/password/change', {
      user_id: currentUser._id || currentUser.user_id,
      current_password, new_password
    });
    if (ok) {
      showAlert('pwChangeAlert', 'Â¡Contraseña actualizada exitosamente!', 'success');
      document.getElementById('pwCurrent').value = '';
      document.getElementById('pwNew').value = '';
      document.getElementById('pwConfirm').value = '';
    } else {
      showAlert('pwChangeAlert', data.message || 'Error al cambiar contraseña.', 'danger');
    }
  } catch(e) { showAlert('pwChangeAlert', 'Error de conexión.', 'danger'); } finally { hideSpinner(); }
}

async function invalidateAllSessions() {
  clearAlert('sessionAlert');
  if (!confirm('Â¿Cerrar todas las sesiones activas?')) return;
  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/session/invalidate-all', { user_id: currentUser._id || currentUser.user_id });
    if (ok) showAlert('sessionAlert', 'Todas las sesiones han sido cerradas.', 'success');
    else showAlert('sessionAlert', data.message || 'Error al cerrar sesiones.', 'danger');
  } catch(e) { showAlert('sessionAlert', 'Error de conexión.', 'danger'); } finally { hideSpinner(); }
}

// ===============================================
//  DB HEALTH
// ===============================================
async function loadHealthCheck() {
  document.getElementById('healthGrid').innerHTML = '<div class="text-muted-custom">Verificando conexiones...</div>';
  showSpinner();
  try {
    const { ok, data } = await api('GET', '/api/health');
    const dbs = data.databases || {};
    const dbNames = { mongodb: 'MongoDB', redis: 'Redis', neo4j: 'Neo4j', cassandra: 'Cassandra' };
    const dbIcons = { mongodb: 'bi-database', redis: 'bi-lightning', neo4j: 'bi-diagram-3', cassandra: 'bi-hdd-stack' };
    document.getElementById('healthGrid').innerHTML = Object.entries(dbNames).map(([key, label]) => {
      const status = dbs[key];
      const isOk = status === 'ok' || status === 'connected' || status === true;
      return `<div class="health-card">
        <i class="bi ${dbIcons[key]}" style="font-size:32px;color:${isOk?'var(--accent)':'var(--danger)'};margin-bottom:12px;"></i>
        <div style="font-weight:700;margin-bottom:8px;">${label}</div>
        <div><span class="health-dot ${isOk?'ok':'err'}"></span><span style="font-size:13px;color:${isOk?'var(--accent)':'var(--danger)'};">${isOk?'Conectado':'Error'}</span></div>
        <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:6px;">${typeof status === 'string' ? status : (isOk?'online':'offline')}</div>
      </div>`;
    }).join('');
  } catch(e) {
    document.getElementById('healthGrid').innerHTML = '<div class="alert-custom alert-danger"><i class="bi bi-exclamation-triangle"></i> No se pudo conectar al servidor.</div>';
  } finally { hideSpinner(); }
}

// ===============================================
//  ADMIN
// ===============================================
function switchAdminTab(tab) {
  ['activity','security','audit','logins'].forEach(t => {
    document.getElementById(`admin-tab-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`atab-${t}`).classList.toggle('active', t === tab);
  });
}

async function loadUserActivity() {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/admin/activity/${userId}`);
    if (ok && data.events) {
      document.getElementById('activityTable').innerHTML = renderTable(
        ['AcciÃ³n', 'Entidad', 'Resultado', 'IP', 'Fecha'],
        data.events.map(e => [e.accion||'â\x80\x94', e.entidad||'â\x80\x94', e.resultado||'â\x80\x94', e.ip||'â\x80\x94', formatDate(e.timestamp)])
      );
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function loadSecurityEvents() {
  showSpinner();
  try {
    const { ok, data } = await api('GET', '/api/admin/security-events');
    if (ok && data.events) {
      document.getElementById('securityTable').innerHTML = renderTable(
        ['Usuario', 'Tipo', 'IP', 'Notificado', 'Fecha'],
        data.events.map(e => [e.user_id||'â\x80\x94', e.tipo||'â\x80\x94', e.ip||'â\x80\x94', e.notificado?'SÃ\xad':'No', formatDate(e.timestamp)])
      );
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function loadAuditTrail() {
  const table = document.getElementById('auditTable').value.trim();
  if (!table) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/admin/audit/${table}`);
    if (ok && data.logs) {
      document.getElementById('auditTrailTable').innerHTML = renderTable(
        ['Usuario', 'AcciÃ³n', 'Entidad', 'Resultado', 'IP', 'Fecha'],
        data.logs.map(l => [l.user_id||'â\x80\x94', l.accion||'â\x80\x94', l.entidad||'â\x80\x94', l.resultado||'â\x80\x94', l.ip||'â\x80\x94', formatDate(l.timestamp)])
      );
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function loadLoginAttempts() {
  const userId = document.getElementById('loginAttemptUserId').value.trim();
  if (!userId) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/admin/login-attempts/${userId}`);
    if (ok && data.attempts) {
      document.getElementById('loginAttemptsTable').innerHTML = renderTable(
        ['IP', 'Dispositivo', 'Exitoso', 'Motivo Fallo', 'Fecha'],
        data.attempts.map(a => [a.ip||'â\x80\x94', a.dispositivo||'â\x80\x94', a.exitoso?'â\x9c\x85':'â\x9d\x8c', a.motivo_fallo||'â\x80\x94', formatDate(a.timestamp)])
      );
    }
  } catch(e) {} finally { hideSpinner(); }
}

async function loadLoginAttemptsByIp() {
  const ip = document.getElementById('loginAttemptUserId').value.trim();
  if (!ip) return;
  showSpinner();
  try {
    const { ok, data } = await api('GET', `/api/admin/login-attempts-ip/${encodeURIComponent(ip)}`);
    if (ok && data.attempts) {
      document.getElementById('loginAttemptsTable').innerHTML = renderTable(
        ['Usuario', 'Dispositivo', 'Exitoso', 'Fecha'],
        data.attempts.map(a => [a.user_id||'â\x80\x94', a.dispositivo||'â\x80\x94', a.exitoso?'â\x9c\x85':'â\x9d\x8c', formatDate(a.timestamp)])
      );
    }
  } catch(e) {} finally { hideSpinner(); }
}

function renderTable(headers, rows) {
  if (!rows || !rows.length) return '<div class="text-muted-custom">Sin datos para mostrar.</div>';
  return `<div class="card-custom" style="padding:0;overflow:hidden;overflow-x:auto;">
    <table class="table-custom">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

// ===============================================
//  INIT
// ===============================================
document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Initialize â\x80\x94 show auth page
showPage('page-auth');
