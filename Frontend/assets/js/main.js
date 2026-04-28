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
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric' });
}




// ===============================================
//  HTML
// ===============================================

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
//  AUTH — TAB SWITCH
// ===============================================
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  clearAlert('auth-alert');
}

// ===============================================
//  AUTH — LOGIN
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
//  AUTH — REGISTER
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
      showAlert('auth-alert', '¡Cuenta creada exitosamente! Ahora inicia sesión.', 'success');
      switchAuthTab('login');
    } else {
      showAlert('auth-alert', data.message || 'Error al registrar. Intenta de nuevo.', 'danger');
    }
  } catch(e) {
    showAlert('auth-alert', 'Error de conexión.', 'danger');
  } finally { hideSpinner(); }
}

// ===============================================
//  AUTH — FORGOT PASSWORD
// ===============================================
async function doForgotPassword() {
  clearAlert('forgot-alert');
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) return showAlert('forgot-alert', 'Ingresa tu correo electrónico.', 'warning');

  showSpinner();
  try {
    const { ok, data } = await api('POST', '/api/password/forgot', { email });
    if (ok) {
      showAlert('forgot-alert', 'Se ha enviado un enlace de recuperación a tu correo.', 'success');
    } else {
      showAlert('forgot-alert', data.message || 'Error al enviar el correo.', 'danger');
    }
  } catch(e) {
    showAlert('forgot-alert', 'Error de conexión.', 'danger');
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
          <div style="width:36px;height:36px;background:var(--surface2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;">📚</div>
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
        document.getElementById('myCoursesGrid').innerHTML = '<div class="text-muted-custom">No has creado ningún curso aún. ¡Crea tu primer curso!</div>';
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
  const list = document.getElementById('sectionsList');

  if (depth === 0) {
    list.innerHTML = '';
  }

  const children = sections.filter(s => {
    const parent = s.parentSectionId || s.parent_section_id || null;
    return parent === parentId;
  });

  if (!children.length && depth === 0) {
    list.innerHTML = '<div class="text-muted-custom">Sin secciones aún.</div>';
    return;
  }

  children.forEach(s => {
    const sId = s._id || s.sectionId || s.section_id;
    const title = s.title || s.titulo || 'Sin título';
    const descripcion = s.descripcion || '';

    const el = document.createElement('div');
    el.className = 'section-item' + (depth > 0 ? ' sub' : '');
    el.style.marginLeft = `${depth * 22}px`;

    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">
            <i class="bi bi-folder2" style="margin-right:8px;color:var(--accent);"></i>
            ${escapeHtml(title)}
          </div>
          ${
            descripcion
              ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${escapeHtml(descripcion)}</div>`
              : ''
          }
        </div>

        <div class="section-actions">
          <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="showAddSectionModal('${sId}')">
            <i class="bi bi-plus"></i> Subsección
          </button>
          <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="showAddContentModal('${sId}')">
            <i class="bi bi-file-plus"></i> Contenido
          </button>
        </div>
      </div>
    `;

    list.appendChild(el);

    if (s.contents && s.contents.length) {
      s.contents.forEach(c => {
        const cEl = document.createElement('div');
        cEl.style.cssText = `margin-left:${(depth + 1) * 24}px; margin-bottom:6px;`;

        cEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">
            <i class="bi ${contentIcon(c.tipo || c.type)}" style="color:var(--accent2);"></i>
            <span style="font-size:13px;color:var(--text-dim);">
              ${(c.tipo || c.type)}: ${escapeHtml(c.data?.nombre_archivo || c.data?.texto?.slice(0,50) || c.data?.url || '—')}
            </span>
          </div>
        `;

        list.appendChild(cEl);
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
  const descripcion = document.getElementById('sectionDesc')?.value.trim() || '';
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
      teacherId,
      title,
      descripcion,
      parentSectionId,
      order
    });

    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalSection')).hide();

      document.getElementById('sectionTitle').value = '';
      if (document.getElementById('sectionDesc')) document.getElementById('sectionDesc').value = '';
      document.getElementById('sectionOrder').value = '1';
      document.getElementById('sectionParentId').value = '';

      await loadSections();

      showAlert('courseDetailAlert', data.message || 'Sección creada correctamente.', 'success');
    } else {
      showAlert('sectionModalAlert', data.message || 'Error al crear la sección.', 'danger');
    }
  } catch (e) {
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
  const evalList = document.getElementById('evalList');
  evalList.innerHTML = '<div class="text-muted-custom">Cargando evaluaciones...</div>';

  const teacherId = currentUser._id || currentUser.user_id || currentUser.id;

  try {
    const { ok, data } = await api(
      'GET',
      `/api/evaluations/course/${currentCourseId}/teacher?teacherId=${teacherId}`
    );

    if (!ok) {
      evalList.innerHTML = `<div class="text-muted-custom">${data.message || 'No se pudieron cargar las evaluaciones.'}</div>`;
      return;
    }

    const evaluations = data.evaluations || [];

    evalList.innerHTML = evaluations.length
      ? evaluations.map(e => `
        <div class="card-custom mb-2">
          <div style="font-weight:700;">${escapeHtml(e.title)}</div>
          <div class="text-muted-custom">${escapeHtml(e.descripcion || 'Sin descripción')}</div>
          <div style="font-size:12px;margin-top:8px;">
            Inicio: ${formatDate(e.startDate)} | Fin: ${formatDate(e.endDate)}
          </div>
          <div style="font-size:12px;">Preguntas: ${e.total_preguntas}</div>
        </div>
      `).join('')
      : '<div class="text-muted-custom">Sin evaluaciones creadas.</div>';

  } catch (e) {
    evalList.innerHTML = '<div class="text-muted-custom">Error de conexión.</div>';
  }
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
    <div class="option-row"><input type="radio" name="q${qn}-correct" class="option-radio" value="0"/><input type="text" class="form-control" placeholder="Opción A"/></div>
    <div class="option-row"><input type="radio" name="q${qn}-correct" class="option-radio" value="1"/><input type="text" class="form-control" placeholder="Opción B"/></div>
  </div>
  <button class="btn-outline-custom mt-2" style="padding:5px 12px;font-size:11px;" onclick="addOption(${qn})"><i class="bi bi-plus"></i> Opción</button>
  <div style="font-size:11px;color:var(--text-muted);margin-top:6px;"><i class="bi bi-info-circle"></i> Selecciona la respuesta correcta con el círculo</div>`;
  document.getElementById('questionsContainer').appendChild(div);
}

function addOption(qn) {
  const container = document.getElementById(`q${qn}-options`);
  const count = container.querySelectorAll('.option-row').length;
  const div = document.createElement('div');
  div.className = 'option-row';
  div.innerHTML = `<input type="radio" name="q${qn}-correct" class="option-radio" value="${count}"/><input type="text" class="form-control" placeholder="Opción ${String.fromCharCode(65+count)}"/>`;
  container.appendChild(div);
}

async function saveEvaluation() {
  clearAlert('evalModalAlert');

  const title = document.getElementById('evalTitle').value.trim();
  const descripcion = document.getElementById('evalDesc').value.trim();
  const startDate = document.getElementById('evalStart').value;
  const endDate = document.getElementById('evalEnd').value;

  if (!title || !startDate || !endDate) {
    return showAlert('evalModalAlert', 'Completa título y fechas.', 'warning');
  }

  if (new Date(endDate) <= new Date(startDate)) {
    return showAlert('evalModalAlert', 'La fecha de fin debe ser posterior al inicio.', 'warning');
  }

  const questions = [];
  const qBlocks = document.querySelectorAll('.question-block');

  for (let i = 0; i < qBlocks.length; i++) {
    const qn = qBlocks[i].id.split('-')[1];
    const text = document.getElementById(`q${qn}-text`).value.trim();

    if (!text) {
      return showAlert('evalModalAlert', `La pregunta ${i + 1} no tiene enunciado.`, 'warning');
    }

    const optionRows = qBlocks[i].querySelectorAll('.option-row');
    const correctRadio = qBlocks[i].querySelector(`input[name="q${qn}-correct"]:checked`);
    const correctIdx = correctRadio ? parseInt(correctRadio.value) : -1;

    if (correctIdx === -1) {
      return showAlert('evalModalAlert', `Selecciona la respuesta correcta de la pregunta ${i + 1}.`, 'warning');
    }

    const options = [];
    let correctOptionId = null;

    optionRows.forEach((row, idx) => {
      const optionText = row.querySelector('input[type="text"]').value.trim();

      if (optionText) {
        const optionId = `q${i + 1}_op${idx + 1}`;

        options.push({
          optionId,
          text: optionText
        });

        if (idx === correctIdx) {
          correctOptionId = optionId;
        }
      }
    });

    if (options.length < 2) {
      return showAlert('evalModalAlert', `La pregunta ${i + 1} necesita al menos 2 opciones.`, 'warning');
    }

    if (!correctOptionId) {
      return showAlert('evalModalAlert', `La respuesta correcta de la pregunta ${i + 1} está vacía.`, 'warning');
    }

    questions.push({
      text,
      orden: i + 1,
      options,
      correctOptionId
    });
  }

  if (!questions.length) {
    return showAlert('evalModalAlert', 'Agrega al menos una pregunta.', 'warning');
  }

  const teacherId = currentUser._id || currentUser.user_id || currentUser.id;

  showSpinner();

  try {
    const { ok, data } = await api('POST', '/api/evaluations', {
      courseId: currentCourseId,
      teacherId,
      title,
      descripcion,
      startDate,
      endDate,
      questions
    });

    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalEvaluation')).hide();
      showAlert('courseDetailAlert', '¡Evaluación creada!', 'success');

      await loadEvaluationsTeacher();
    } else {
      showAlert('evalModalAlert', data.message || 'Error al crear evaluación.', 'danger');
    }

  } catch (e) {
    console.error(e);
    showAlert('evalModalAlert', 'Error de conexión.', 'danger');
  } finally {
    hideSpinner();
  }
}

window.saveEvaluation = saveEvaluation;

// ---- STUDENTS LIST ----
async function loadStudentsList() {
  if (!currentCourseId || !currentUser) return;

  const studentsList = document.getElementById('studentsList');
  if (!studentsList) return;

  const teacherId = currentUser._id || currentUser.user_id || currentUser.id;

  showSpinner();

  try {
    const { ok, data } = await api(
      'GET',
      `/api/courses/${currentCourseId}/students?teacherId=${teacherId}`
    );

    if (!ok) {
      studentsList.innerHTML = `
        <div class="text-muted-custom">
          ${data.message || 'Error al cargar estudiantes.'}
        </div>
      `;
      return;
    }

    if (!data.students || !data.students.length) {
      studentsList.innerHTML =
        '<div class="text-muted-custom">No hay estudiantes matriculados aún.</div>';
      return;
    }

    studentsList.innerHTML = `
      <div class="card-custom" style="padding:0;overflow:hidden;">
        <table class="table-custom">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Fecha Matrícula</th>
              
            </tr>
          </thead>
          <tbody>
            ${data.students.map(s => {
              const name = s.fullName || s.nombre_completo || s.username || '—';
              const username = s.username || '—';
              const date = s.enrolledAt || s.fecha;

              return `
                <tr>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <div class="friend-avatar" style="width:32px;height:32px;font-size:12px;">
                        ${getInitials(name)}
                      </div>
                      ${name}
                    </div>
                  </td>
                  <td class="mono" style="color:var(--accent);font-size:12px;">
                    @${username}
                  </td>
                  <td>${formatDate(date)}</td>
                  <td>
                    <span class="course-card-badge badge-active">activo</span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

  } catch (e) {
    console.error(e);
    studentsList.innerHTML =
      '<div class="text-muted-custom">Error de conexión al cargar estudiantes.</div>';
  } finally {
    hideSpinner();
  }
}





// ---- COURSE THREADS (TEACHER) ----
async function loadCourseThreads() {
  if (!currentCourseId) return;

  showSpinner();

  try {
    const userId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api(
      'GET',
      `/api/messages/course/${currentCourseId}/threads?userId=${userId}`
    );

    if (!ok || !data.threads || data.threads.length === 0) {
      document.getElementById('courseThreadsList').innerHTML =
        '<div class="text-muted-custom">Sin consultas de estudiantes.</div>';
      return;
    }

    document.getElementById('courseThreadsList').innerHTML = data.threads.map(t => {
      const studentName =
        t.student?.fullName ||
        t.student?.nombre_completo ||
        t.student?.username ||
        'Estudiante';

      const username = t.student?.username ? `@${t.student.username}` : '';
      const lastText = t.lastMessage?.contenido || t.subject || 'Sin contenido';
      const lastDate = t.lastMessage?.sentAt || t.updatedAt || t.createdAt;

      return `
        <div class="card-custom mb-2">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div style="font-weight:600;font-size:14px;">
                ${escapeHtml(studentName)}
              </div>
              <div style="color:var(--accent);font-size:12px;">
                ${escapeHtml(username)}
              </div>
              <div style="color:var(--text-dim);font-size:13px;margin-top:6px;">
                ${escapeHtml(lastText)}
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
                Estado: ${escapeHtml(t.status || 'open')}
              </div>
            </div>
            <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);">
              ${formatDate(lastDate)}
            </div>
          </div>

          <div id="thread-messages-${t._id}" class="mt-3"></div>

          <div class="mt-3">
            <button class="btn-outline-custom mb-2" style="padding:6px 14px;font-size:12px;" onclick="loadThreadMessages('${t._id}')">
              <i class="bi bi-eye"></i> Ver conversación
            </button>

            <textarea class="form-control mb-2" id="reply-${t._id}" rows="2" placeholder="Responde aquí..."></textarea>

            <button class="btn-outline-custom" style="padding:6px 14px;font-size:12px;" onclick="replyToThread('${t._id}')">
              <i class="bi bi-reply"></i> Responder
            </button>

            <button class="btn-outline-custom" style="padding:6px 14px;font-size:12px;" onclick="ReplyToThread('${t._id}')">
              <i class="bi bi-check-circle"></i> Quitar de cola
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error(e);
    document.getElementById('courseThreadsList').innerHTML =
      '<div class="text-muted-custom">Error al cargar consultas.</div>';
  } finally {
    hideSpinner();
  }
}

async function loadThreadMessages(threadId) {
  const userId = currentUser._id || currentUser.user_id || currentUser.id;
  const container = document.getElementById(`thread-messages-${threadId}`);
  if (!container) return;

  const { ok, data } = await api(
    'GET',
    `/api/messages/thread/${threadId}?userId=${userId}`
  );

  if (!ok || !data.messages) {
    container.innerHTML = '<div class="text-muted-custom">No se pudo cargar la conversación.</div>';
    return;
  }

  container.innerHTML = data.messages.map(m => `
    <div style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
      <div style="font-size:12px;font-weight:600;">
        ${m.isTeacher ? 'Profesor' : escapeHtml(m.sender_nombre || 'Estudiante')}
      </div>
      <div style="font-size:13px;color:var(--text-dim);margin-top:3px;">
        ${escapeHtml(m.contenido)}
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">
        ${formatDate(m.sentAt)}
      </div>
    </div>
  `).join('');
}

async function replyToThread(threadId) {
  const contenido = document.getElementById(`reply-${threadId}`).value.trim();
  if (!contenido) return;

  showSpinner();

  try {
    const senderId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api('POST', '/api/messages/course', {
      courseId: currentCourseId,
      senderId,
      text: contenido,
      threadId
    });

    if (ok) {
      document.getElementById(`reply-${threadId}`).value = '';
      await loadThreadMessages(threadId);
      showAlert('courseDetailAlert', 'Respuesta enviada.', 'success');
    } else {
      showAlert('courseDetailAlert', data.message || 'Error al responder.', 'danger');
    }
  } catch (e) {
    console.error(e);
    showAlert('courseDetailAlert', 'Error de conexión.', 'danger');
  } finally {
    hideSpinner();
  }
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

  const newCode = document.getElementById('cloneCode').value.trim();
  const newName = document.getElementById('cloneName').value.trim();
  const newStartDate = document.getElementById('cloneStart').value;
  const newEndDate = document.getElementById('cloneEnd').value || null;

  const teacherId = currentUser.teacherId || currentUser._id || currentUser.user_id || currentUser.id;

  if (!newCode || !newName || !newStartDate) {
    return showAlert('cloneAlert', 'Completa todos los campos obligatorios.', 'warning');
  }

  if (!teacherId) {
    return showAlert('cloneAlert', 'No se encontró el teacherId. Vuelve a iniciar sesión.', 'danger');
  }

  showSpinner();

  try {
    const { ok, data } = await api('POST', `/api/courses/${currentCourseId}/clone`, {
      teacherId: teacherId,
      newCode: newCode,
      newName: newName,
      newStartDate: newStartDate,
      newEndDate: newEndDate
    });

    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalClone')).hide();
      showAlert('courseDetailAlert', '¡Curso clonado exitosamente!', 'success');
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
  } catch(e) { showAlert('searchAlert', 'Error de conexión.', 'danger'); } finally { hideSpinner(); }
}

async function enrollCourse(courseId) {
  showSpinner();

  try {
    const studentId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api('POST', '/api/enrollments', {
      studentId: studentId,
      courseId: courseId
    });

    if (ok) {
      showAlert('searchAlert', '¡Te has matriculado exitosamente!', 'success');
    } else {
      showAlert('searchAlert', data.message || 'Error al matricularse.', 'danger');
    }
  } catch(e) {
    showAlert('searchAlert', 'Error de conexión.', 'danger');
  } finally {
    hideSpinner();
  }
}

// ===============================================
//  ENROLLED COURSES (STUDENT)
// ===============================================
async function loadEnrolledCourses() {
  if (!currentUser) return;

  showSpinner();

  try {
    const studentId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api('GET', `/api/enrollments/student/${studentId}`);

    if (ok && data.courses) {
      if (!data.courses.length) {
        document.getElementById('enrolledGrid').innerHTML = '<div class="text-muted-custom">No estás matriculado en ningún curso. ¡Explora los cursos disponibles!</div>';
        return;
      }

      document.getElementById('enrolledGrid').innerHTML = data.courses.map(e => renderCourseCard(e, false)).join('');
    }
  } catch(e) {
  } finally {
    hideSpinner();
  }
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
    const userId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api(
      'GET',
      `/api/enrollments/${currentStudentCourseId}/content?userId=${userId}`
    );

    if (ok && data.sections) {
      if (!data.sections.length) {
        document.getElementById('studentSections').innerHTML =
          '<div class="text-muted-custom">Este curso aún no tiene contenido.</div>';
        return;
      }

      document.getElementById('studentSections').innerHTML =
        data.sections.map(s => renderStudentSection(s)).join('');
    } else {
      document.getElementById('studentSections').innerHTML =
        `<div class="text-muted-custom">${data.message || 'No se pudo cargar el contenido.'}</div>`;
    }
  } catch (e) {
    document.getElementById('studentSections').innerHTML =
      '<div class="text-muted-custom">Error de conexión.</div>';
  } finally {
    hideSpinner();
  }
}

function renderStudentSection(section, depth = 0) {
  const title = section.title || section.titulo || 'Sin título';
  const descripcion = section.descripcion || '';
  const contents = section.contents || [];
  const subsections = section.subsections || [];

  return `
    <div class="section-item" style="${depth > 0 ? 'margin-left:' + depth * 20 + 'px;' : ''}">
      <div class="section-title">
        <i class="bi bi-${subsections.length ? 'folder2-open' : 'file-text'}" style="margin-right:8px;color:var(--accent);"></i>
        ${escapeHtml(title)}
      </div>

      ${
        descripcion
          ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${escapeHtml(descripcion)}</div>`
          : ''
      }

      ${contents.map(c => `
        <div style="margin-top:8px;padding:8px 12px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">
          <div class="d-flex align-items-center gap-2">
            <i class="bi ${contentIcon(c.tipo || c.type)}" style="color:var(--accent2);"></i>
            <span style="font-size:13px;">
              ${
                (c.tipo || c.type) === 'texto'
                  ? escapeHtml((c.data?.texto || '').slice(0,100))
                  : escapeHtml(c.data?.nombre_archivo || c.data?.url || c.tipo || c.type)
              }
            </span>
          </div>
        </div>
      `).join('')}

      ${subsections.map(ch => renderStudentSection(ch, depth + 1)).join('')}
    </div>
  `;
}

// ---- STUDENT EVALUATIONS ----
async function loadStudentEvals() {
  const container = document.getElementById('studentEvals');
  container.innerHTML = '<div class="text-muted-custom">Cargando evaluaciones...</div>';

  const studentId = currentUser._id || currentUser.user_id || currentUser.id;

  try {
    const { ok, data } = await api(
      'GET',
      `/api/evaluations/course/${currentStudentCourseId}/student?studentId=${studentId}`
    );

    if (!ok) {
      container.innerHTML = `<div class="text-muted-custom">${data.message || 'No se pudieron cargar las evaluaciones.'}</div>`;
      return;
    }

    const evaluations = data.evaluations || [];

    container.innerHTML = evaluations.length
      ? evaluations.map(e => `
        <div class="card-custom mb-2">
          <div style="font-weight:700;">${escapeHtml(e.title)}</div>
          <div class="text-muted-custom">${escapeHtml(e.descripcion || 'Sin descripción')}</div>
          <div style="font-size:12px;margin-top:8px;">
            Inicio: ${formatDate(e.startDate)} | Fin: ${formatDate(e.endDate)}
          </div>
          <div style="font-size:12px;">Preguntas: ${e.total_preguntas}</div>

          ${
            e.ya_realizada
              ? `<div style="margin-top:10px;font-weight:700;">Nota: ${e.calificacion}% (${e.correctas}/${e.total_preguntas})</div>`
              : e.disponible
                ? `<button class="btn-primary-custom mt-2" style="width:auto;" onclick="openTakeEval('${e.evalId}')">Contestar</button>`
                : `<div class="text-muted-custom mt-2">No disponible en este momento.</div>`
          }
        </div>
      `).join('')
      : '<div class="text-muted-custom">No hay evaluaciones disponibles.</div>';

  } catch (e) {
    container.innerHTML = '<div class="text-muted-custom">Error de conexión.</div>';
  }
}

async function loadClassmates() {
  if (!currentStudentCourseId || !currentUser) return;

  showSpinner();

  try {
    const userId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api(
      'GET',
      `/api/social/courses/${currentStudentCourseId}/mates?userId=${userId}`
    );

    const mates = data.coursemates || data.classmates || [];

    if (ok) {
      document.getElementById('classmatesList').innerHTML = mates.length
        ? mates.map(u => `<div class="friend-card">
            <div class="friend-avatar">${getInitials(u.fullName || u.nombre || u.username)}</div>
            <div>
              <div class="friend-name">${u.fullName || u.nombre || u.nombre_completo || '—'}</div>
              <div class="friend-username">@${u.username || '—'}</div>
            </div>
          </div>`).join('')
        : '<div class="text-muted-custom">No hay otros compañeros en este curso.</div>';
    } else {
      document.getElementById('classmatesList').innerHTML =
        `<div class="text-muted-custom">${data.message || 'Error al cargar compañeros.'}</div>`;
    }
  } catch (e) {
    document.getElementById('classmatesList').innerHTML =
      '<div class="text-muted-custom">Error de conexión.</div>';
  } finally {
    hideSpinner();
  }
}

async function loadStudentQueries() {
  if (!currentStudentCourseId) return;

  try {
    const userId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api(
      'GET',
      `/api/messages/course/${currentStudentCourseId}/threads?userId=${userId}`
    );

    if (!ok || !data.threads || data.threads.length === 0) {
      document.getElementById('queryThreadsList').innerHTML =
        '<div class="text-muted-custom">No tienes consultas enviadas.</div>';
      return;
    }

    document.getElementById('queryThreadsList').innerHTML = data.threads.map(t => {
      const lastText = t.lastMessage?.contenido || t.subject || 'Sin contenido';
      const lastDate = t.lastMessage?.sentAt || t.updatedAt || t.createdAt;

      return `
        <div class="card-custom mb-2">
          <div style="font-size:13px;color:var(--text-dim);">
            ${escapeHtml(lastText)}
          </div>

          <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:6px;">
            ${formatDate(lastDate)} | Estado: ${escapeHtml(t.status || 'open')}
          </div>

          <div id="thread-messages-${t._id}" class="mt-3"></div>

          <button class="btn-outline-custom mt-2" style="padding:6px 14px;font-size:12px;" onclick="loadThreadMessages('${t._id}')">
            <i class="bi bi-eye"></i> Ver respuesta
          </button>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error(e);
    document.getElementById('queryThreadsList').innerHTML =
      '<div class="text-muted-custom">Error al cargar consultas.</div>';
  }
}

async function sendQuery() {
  const contenido = document.getElementById('newQueryText').value.trim();
  if (!contenido) return;

  showSpinner();

  try {
    const senderId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api('POST', '/api/messages/course', {
      courseId: currentStudentCourseId,
      senderId,
      text: contenido
    });

    if (ok) {
      document.getElementById('newQueryText').value = '';
      await loadStudentQueries();
    } else {
      alert(data.message || 'Error al enviar consulta.');
    }
  } catch (e) {
    console.error(e);
    alert('Error de conexión.');
  } finally {
    hideSpinner();
  }
}


async function openTakeEval(evalId) {
  currentEvalId = evalId;
  clearAlert('takeEvalAlert');

  const studentId = currentUser._id || currentUser.user_id || currentUser.id;

  try {
    const { es, data } = await api(
      'GET',
      `/api/evaluations/${evalId}/take?studentId=${studentId}`
    );

    if (!es) {
      showAlert('takeEvalAlert', data.message || 'No se pudo abrir la evaluación.', 'danger');
      return;
    }

    const evaluation = data.evaluation;

    document.getElementById('takeEvalTitle').textContent = evaluation.title;

    document.getElementById('takeEvalQuestions').innerHTML = evaluation.preguntas.map((q, idx) => `
      <div class="question-block">
        <div style="font-weight:700;margin-bottom:8px;">${idx + 1}. ${escapeHtml(q.text)}</div>

        ${q.options.map(o => `
          <label class="option-row" style="cursor:pointer;">
            <input type="radio" name="answer-${q.questionId}" value="${o.optionId}" class="option-radio">
            <span>${escapeHtml(o.text)}</span>
          </label>
        `).join('')}
      </div>
    `).join('');

    new bootstrap.Modal(document.getElementById('modalTakeEval')).show();

  } catch (e) {
    showAlert('takeEvalAlert', 'Error de conexión.', 'danger');
  }
}

async function submitEval() {
  clearAlert('takeEvalAlert');

  const answers = [];
  const questionBlocks = document.querySelectorAll('#takeEvalQuestions .question-block');

  questionBlocks.forEach(block => {
    const radio = block.querySelector('input[type="radio"]:checked');

    if (radio) {
      const questionId = radio.name.replace('answer-', '');
      answers.push({
        questionId,
        selectedOptionId: radio.value
      });
    }
  });

  if (answers.length !== questionBlocks.length) {
    return showAlert('takeEvalAlert', 'Debes responder todas las preguntas.', 'warning');
  }

  const studentId = currentUser._id || currentUser.user_id || currentUser.id;

  try {
    const { ok, data } = await api(
      'POST',
      `/api/evaluations/${currentEvalId}/submit`,
      {
        studentId,
        answers
      }
    );

    if (ok) {
      bootstrap.Modal.getInstance(document.getElementById('modalTakeEval')).hide();
      await loadStudentEvals();
      alert(data.message);
    } else {
      showAlert('takeEvalAlert', data.message || 'No se pudo entregar la evaluación.', 'danger');
    }

  } catch (e) {
    showAlert('takeEvalAlert', 'Error de conexión.', 'danger');
  }
}

window.openTakeEval = openTakeEval;
window.submitEval = submitEval;


// ===============================================
//  SOCIAL — FRIENDS
// ===============================================
async function searchUsers() {
  const q = document.getElementById('searchUserQuery').value.trim();
  if (!q) return;

  showSpinner();

  try {
    const { ok, data } = await api('GET', `/api/social/users/search?q=${encodeURIComponent(q)}`);

    if (ok && data.users) {
      document.getElementById('userSearchResults').innerHTML = data.users.length
        ? data.users.map(u => {
            const userId = u.userId || u.user_id || u._id || u.id;
            const name = u.fullName || u.nombre || u.nombre_completo || u.username || '—';

            return `<div class="friend-card">
              <div class="friend-avatar">${getInitials(name)}</div>
              <div style="flex:1;">
                <div class="friend-name">${name}</div>
                <div class="friend-username">@${u.username || '—'}</div>
              </div>
              <button class="btn-outline-custom" style="padding:5px 12px;font-size:11px;" onclick="sendFriendRequest('${userId}')">
                <i class="bi bi-person-plus"></i>
              </button>
            </div>`;
          }).join('')
        : '<div class="text-muted-custom">No se encontraron usuarios.</div>';
    }
  } catch(e) {
    console.error(e);
  } finally {
    hideSpinner();
  }
}

async function sendFriendRequest(userId) {
  const requesterId = currentUser._id || currentUser.user_id || currentUser.id;
  const targetId = userId;

  if (!requesterId || !targetId || targetId === 'undefined') {
    return alert('No se encontró el usuario actual o el usuario destino.');
  }

  showSpinner();

  try {
    const { ok, data } = await api('POST', '/api/social/friends/request', {
      requesterId: requesterId,
      targetId: targetId
    });

    if (ok) alert('Solicitud de amistad enviada.');
    else alert(data.message || 'Error al enviar solicitud.');
  } catch(e) {
    alert('Error de conexión.');
  } finally {
    hideSpinner();
  }
}

function renderPendingRequests(requests) {
  const container = document.getElementById('friendRequestsList');
  if (!container) return;

  container.innerHTML = requests.length
    ? requests.map(r => {
        const requesterId = r.userId || r.user_id || r._id || r.id;
        const name = r.fullName || r.nombre || r.nombre_completo || r.username || '—';

        return `<div class="friend-card">
          <div class="friend-avatar">${getInitials(name)}</div>
          <div style="flex:1;">
            <div class="friend-name">${name}</div>
            <div class="friend-username">@${r.username || '—'}</div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn-outline-custom" onclick="respondFriendRequest('${requesterId}', 'accept')">Aceptar</button>
            <button class="btn-outline-custom" onclick="respondFriendRequest('${requesterId}', 'reject')">Rechazar</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="text-muted-custom">No tienes solicitudes pendientes.</div>';
}

async function loadFriends() {
  if (!currentUser) return;

  const userId = currentUser._id || currentUser.user_id || currentUser.id;

  showSpinner();

  try {
    const { ok, data } = await api('GET', `/api/social/friends/${userId}`);

    if (ok && data.friends) {
      renderPendingRequests(data.pendingRequests || []);

      document.getElementById('friendsList').innerHTML = data.friends.length
        ? data.friends.map(f => {
            const friendId = f.userId || f.user_id || f._id || f.id;
            const name = f.fullName || f.nombre || f.nombre_completo || f.username || '—';

            return `<div class="friend-card">
              <div class="friend-avatar">${getInitials(name)}</div>
              <div style="flex:1;">
                <div class="friend-name">${name}</div>
                <div class="friend-username">@${f.username || '—'}</div>
              </div>
              <div class="d-flex gap-2">
                <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="viewFriendCourses('${friendId}','${name}')"><i class="bi bi-mortarboard"></i></button>
                <button class="btn-outline-custom" style="padding:5px 10px;font-size:11px;" onclick="openConversation('${friendId}','${name}')"><i class="bi bi-chat"></i></button>
              </div>
            </div>`;
          }).join('')
        : '<div class="text-muted-custom">No tienes amigos aún. ¡Busca y agrega compañeros!</div>';

      document.getElementById('statFriends').textContent = data.friends.length;
    }
  } catch (e) {
    console.error(e);
  } finally {
    hideSpinner();
  }
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
            <td class="mono" style="font-size:12px;">${c.codigo||'—'}</td><td>${c.nombre||'—'}</td>
            <td><span class="course-card-badge badge-${c.estado==='activo'?'active':'ended'}">${c.estado}</span></td>
          </tr>`).join('')}</tbody></table>`
        : '<div class="text-muted-custom">Este usuario no tiene cursos.</div>';
      new bootstrap.Modal(document.getElementById('modalFriendCourses')).show();
    }
  } catch(e) {} finally { hideSpinner(); }
}



async function respondFriendRequest(requesterId, action) {
  const userId = currentUser._id || currentUser.user_id || currentUser.id;

  if (!requesterId || requesterId === 'undefined' || !userId) {
    return alert('No se encontró la solicitud o el usuario actual.');
  }

  showSpinner();

  try {
    const { ok, data } = await api('PATCH', `/api/social/friends/request/${requesterId}`, {
      userId: userId,
      action: action
    });

    if (ok) {
      alert(action === 'accept' ? 'Solicitud aceptada.' : 'Solicitud rechazada.');
      loadFriends();
    } else {
      alert(data.message || 'Error al responder solicitud.');
    }
  } catch(e) {
    alert('Error de conexión.');
  } finally {
    hideSpinner();
  }
}

// ===============================================
//  DIRECT MESSAGES
// ===============================================
async function loadConversations() {
  if (!currentUser) return;

  const userId = currentUser._id || currentUser.user_id || currentUser.id;

  showSpinner();

  try {
    const { ok, data } = await api('GET', `/api/messages/conversations/${userId}`);

    if (ok && data.conversations) {
      document.getElementById('conversationsList').innerHTML = data.conversations.length
        ? data.conversations.map(c => {
            const other = c.otherUser || c;
            const otherUserId = other.userId || other.user_id || other._id || other.id;
            const name = other.fullName || other.nombre || other.nombre_completo || other.username || '—';

            return `<div class="friend-card" onclick="openConversation('${otherUserId}','${name}')">
              <div class="friend-avatar" style="width:36px;height:36px;font-size:13px;">${getInitials(name)}</div>
              <div style="flex:1;min-width:0;">
                <div class="friend-name" style="font-size:13px;">${name}</div>
                <div class="friend-username" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.preview || ''}</div>
              </div>
            </div>`;
          }).join('')
        : '<div class="text-muted-custom" style="font-size:13px;">Sin conversaciones</div>';

      document.getElementById('statMessages').textContent = data.conversations.length;
    }
  } catch(e) {
    console.error(e);
  } finally {
    hideSpinner();
  }
}


async function openConversationByUsername() {
  const username = document.getElementById('newMsgUsername').value.trim();

  if (!username) {
    return alert('Ingrese el username del usuario.');
  }

  showSpinner();

  try {
    const { ok, data } = await api(
      'GET',
      `/api/social/users/search?q=${encodeURIComponent(username)}`
    );

    if (!ok || !data.users || data.users.length === 0) {
      return alert('No se encontró ningún usuario con ese username.');
    }

    const user = data.users.find(u => 
      u.username && u.username.toLowerCase() === username.toLowerCase()
    ) || data.users[0];

    const userId = user.userId || user.user_id || user._id || user.id;
    const name = user.fullName || user.nombre || user.nombre_completo || user.username;

    if (!userId) {
      return alert('No se pudo obtener el ID del usuario encontrado.');
    }

    await openConversation(userId, name);

  } catch (e) {
    console.error(e);
    alert('Error al buscar el usuario.');
  } finally {
    hideSpinner();
  }
}


async function openConversation(userId, name) {
  if (!userId || userId === 'undefined') {
    return alert('No se encontró el ID del usuario.');
  }

  if (userId.length < 20) {
    return alert('Error: se está usando el username en lugar del ID del usuario.');
  }

  currentChatUserId = userId;

  document.getElementById('chatWithName').textContent = name || userId;
  document.getElementById('chatWithId').textContent = userId;
  document.getElementById('chatAvatarInitial').textContent = getInitials(name || '?');
  document.getElementById('chatPanel').style.display = 'block';
  document.getElementById('chatPlaceholder').style.display = 'none';

  if (!document.getElementById('page-messages').classList.contains('active')) {
    showPage('page-messages');
  }

  await loadDirectMessages();
}

async function loadDirectMessages() {
  if (!currentChatUserId || !currentUser) return;

  try {
    const myId = currentUser._id || currentUser.user_id || currentUser.id;

    const { ok, data } = await api('GET', `/api/messages/direct/${myId}/${currentChatUserId}`);

    if (ok && data.messages) {
      const win = document.getElementById('chatMessages');

      win.innerHTML = data.messages.map(m => {
        const isSent = m.senderId === myId;

        return `<div>
          <div class="message-bubble ${isSent ? 'sent' : 'received'}">${m.contenido}</div>
          <div class="message-meta" style="${isSent ? 'text-align:right;' : ''}">${formatDate(m.sentAt)}</div>
        </div>`;
      }).join('') || '<div class="text-muted-custom" style="text-align:center;margin-top:40px;">Inicia la conversación</div>';

      win.scrollTop = win.scrollHeight;
    }
  } catch(e) {
    console.error(e);
  }
}

async function sendDirectMessage() {
  const text = document.getElementById('msgInput').value.trim();
  if (!text || !currentChatUserId) return;

  const senderId = currentUser._id || currentUser.user_id || currentUser.id;
  const recipientId = currentChatUserId;

  showSpinner();

  try {
    const { ok, data } = await api('POST', '/api/messages/direct', {
      senderId: senderId,
      recipientId: recipientId,
      text: text
    });

    if (ok) {
      document.getElementById('msgInput').value = '';
      await loadDirectMessages();
      await loadConversations();
    } else {
      alert(data.message || 'Error al enviar mensaje.');
    }
  } catch(e) {
    alert('Error de conexión.');
  } finally {
    hideSpinner();
  }
}

// ===============================================
//  PASSWORD
// ===============================================
async function changePassword() {
  clearAlert('pwChangeAlert');

  const currentPassword = document.getElementById('pwCurrent').value;
  const newPassword = document.getElementById('pwNew').value;
  const confirm = document.getElementById('pwConfirm').value;

  if (!currentPassword || !newPassword || !confirm) {
    return showAlert('pwChangeAlert', 'Completa todos los campos.', 'warning');
  }

  if (newPassword !== confirm) {
    return showAlert('pwChangeAlert', 'Las contraseñas nuevas no coinciden.', 'danger');
  }

  if (newPassword.length < 8) {
    return showAlert('pwChangeAlert', 'La nueva contraseña debe tener al menos 8 caracteres.', 'warning');
  }

  const userId = currentUser._id || currentUser.user_id || currentUser.id;

  showSpinner();

  try {
    const { ok, data } = await api('PUT', '/api/password/change', {
      userId,
      currentPassword,
      newPassword
    });

    if (ok) {
      showAlert('pwChangeAlert', '¡Contraseña actualizada exitosamente!', 'success');

      document.getElementById('pwCurrent').value = '';
      document.getElementById('pwNew').value = '';
      document.getElementById('pwConfirm').value = '';
    } else {
      showAlert('pwChangeAlert', data.message || 'Error al cambiar contraseña.', 'danger');
    }

  } catch (e) {
    console.error(e);
    showAlert('pwChangeAlert', 'Error de conexión.', 'danger');
  } finally {
    hideSpinner();
  }
}

window.changePassword = changePassword;

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
        ['Acción', 'Entidad', 'Resultado', 'IP', 'Fecha'],
        data.events.map(e => [e.accion||'—', e.entidad||'—', e.resultado||'—', e.ip||'—', formatDate(e.timestamp)])
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
        ['Usuario', 'Acción', 'Entidad', 'Resultado', 'IP', 'Fecha'],
        data.logs.map(l => [l.user_id||'—', l.accion||'—', l.entidad||'—', l.resultado||'—', l.ip||'—', formatDate(l.timestamp)])
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

window.loadThreadMessages = loadThreadMessages;
window.replyToThread = replyToThread;
window.sendQuery = sendQuery;
