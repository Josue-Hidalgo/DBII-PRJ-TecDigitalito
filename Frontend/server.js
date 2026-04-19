const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

// ── importar funcionalidades ──────────────────────────────────────────────────
const { registerUser }        = require("../Backend/src/controllers/Register");
const { login }               = require("../Backend/src/controllers/Login");
const { logout, requireAuth, invalidateAllSessions } = require("../Backend/src/controllers/Session");
const { requestPasswordReset, resetPassword, changePassword } = require("../Backend/src/controllers/Password");
const { getUserSessionLog, getRecentActivityLog, getAuditLog } = require("../Backend/src/controllers/ActivityLog");
const { createCourse, addSection, addContentToSection, publishCourse, getEnrolledStudents, getTeacherCourses, cloneCourse } = require("../Backend/src/controllers/CourseManagement");
const { searchPublishedCourses, enrollInCourse, getStudentCourses, getCourseContent, getCoursemates } = require("../Backend/src/controllers/StudentCourses");
const { createEvaluation, submitEvaluation, getStudentEvalResults, getEvaluationResults } = require("../Backend/src/controllers/Evaluations");
const { sendCourseQuery, getCourseThreads, getThreadMessages, sendDirectMessage, getDirectMessages, getConversations } = require("../Backend/src/controllers/Messages");
const { searchUsers, sendFriendRequest, acceptFriendRequest, getFriends, getFriendCourses, getPendingFriendRequests } = require("../Backend/src/controllers/Social");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ── helper: leer sesión desde cookie o header ─────────────────────────────────
async function getSession(req) {
  const token = req.cookies?.session || req.headers["x-session-token"];
  if (!token) throw new Error("No autenticado");
  return await requireAuth(token);
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try { res.json(await registerUser(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const ip = req.ip;
    const userAgent = req.headers["user-agent"] || "unknown";
    const result = await login({ ...req.body, ip, userAgent });
    if (result.success && result.sessionToken) {
      const maxAge = result.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      res.cookie("session", result.sessionToken, { httpOnly: true, secure: false, maxAge });
    }
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const token = req.cookies?.session || req.headers["x-session-token"];
    await logout({ sessionToken: token, ip: req.ip, userAgent: req.headers["user-agent"] || "" });
    res.clearCookie("session");
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/reset-request",  async (req, res) => {
  try { res.json(await requestPasswordReset(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try { res.json(await resetPassword(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/change-password", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await changePassword({ ...req.body, userId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/auth/me", async (req, res) => {
  try { res.json(await getSession(req)); }
  catch (e) { res.status(401).json({ error: e.message }); }
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
app.get("/api/admin/activity", async (req, res) => {
  try {
    await getSession(req);
    res.json(await getRecentActivityLog({ limit: 100 }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/admin/audit", async (req, res) => {
  try {
    await getSession(req);
    res.json(await getAuditLog({ limit: 100 }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// ── CURSOS (docente) ──────────────────────────────────────────────────────────
app.post("/api/courses", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await createCourse({ ...req.body, teacherId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/courses/mine", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getTeacherCourses({ teacherId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post("/api/courses/:courseId/publish", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await publishCourse({ courseId: req.params.courseId, teacherId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/courses/:courseId/clone", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await cloneCourse({ ...req.body, originalCourseId: req.params.courseId, teacherId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/courses/:courseId/students", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getEnrolledStudents({ courseId: req.params.courseId, teacherId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post("/api/courses/:courseId/sections", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await addSection({ ...req.body, courseId: req.params.courseId, teacherId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/courses/:courseId/sections/:sectionId/content", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await addContentToSection({ ...req.body, courseId: req.params.courseId, sectionId: req.params.sectionId, teacherId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── CURSOS (estudiante) ───────────────────────────────────────────────────────
app.get("/api/courses/search", async (req, res) => {
  try {
    const { query = "", page = 1 } = req.query;
    res.json(await searchPublishedCourses({ query, page: Number(page) }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/courses/enrolled", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getStudentCourses({ studentId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post("/api/courses/:courseId/enroll", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await enrollInCourse({ studentId: session.userId, courseId: req.params.courseId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/courses/:courseId/content", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getCourseContent({ studentId: session.userId, courseId: req.params.courseId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/courses/:courseId/coursemates", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getCoursemates({ studentId: session.userId, courseId: req.params.courseId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// ── EVALUACIONES ──────────────────────────────────────────────────────────────
app.post("/api/courses/:courseId/evaluations", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await createEvaluation({ ...req.body, courseId: req.params.courseId, teacherId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/evaluations/:evalId/submit", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await submitEvaluation({ ...req.body, evalId: req.params.evalId, studentId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/courses/:courseId/my-results", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getStudentEvalResults({ studentId: session.userId, courseId: req.params.courseId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// ── MENSAJES ──────────────────────────────────────────────────────────────────
app.post("/api/courses/:courseId/queries", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await sendCourseQuery({ ...req.body, courseId: req.params.courseId, senderId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/courses/:courseId/queries", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getCourseThreads({ courseId: req.params.courseId, userId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/threads/:threadId/messages", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getThreadMessages({ threadId: req.params.threadId, userId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post("/api/messages/direct", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await sendDirectMessage({ ...req.body, senderId: session.userId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/messages/conversations", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getConversations({ userId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/messages/direct/:otherUserId", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getDirectMessages({ userId: session.userId, otherUserId: req.params.otherUserId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// ── SOCIAL ────────────────────────────────────────────────────────────────────
app.get("/api/users/search", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await searchUsers({ query: req.query.q || "", requesterId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post("/api/friends/request", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await sendFriendRequest({ requesterId: session.userId, targetId: req.body.targetId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/friends/accept", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await acceptFriendRequest({ userId: session.userId, requesterId: req.body.requesterId }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/friends", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getFriends({ userId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/friends/requests", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getPendingFriendRequests({ userId: session.userId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/friends/:friendId/courses", async (req, res) => {
  try {
    const session = await getSession(req);
    res.json(await getFriendCourses({ userId: session.userId, friendId: req.params.friendId }));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// ── iniciar servidor ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`TEC Digitalito corriendo en http://localhost:${PORT}`));